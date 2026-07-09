"use client";
// components/auth/reset-password-form.tsx — FIXED
// - Wrapped in a real <form> (Enter-to-submit works, no dead-click surface)
// - Requires <Toaster /> in root layout (see note at bottom)
// - Adds defensive logging so failures are visible instead of silently hanging
// - NEW: supabase.auth.resetPasswordForEmail() had no timeout. If that call
//   (or a backend hook chained after it, e.g. the Resend email send) stalls,
//   the awaited promise never settles, so `loading` never flips back to
//   false and the button spins forever — same root cause as the
//   update-password hang. Fixed by racing the call against a local 10s
//   timeout, scoped to just this component.

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PasswordResetSchema, PasswordResetData } from "@/lib/validators";
import { toast } from "sonner";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { AuthError } from "@supabase/supabase-js";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";

// Wrap any promise with a timeout so a stalled network request always
// resolves into a catchable error instead of hanging the UI forever.
// Scoped locally to this component — does not touch the global supabase
// client config, so it can't affect anything else (e.g. file uploads).
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms),
  );
  return Promise.race<T>([promise, timeoutPromise]);
}

export function ResetPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordResetData>({
    resolver: zodResolver(PasswordResetSchema),
  });

  const onSubmit = async (data: PasswordResetData) => {
    setLoading(true);
    try {
      const { error } = await withTimeout<{
        data: {} | null;
        error: AuthError | null;
      }>(
        supabase.auth.resetPasswordForEmail(data.email, {
          redirectTo: `${window.location.origin}/auth/update-password`,
        }),
        10_000,
        "This is taking unusually long. If you don't see the email shortly, check your spam folder or try again in a moment — there may be a slow email hook on the backend.",
      );

      if (error) {
        console.error("Supabase resetPasswordForEmail error:", error);
        throw new Error(error.message || "Failed to send reset email");
      }

      setSubmitted(true);
      toast.success("Password reset email sent! Check your inbox.");
    } catch (error: any) {
      console.error("Password reset error:", error);
      toast.error(error?.message || "Failed to send reset email");
    } finally {
      // Always runs, even on timeout — this is what stops the button
      // from spinning forever.
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
            {submitted ? (
              <CheckCircle size={28} className="text-emerald-400" />
            ) : (
              <Mail size={28} className="text-emerald-400" />
            )}
          </div>
          <h1 className="text-white font-black text-2xl">
            {submitted ? "Check Your Email" : "Reset Password"}
          </h1>
          <p className="text-slate-400 text-sm">
            {submitted
              ? "We've sent a reset link to your email"
              : "Enter your email to receive a reset link"}
          </p>
        </div>

        {submitted ? (
          /* Success state */
          <div
            className="rounded-2xl p-6 space-y-4 text-center"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              className="rounded-xl p-4"
              style={{
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.2)",
              }}
            >
              <p className="text-emerald-300 text-sm leading-relaxed">
                Follow the link in your email to reset your password. Check
                your spam folder if you don't see it.
              </p>
            </div>
            <Link
              href="/auth/signin"
              className="flex items-center justify-center gap-2 text-emerald-400 text-sm font-semibold hover:underline"
            >
              <ArrowLeft size={14} /> Back to Sign In
            </Link>
          </div>
        ) : (
          /* Form — now an actual <form> element */
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="rounded-2xl p-6 space-y-4"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="space-y-1.5">
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
                Email Address
              </label>
              <div className="relative">
                <Mail
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type="email"
                  placeholder="you@example.com"
                  {...register("email")}
                  disabled={loading}
                  className="w-full pl-9 pr-4 py-3 rounded-xl text-white text-sm bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-600 disabled:opacity-50"
                />
              </div>
              {errors.email && (
                <p className="text-red-400 text-xs">{errors.email.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{" "}
                  Sending...
                </>
              ) : (
                "Send Reset Link"
              )}
            </button>
          </form>
        )}

        <p className="text-center text-slate-500 text-sm">
          <Link
            href="/auth/signin"
            className="text-emerald-400 hover:underline font-semibold flex items-center justify-center gap-1"
          >
            <ArrowLeft size={13} /> Back to Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}

export default ResetPasswordForm;

/*
  IMPORTANT — if success/error toasts never appear even after this fix,
  it's because <Toaster /> from "sonner" is not mounted. Add this to
  app/layout.tsx:

    import { Toaster } from "sonner";
    ...
    <body>
      {children}
      <Toaster richColors position="top-center" />
    </body>

  Without it, toast.success()/toast.error() are silent no-ops.

  PERFORMANCE NOTE: if the timeout above fires regularly (not just under
  bad network conditions), check for a slow Postgres trigger / webhook /
  Supabase Auth hook attached to password reset requests (e.g. one that
  calls out to Resend synchronously). That would explain "the email
  actually arrives but the UI still times out" — the request succeeds,
  but the client is waiting on a slow hook chained after it. Fire-and-
  forget that hook (queue/async) on the backend instead.
*/