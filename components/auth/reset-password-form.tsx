"use client";
// components/auth/reset-password-form.tsx — FIXED
// Consistent dark theme, maintains existing logic

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PasswordResetSchema, PasswordResetData } from "@/lib/validators";
import { toast } from "sonner";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";

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
    try {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });
      if (error) throw error;
      setSubmitted(true);
      toast.success("Password reset email sent! Check your inbox.");
    } catch (error: any) {
      console.error("Password reset error:", error);
      toast.error(error.message || "Failed to send reset email");
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
                Follow the link in your email to reset your password. Check your
                spam folder if you don't see it.
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
          /* Form */
          <div
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
              type="button"
              onClick={handleSubmit(onSubmit)}
              disabled={loading}
              className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)", WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
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
          </div>
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
