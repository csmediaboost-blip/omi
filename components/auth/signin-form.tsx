"use client";
// components/auth/sign-in-form.tsx
// FIX 1: Clears pin_verified cookie BEFORE signing in
//         (stale cookie was letting users skip verify-pin entirely)
// FIX 2: Uses window.location.href instead of router.push
//         (router.push uses cache and can bypass middleware)

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { SignInFormSchema, SignInFormData } from "@/lib/validators";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, Mail, Lock, Shield } from "lucide-react";
import Link from "next/link";

export function SignInForm() {
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormData>({
    resolver: zodResolver(SignInFormSchema),
  });

  const onSubmit = async (data: SignInFormData) => {
    try {
      setLoading(true);

      // ── CRITICAL FIX: Nuke the stale pin cookie first ─────────────────────
      // If a cookie exists from a previous login session, the middleware
      // sees it and sends the user straight to /dashboard skipping verify-pin
      document.cookie = "pin_verified=; path=/; max-age=0; SameSite=Lax";
      document.cookie = "pin_verified=; path=/; max-age=0; SameSite=Strict";

      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;

      toast.success("Signed in! Please verify your PIN.");

      // ── CRITICAL FIX: Full page load, not router.push ─────────────────────
      // router.push() uses Next.js client-side navigation which can serve
      // cached pages and skip the middleware PIN check entirely.
      // window.location.href forces a real HTTP request which runs middleware.
      window.location.href = "/auth/verify-pin";
    } catch (error: any) {
      console.error("Signin error:", error);
      toast.error(error.message || "Sign in failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto bg-emerald-500/10 border border-emerald-500/25">
            <Shield size={28} className="text-emerald-400" />
          </div>
          <h1 className="text-white font-black text-2xl">Welcome Back</h1>
          <p className="text-slate-400 text-sm">Sign in to your account</p>
        </div>

        <div className="rounded-2xl p-6 space-y-4 bg-slate-900/95 border border-white/7" style={{ WebkitBackfaceVisibility: "hidden", backfaceVisibility: "hidden" }}>

          {/* Email */}
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

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
              Password
            </label>
            <div className="relative">
              <Lock
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type={showPass ? "text" : "password"}
                placeholder="Your password"
                {...register("password")}
                disabled={loading}
                className="w-full pl-9 pr-10 py-3 rounded-xl text-white text-sm bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-600 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-red-400 text-xs">{errors.password.message}</p>
            )}
          </div>

          <div className="text-right">
            <Link
              href="/auth/reset-password"
              className="text-emerald-400 text-xs hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            onClick={handleSubmit(onSubmit)}
            disabled={loading}
            className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400"
            style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />{" "}
                Signing In...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </div>

        <p className="text-center text-slate-500 text-sm">
          Don&apos;t have an account?{" "}
          <Link
            href="/auth/signup"
            className="text-emerald-400 hover:underline font-semibold"
          >
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default SignInForm;
