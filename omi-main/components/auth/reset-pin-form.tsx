"use client";
// components/auth/reset-pin-form.tsx — FIXED (v2: routes through our own API)
//
// HISTORY:
// v1 asked for the account password instead of the (forgotten) current
// PIN, and raced the Supabase calls against a client-side timeout.
// v2: the reauth + PIN write now goes through our own same-origin API
// route (/api/auth/update-pin) instead of hitting *.supabase.co directly
// from the browser. This sidesteps in-app-browser/WebView environments
// (e.g. links opened inside Facebook/Messenger) that can block or
// swallow the *response* of a cross-origin request even though the
// request itself lands — which is what produced "it changed but the UI
// never stopped spinning." It also moves the pin_hash write to the
// service-role key on the server instead of anon key + RLS.

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

// Fetch with a hard client-side timeout via AbortController.
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
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

      if (sessionErr || !session?.access_token) {
        throw new Error("Session expired. Please sign in again.");
      }

      // Same-origin call to our own API route instead of hitting
      // *.supabase.co directly from the client — see comment at top.
      const res = await fetchWithTimeout(
        "/api/auth/update-pin",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: session.access_token,
            password: data.password,
            newPin: data.newPin,
          }),
        },
        15_000,
      );

      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(result?.error || "Failed to update PIN");
      }

      toast.success("PIN updated successfully!");
      router.push("/dashboard");
    } catch (error: any) {
      const msg =
        error?.name === "AbortError"
          ? "This is taking unusually long. If you don't see a confirmation shortly, your PIN may have already changed — try signing in with the new one."
          : error?.message || "Failed to update PIN";
      console.error("Reset PIN error:", error);
      toast.error(msg);
    } finally {
      // Always runs, even on timeout/abort — this is what stops the
      // button from spinning forever.
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