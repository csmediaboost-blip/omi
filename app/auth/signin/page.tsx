import Link from "next/link";
import { SignInForm } from "@/components/auth/signin-form";
import { ArrowRight } from "lucide-react";
import Image from "next/image";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 relative overflow-hidden px-4">
      {/* Background gradients — pointer-events-none so they never block clicks */}
      <div
        className="absolute inset-0 pointer-events-none select-none"
        aria-hidden="true"
      >
        <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-[250px] h-[250px] bg-blue-500/4 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <Link
            href="/"
            className="inline-flex items-center justify-center mb-6 sm:mb-8 group"
          >
            <Image
              src="/logo-main.png"
              alt="OmniTask Pro"
              width={48}
              height={48}
              className="rounded-2xl hover:scale-105 transition-transform"
            />
          </Link>
          <h1 className="text-2xl sm:text-4xl font-black text-white mb-2 sm:mb-3">
            Sign In
          </h1>
          <p className="text-slate-400 text-sm sm:text-lg">
            Welcome back to OmniTask Pro
          </p>
        </div>

        {/* Form container — NO backdrop-blur (breaks touch on Android) */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          <SignInForm />

          {/* Divider */}
          <div className="relative my-5 sm:my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700" />
            </div>
            <div className="relative flex justify-center text-xs sm:text-sm">
              <span className="px-2 bg-slate-900 text-slate-500">
                Don&apos;t have an account?
              </span>
            </div>
          </div>

          {/* Sign up link */}
          <Link href="/auth/signup" className="w-full inline-block">
            <button
              className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-500/50 text-emerald-400 font-semibold py-2.5 sm:py-3 rounded-lg transition-all flex items-center justify-center gap-2 group text-sm sm:text-base"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              Create Account
              <ArrowRight
                size={18}
                className="group-hover:translate-x-1 transition-transform"
              />
            </button>
          </Link>
        </div>

        {/* Footer text */}
        <p className="text-center text-slate-500 text-xs sm:text-sm mt-5 sm:mt-6">
          By signing in, you agree to our{" "}
          <a
            href="/terms"
            className="text-emerald-400 hover:text-emerald-300 transition"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            className="text-emerald-400 hover:text-emerald-300 transition"
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
}
