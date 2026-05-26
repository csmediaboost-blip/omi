"use client";
// app/auth/update-password/page.tsx
// Handles the password reset link from Supabase email

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Lock, Eye, EyeOff, CheckCircle, ShieldCheck } from "lucide-react";

// ── Validation schema ──────────────────────────────────────────────
const UpdatePasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Must contain at least one uppercase letter")
      .regex(/[0-9]/, "Must contain at least one number"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type UpdatePasswordData = z.infer<typeof UpdatePasswordSchema>;

// ── Component ──────────────────────────────────────────────────────
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<UpdatePasswordData>({
    resolver: zodResolver(UpdatePasswordSchema),
  });

  // ── Supabase exchanges the URL tokens automatically on mount ──────
  // When the user lands here from the email link, Supabase parses the
  // #access_token fragment and fires an INITIAL_SESSION / PASSWORD_RECOVERY event.
  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY" || event === "INITIAL_SESSION") {
          if (session) {
            setSessionReady(true);
          } else {
            setSessionError(true);
          }
        }
      },
    );

    // Also check for an existing session in case the event already fired
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSessionReady(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const onSubmit = async (data: UpdatePasswordData) => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      });
      if (error) throw error;
      setDone(true);
      toast.success("Password updated successfully!");
      setTimeout(() => router.push("/auth/signin"), 2500);
    } catch (error: any) {
      console.error("Update password error:", error);
      toast.error(error.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  const password = watch("password", "");
  const strength = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const strengthScore = strength.filter(Boolean).length;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strengthScore];
  const strengthColor = ["", "#ef4444", "#f59e0b", "#10b981", "#10b981"][
    strengthScore
  ];

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
            {done ? (
              <CheckCircle size={28} className="text-emerald-400" />
            ) : (
              <ShieldCheck size={28} className="text-emerald-400" />
            )}
          </div>
          <h1 className="text-white font-black text-2xl">
            {done ? "Password Updated!" : "Set New Password"}
          </h1>
          <p className="text-slate-400 text-sm">
            {done
              ? "Redirecting you to sign in…"
              : "Choose a strong password for your account"}
          </p>
        </div>

        {/* Invalid / expired link */}
        {sessionError && !sessionReady && (
          <div
            className="rounded-2xl p-6 text-center space-y-4"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div
              className="rounded-xl p-4"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
            >
              <p className="text-red-400 text-sm leading-relaxed">
                This reset link is invalid or has expired. Please request a new
                one.
              </p>
            </div>
            <button
              onClick={() => router.push("/auth/reset-password")}
              className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
            >
              Request New Link
            </button>
          </div>
        )}

        {/* Success state */}
        {done && (
          <div
            className="rounded-2xl p-6 text-center"
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
                Your password has been changed. Taking you to sign in…
              </p>
            </div>
          </div>
        )}

        {/* Form — shown when session is ready and not yet done */}
        {sessionReady && !done && !sessionError && (
          <div
            className="rounded-2xl p-6 space-y-5"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {/* New password */}
            <div className="space-y-1.5">
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
                New Password
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  {...register("password")}
                  disabled={loading}
                  className="w-full pl-9 pr-10 py-3 rounded-xl text-white text-sm bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-600 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-400 text-xs">
                  {errors.password.message}
                </p>
              )}

              {/* Strength meter */}
              {password.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{
                          background:
                            i < strengthScore
                              ? strengthColor
                              : "rgba(255,255,255,0.08)",
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-xs" style={{ color: strengthColor }}>
                    {strengthLabel}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
                Confirm Password
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  type={showConfirm ? "text" : "password"}
                  placeholder="Repeat your password"
                  {...register("confirmPassword")}
                  disabled={loading}
                  className="w-full pl-9 pr-10 py-3 rounded-xl text-white text-sm bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-600 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-red-400 text-xs">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleSubmit(onSubmit)}
              disabled={loading}
              className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Updating…
                </>
              ) : (
                "Update Password"
              )}
            </button>
          </div>
        )}

        {/* Loading skeleton while waiting for session */}
        {!sessionReady && !sessionError && !done && (
          <div
            className="rounded-2xl p-6 space-y-4"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex items-center justify-center gap-3 py-4">
              <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
              <p className="text-slate-400 text-sm">Verifying reset link…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
