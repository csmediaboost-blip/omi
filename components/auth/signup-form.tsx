"use client";
// components/auth/signup-form.tsx
// Reads ?ref= from URL and saves referred_by on signup

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, AlertCircle, CheckCircle } from "lucide-react";
import Link from "next/link";

// Email validation function - strict RFC 5322 simplified
function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

function SignUpFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refCode = searchParams.get("ref") || "";

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isEmailValid = email.length > 0 && isValidEmail(email);
  const isEmailInvalid = emailTouched && email.length > 0 && !isValidEmail(email);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!fullName.trim()) {
      setError("Please enter your full name");
      return;
    }
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address");
      setEmailTouched(true);
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!agreed) {
      setError("Please agree to the terms");
      return;
    }

    setLoading(true);

    try {
      // 1. Create auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: fullName.trim() } },
      });

      if (authErr) {
        setError(authErr.message);
        setLoading(false);
        return;
      }
      const userId = authData.user?.id;
      if (!userId) {
        setError("Signup failed. Please try again.");
        setLoading(false);
        return;
      }

      // 2. Resolve referral code → find referrer's user ID
      let referredBy: string | null = null;
      if (refCode) {
        const { data: referrer } = await supabase
          .from("users")
          .select("id")
          .eq("referral_code", refCode)
          .neq("id", userId)
          .single();
        if (referrer?.id) referredBy = referrer.id;
      }

      // 3. Upsert user profile row with referred_by
      const { error: profileErr } = await supabase.from("users").upsert(
        {
          id: userId,
          full_name: fullName.trim(),
          email: email.trim(),
          referred_by: referredBy,
          referral_earnings: 0,
          referral_bonus_claimed: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (profileErr) {
        console.error("Profile upsert error:", profileErr);
        // Don't block signup for profile errors — auth succeeded
      }

      router.push("/auth/set-pin");
    } catch (err: any) {
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {refCode && (
        <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-3 py-2.5 text-xs text-emerald-300">
          🎁 Referral code <strong>{refCode}</strong> applied — you'll get a 10%
          bonus on your first payment!
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-2.5 text-xs text-red-300">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-1.5">
          FULL NAME
        </label>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          placeholder="John Doe"
          className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-1.5">
          EMAIL ADDRESS
        </label>
        <div className="relative">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            required
            placeholder="you@email.com"
            className={`w-full bg-slate-800/60 border rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none transition-colors text-sm ${
              isEmailInvalid
                ? "border-red-500 focus:border-red-400"
                : isEmailValid
                ? "border-emerald-500 focus:border-emerald-400"
                : "border-slate-700 focus:border-emerald-500"
            }`}
          />
          {isEmailInvalid && (
            <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500" size={18} />
          )}
          {isEmailValid && (
            <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500" size={18} />
          )}
        </div>
        {isEmailInvalid && (
          <p className="text-xs text-red-400 mt-1">Please enter a valid email address</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-1.5">
          PASSWORD
        </label>
        <div className="relative">
          <input
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Min. 6 characters"
            className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors text-sm pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            style={{ WebkitTapHighlightColor: "transparent", touchAction: "manipulation" }}
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-300 mb-1.5">
          CONFIRM PASSWORD
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          placeholder="Repeat password"
          className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors text-sm"
        />
      </div>

      <label className="flex items-start gap-3 cursor-pointer" style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 rounded accent-emerald-500"
          style={{ WebkitAppearance: "none", appearance: "none", width: "18px", height: "18px", border: "2px solid rgb(100, 116, 139)", borderRadius: "4px", cursor: "pointer", background: agreed ? "linear-gradient(135deg, #059669, #10b981)" : "transparent", backgroundImage: agreed ? `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="white"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 11-1.06-1.06L12.72 4.22a.75.75 0 011.06 0Z"/></svg>')` : "none", backgroundSize: "cover", backgroundPosition: "center" }}
        />
        <span className="text-slate-400 text-xs leading-relaxed">
          I agree to the{" "}
          <Link href="/terms" className="text-emerald-400 hover:underline">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-emerald-400 hover:underline">
            Privacy Policy
          </Link>
        </span>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 rounded-lg font-black text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: !agreed ? "rgba(16, 185, 129, 0.3)" : loading ? "rgba(16, 185, 129, 0.6)" : "linear-gradient(135deg, #059669, #10b981)",
          color: "white",
          cursor: !agreed ? "not-allowed" : loading ? "wait" : "pointer",
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
          pointerEvents: "auto",
          minHeight: "44px",
        }}
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Creating account...
          </span>
        ) : (
          "Sign Up"
        )}
      </button>

      <p className="text-center text-slate-500 text-sm">
        Already have an account?{" "}
        <Link
          href="/auth/signin"
          className="text-emerald-400 hover:underline font-semibold"
        >
          Sign In
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-12 bg-slate-800/60 rounded-lg animate-pulse" />
          <div className="h-12 bg-slate-800/60 rounded-lg animate-pulse" />
          <div className="h-12 bg-slate-800/60 rounded-lg animate-pulse" />
          <div className="h-12 bg-slate-800/60 rounded-lg animate-pulse" />
          <div className="h-10 bg-slate-700/60 rounded-lg animate-pulse" />
          <div className="h-12 bg-emerald-500/20 rounded-lg animate-pulse" />
        </div>
      }
    >
      <SignUpFormInner />
    </Suspense>
  );
}
