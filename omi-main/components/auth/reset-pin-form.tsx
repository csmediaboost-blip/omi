"use client";
// components/auth/reset-pin-form.tsx
// Allows users to change/reset their PIN after verification

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
    currentPin: z
      .string()
      .min(4, "PIN must be at least 4 digits")
      .regex(/^\d+$/, "PIN must only contain numbers"),
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
  })
  .refine((data) => data.currentPin !== data.newPin, {
    message: "New PIN must be different from current PIN",
    path: ["newPin"],
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
  const router = useRouter();

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
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
  } = useForm<ResetPinData>({
    resolver: zodResolver(ResetPinSchema),
  });

  const onSubmit = async (data: ResetPinData) => {
    try {
      setLoading(true);

      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();
      if (sessionErr || !session?.user)
        throw new Error("Session expired. Please sign in again.");

      // Get stored PIN hash
      const { data: userData, error: userErr } = await supabase
        .from("users")
        .select("pin_hash")
        .eq("id", session.user.id)
        .single();

      if (userErr || !userData)
        throw new Error("Failed to retrieve current PIN.");

      // Verify current PIN
      const currentHash = await hashPin(data.currentPin, session.user.id);
      if (currentHash !== userData.pin_hash) {
        throw new Error("Current PIN is incorrect.");
      }

      // Hash new PIN
      const newHash = await hashPin(data.newPin, session.user.id);

      // Update PIN in database
      const { error: updateError } = await supabase
        .from("users")
        .update({
          pin_hash: newHash,
          pin_attempts: 0,
          pin_locked: false,
        })
        .eq("id", session.user.id);

      if (updateError) {
        throw updateError;
      }

      toast.success("PIN updated successfully!");
      router.push("/dashboard");
    } catch (error: any) {
      console.error("Reset PIN error:", error);
      toast.error(error.message || "Failed to update PIN");
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
          <h1 className="text-white font-black text-2xl">Update PIN</h1>
          <p className="text-slate-400 text-sm">
            Change your security PIN
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
          {/* Current PIN */}
          <div className="space-y-1.5">
            <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
              Current PIN
            </label>
            <div className="relative">
              <input
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="••••"
                {...register("currentPin")}
                disabled={loading}
                className="w-full px-4 py-3.5 rounded-xl text-white text-lg font-bold tracking-[0.4em] text-center bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-700 disabled:opacity-50"
              />
            </div>
            {errors.currentPin && (
              <p className="text-red-400 text-xs mt-1">
                {errors.currentPin.message}
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
            <div className="relative">
              <input
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="••••"
                {...register("confirmPin")}
                disabled={loading}
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
