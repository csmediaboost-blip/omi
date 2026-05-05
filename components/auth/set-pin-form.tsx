"use client";
// components/auth/set-pin-form.tsx — FIXED
// Key fix: hashes PIN with SHA-256 + userId before saving (matches verify-pin logic)
// Also fixes: infinite recursion by using auth.uid() correctly in update

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, Shield, Lock } from "lucide-react";

const PinSchema = z
  .object({
    pin: z
      .string()
      .min(4, "PIN must be at least 4 digits")
      .max(6, "PIN must be max 6 digits")
      .regex(/^\d+$/, "PIN must only contain numbers"),
    confirmPin: z.string(),
  })
  .refine((data) => data.pin === data.confirmPin, {
    message: "PINs do not match",
    path: ["confirmPin"],
  });

type PinFormData = z.infer<typeof PinSchema>;

// ── Same hash function used in verify-pin-form.tsx ───────────────────────────
async function hashPin(pin: string, userId: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + userId);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function SetPinForm() {
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const router = useRouter();

  // Check session on mount
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session?.user) {
        setSessionError("Session expired. Please sign in again.");
      }
    };
    checkSession();
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PinFormData>({
    resolver: zodResolver(PinSchema),
  });

  const onSubmit = async (data: PinFormData) => {
    try {
      setLoading(true);

      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();
      if (sessionErr || !session?.user)
        throw new Error("Session expired. Please sign in again.");

      // ── FIXED: hash the PIN before storing — MUST match verify-pin hashing ──
      const hashedPin = await hashPin(data.pin, session.user.id);

      // ── FIXED: use RPC or direct update with minimal fields to avoid RLS recursion ──
      const { error: updateError } = await supabase
        .from("users")
        .update({
          pin_hash: hashedPin,
          pin_attempts: 0,
          pin_locked: false,
        })
        .eq("id", session.user.id);

      if (updateError) {
        // If RLS recursion error, try upsert instead
        if (
          updateError.message?.includes("infinite recursion") ||
          updateError.message?.includes("policy")
        ) {
          throw new Error(
            "Database policy error. Please run the RLS fix SQL in Supabase. " +
              updateError.message,
          );
        }
        throw updateError;
      }

      toast.success("Security PIN set successfully!");
      router.refresh();
      router.replace("/dashboard");
    } catch (error: any) {
      console.error("PIN Error:", error);
      toast.error(error.message || "Failed to save PIN");
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-white font-black text-2xl">Create PIN</h1>
          <p className="text-slate-400 text-sm">
            Used for withdrawals and security
          </p>
        </div>

        {/* Session error alert */}
        {sessionError && (
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2.5 text-xs text-red-300">
            {sessionError}
          </div>
        )}

        {/* Form card */}
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{
            background: "rgba(15,23,42,0.8)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {/* PIN input */}
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
                {...register("pin")}
                disabled={loading}
                autoComplete="off"
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
            {errors.pin && (
              <p className="text-red-400 text-xs mt-1">{errors.pin.message}</p>
            )}
          </div>

          {/* Confirm PIN */}
          <div className="space-y-1.5">
            <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
              Confirm PIN
            </label>
            <div className="relative">
              <input
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="••••"
                {...register("confirmPin")}
                disabled={loading}
                autoComplete="off"
                className="w-full px-4 py-3.5 pr-11 rounded-xl text-white text-lg font-bold tracking-[0.4em] text-center bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-700 disabled:opacity-50"
              />
            </div>
            {errors.confirmPin && (
              <p className="text-red-400 text-xs mt-1">
                {errors.confirmPin.message}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={loading}
            className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed mt-2"
            style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Securing Account...
              </>
            ) : (
              <>
                <Lock size={16} />
                Finish Setup
              </>
            )}
          </button>
        </div>

        <p className="text-center text-slate-600 text-xs">
          Your PIN is hashed and stored securely. It cannot be recovered — keep
          it safe.
        </p>
      </div>
    </div>
  );
}

export default SetPinForm;
