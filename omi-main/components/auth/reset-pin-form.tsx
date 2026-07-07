"use client";
// components/auth/reset-pin-form.tsx — FIXED (forgot-PIN flow)
//
// KEY CHANGE: no longer asks for the current PIN. A user who forgot
// their PIN cannot supply it — that was the reported bug. Identity is now
// verified by re-authenticating with the account password instead
// (swap for an email-OTP step if you'd rather not require the password).
//
// If you ALSO need a "change PIN while logged in and PIN is known" flow,
// keep a separate component for that (your original version) and use
// this one only behind "Forgot PIN?".

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, Shield, Lock } from "lucide-react";

const ResetPinSchema = z
  .object({
    password: z.string().min(1, "Enter your account password to confirm it's you"),
    newPin: z
      .string()
      .min(4, "PIN must be at least 4 digits")
      .max(6, "PIN must be max 6 digits")
      .regex(/^\d+$/, "PIN must only contain numbers"),
    confirmPin: z.string(),
  })
  .refine((data) => data.newPin === data.confirmPin, {
    message: "PINs do not match",
    path: ["confirmPin"],
  });

type ResetPinData = z.infer<typeof ResetPinSchema>;

async function hashPin(pin: string, userId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + userId);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function ResetPinForm() {
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (error || !session?.user?.email) {
        setSessionError("Session expired. Please sign in again.");
        return;
      }
      setUserEmail(session.user.email);
    };
    checkSession();
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPinData>({
    resolver: zodResolver(ResetPinSchema),
  });

  const onSubmit = async (data: ResetPinData) => {
    setLoading(true);
    try {
      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();
      if (sessionErr || !session?.user || !session.user.email) {
        throw new Error("Session expired. Please sign in again.");
      }

      // Re-authenticate with the account password. This is the identity
      // check that replaces "enter your current PIN" — it works even if
      // the user has completely forgotten their PIN.
      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: data.password,
      });
      if (reauthErr) {
        throw new Error("Password is incorrect.");
      }

      const newHash = await hashPin(data.newPin, session.user.id);

      const { error: updateError } = await supabase
        .from("users")
        .update({
          pin_hash: newHash,
          pin_attempts: 0,
          pin_locked: false,
        })
        .eq("id", session.user.id);

      if (updateError) {
        console.error("PIN update error:", updateError);
        throw new Error(
          updateError.message || "Failed to update PIN. Please try again."
        );
      }

      toast.success("PIN updated successfully!");
      router.push("/dashboard");
    } catch (error: any) {
      console.error("Reset PIN error:", error);
      toast.error(error?.message || "Failed to update PIN");
    } finally {
      setLoading(false);
    }
  };

  if (sessionError) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: "#030712" }}
      >
        <div className="w-full max-w-sm text-center">
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg px-4 py-3 text-red-300">
            {sessionError}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "#030712" }}
    >
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{
              background: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.25)",
            }}
          >
            <Shield size={28} className="text-emerald-400" />
          </div>
          <h1 className="text-white font-black text-2xl">Reset PIN</h1>
          <p className="text-slate-400 text-sm">
            {userEmail
              ? `Confirm your password for ${userEmail}, then set a new PIN`
              : "Confirm your password, then set a new PIN"}
          </p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="rounded-2xl p-6 space-y-4"
          style={{
            background: "rgba(15,23,42,0.8)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {/* Account password (replaces "current PIN") */}
          <div className="space-y-1.5">
            <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
              Account Password
            </label>
            <input
              type="password"
              placeholder="Your account password"
              {...register("password")}
              disabled={loading}
              className="w-full px-4 py-3.5 rounded-xl text-white text-sm bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-600 disabled:opacity-50"
            />
            {errors.password && (
              <p className="text-red-400 text-xs mt-1">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* New PIN */}
          <div className="space-y-1.5">
            <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
              New PIN (4–6 digits)
            </label>
            <div className="relative">
              <input
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="••••"
                {...register("newPin")}
                disabled={loading}
                className="w-full px-4 py-3.5 pr-11 rounded-xl text-white text-lg font-bold tracking-[0.4em] text-center bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-700 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
              >
                {showPin ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {errors.newPin && (
              <p className="text-red-400 text-xs mt-1">
                {errors.newPin.message}
              </p>
            )}
          </div>

          {/* Confirm New PIN */}
          <div className="space-y-1.5">
            <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
              Confirm New PIN
            </label>
            <input
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="••••"
              {...register("confirmPin")}
              disabled={loading}
              className="w-full px-4 py-3.5 rounded-xl text-white text-lg font-bold tracking-[0.4em] text-center bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-700 disabled:opacity-50"
            />
            {errors.confirmPin && (
              <p className="text-red-400 text-xs mt-1">
                {errors.confirmPin.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed mt-2"
            style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Updating PIN...
              </>
            ) : (
              <>
                <Lock size={16} />
                Update PIN
              </>
            )}
          </button>
        </form>

        <p className="text-center text-slate-600 text-xs">
          Your PIN is hashed and stored securely.
        </p>
      </div>
    </div>
  );
}

export default ResetPinForm;

/*
  SECURITY NOTE: pin_hash comparisons/updates going through the browser
  Supabase client (as in the original file) mean the anon key + RLS are
  your only protection. For real security, move PIN verification and
  update into a Supabase Edge Function (service-role key, never exposed
  to the client) and call that function from here via fetch/invoke
  instead of touching the `users` table directly. Also confirm your RLS
  policy does NOT allow SELECT on pin_hash from the client — the old
  code depended on being able to read it, which a correctly locked-down
  policy would silently block.
*/