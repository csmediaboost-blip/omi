"use client";
// app/auth/update-password/page.tsx — FIXED
//
// ROOT CAUSE: supabase.auth.updateUser() had no timeout (the global fetch
// timeout was intentionally removed to stop breaking file uploads — see
// lib/supabase.ts). If that specific network call stalls, there was
// nothing to catch it, so the button spun on "Updating…" forever with no
// error ever surfacing.
//
// FIX: race updateUser() against a local 15s timeout, scoped to just this
// one call — does not touch the global client config, so uploads are
// unaffected. Also guards against submitting with an already-expired
// recovery session.

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type {
  AuthChangeEvent,
  Session,
  AuthError,
} from "@supabase/supabase-js";
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

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
type PageState = "loading" | "ready" | "error" | "done";

// Wrap any promise with a timeout so a stalled network request always
// resolves into a catchable error instead of hanging the UI forever.
// NOTE: the timeout branch is typed as Promise<T> (not Promise<never>) —
// it never actually resolves with a value, but keeping the type as T
// avoids TS widening Promise.race's result to `unknown`.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms),
  );
  return Promise.race([promise, timeoutPromise]);
}

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<UpdatePasswordData>({
    resolver: zodResolver(UpdatePasswordSchema),
  });

  useEffect(() => {
    const timeout = setTimeout(() => {
      setErrorMsg(
        "Link verification timed out. Please request a new reset link.",
      );
      setPageState("error");
    }, 10_000);

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        console.log(
          "[update-password] auth event:",
          event,
          "session:",
          !!session,
        );

        if (event === "PASSWORD_RECOVERY") {
          clearTimeout(timeout);
          setPageState("ready");
        } else if (event === "SIGNED_IN" && session) {
          clearTimeout(timeout);
          setPageState("ready");
        } else if (event === "INITIAL_SESSION" && session) {
          clearTimeout(timeout);
          setPageState("ready");
        }
      },
    );

    supabase.auth
      .getSession()
      .then(
        ({
          data,
          error,
        }: {
          data: { session: Session | null };
          error: AuthError | null;
        }) => {
          console.log(
            "[update-password] getSession →",
            data.session?.user?.email,
            error,
          );
          if (data.session) {
            clearTimeout(timeout);
            setPageState("ready");
          }
        },
      );

    return () => {
      clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (data: UpdatePasswordData) => {
    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      console.log(
        "[update-password] session before update:",
        sessionData.session?.user?.email,
      );

      if (!sessionData.session) {
        throw new Error(
          "Your session expired. Please request a new reset link.",
        );
      }

      // The actual fix: this call can no longer hang forever. If Supabase
      // doesn't respond within 15s, this rejects with a real error that
      // the catch block below will surface via toast.
      const { error } = await withTimeout(
        supabase.auth.updateUser({ password: data.password }),
        15_000,
        "Request timed out. Check your connection and try again.",
      );
      console.log("[update-password] updateUser error:", error);

      if (error) throw error;

      setPageState("done");
      toast.success("Password updated! Redirecting to sign in…");

      await withTimeout(
        supabase.auth.signOut(),
        5_000,
        "Sign out timed out",
      ).catch((err) => {
        // Non-fatal — the password is already updated at this point.
        // Don't block the redirect on a slow/stuck signOut call.
        console.warn("[update-password] signOut warning:", err);
      });

      setTimeout(() => router.push("/auth/signin"), 2500);
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "Failed to update password";
      console.error("[update-password] submit error:", error);
      toast.error(msg);
    } finally {
      // Always runs, even on timeout — this is what stops the button
      // from spinning forever.
      setSubmitting(false);
    }
  };

  const password = watch("password", "");
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][score];
  const strengthColor = ["", "#ef4444", "#f59e0b", "#10b981", "#10b981"][score];

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
            {pageState === "done" ? (
              <CheckCircle size={28} className="text-emerald-400" />
            ) : pageState === "error" ? (
              <AlertCircle size={28} className="text-red-400" />
            ) : (
              <ShieldCheck size={28} className="text-emerald-400" />
            )}
          </div>
          <h1 className="text-white font-black text-2xl">
            {pageState === "done"
              ? "Password Updated!"
              : pageState === "error"
                ? "Link Invalid"
                : "Set New Password"}
          </h1>
          <p className="text-slate-400 text-sm">
            {pageState === "done"
              ? "Redirecting you to sign in…"
              : pageState === "error"
                ? "This link has expired or already been used"
                : "Choose a strong password for your account"}
          </p>
        </div>

        {/* Loading */}
        {pageState === "loading" && (
          <div
            className="rounded-2xl p-6"
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

        {/* Error */}
        {pageState === "error" && (
          <div
            className="rounded-2xl p-6 space-y-4"
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
              <p className="text-red-400 text-sm leading-relaxed text-center">
                {errorMsg}
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

        {/* Done */}
        {pageState === "done" && (
          <div
            className="rounded-2xl p-6"
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
              <p className="text-emerald-300 text-sm leading-relaxed text-center">
                Your password has been changed. Taking you to sign in…
              </p>
            </div>
          </div>
        )}

        {/* Form */}
        {pageState === "ready" && (
          <div
            className="rounded-2xl p-6 space-y-5"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            {/* New Password */}
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
                  disabled={submitting}
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
              {password.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{
                          background:
                            i < score
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

            {/* Confirm Password */}
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
                  disabled={submitting}
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
              disabled={submitting}
              className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
            >
              {submitting ? (
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
      </div>
    </div>
  );
}