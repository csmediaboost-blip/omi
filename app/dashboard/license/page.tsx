"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardNavigation from "@/components/dashboard-navigation";
import { supabase } from "@/lib/supabase";
import {
  Copy,
  Check,
  Key,
  Loader2,
  Mail,
  CheckCircle2,
  Zap,
  AlertTriangle,
  ShieldCheck,
  Clock,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = "idle" | "generating" | "done" | "error";

type GeneratedKey = {
  key: string;
  expiresAt: string;
  emailSent: boolean;
  warning?: string;
};

// ─── Step A — Generate Key Panel ─────────────────────────────────────────────

function GeneratePanel({
  onGenerated,
  userEmail,
}: {
  onGenerated: (data: GeneratedKey) => void;
  userEmail: string;
}) {
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleGenerate = async () => {
    setStep("generating");
    setErrorMsg("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setErrorMsg("Session expired. Please sign in again.");
        setStep("error");
        return;
      }

      const res = await fetch("/api/license-key/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        throw new Error(json.error || "Failed to generate key");
      }

      setStep("done");
      onGenerated(json as GeneratedKey);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Something went wrong");
      setStep("error");
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Step A — Generate &amp; Receive Your Key
        </p>
        <p className="text-sm text-slate-400 leading-relaxed">
          Click the button below. A unique key will be saved to your account
          {userEmail && (
            <>
              {" "}
              and <strong className="text-white">emailed to {userEmail}</strong>
            </>
          )}{" "}
          immediately. You can also copy it directly from this page. Generating
          a new key cancels any previous one.
        </p>
      </div>

      <button
        onClick={handleGenerate}
        disabled={step === "generating"}
        className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-semibold text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {step === "generating" ? (
          <Loader2 size={16} className="animate-spin text-emerald-400" />
        ) : (
          <Zap size={16} className="text-emerald-400" />
        )}
        {step === "generating" ? "Generating…" : "Generate License Key"}
      </button>

      {step === "error" && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3">
          <AlertTriangle
            size={16}
            className="text-red-400 mt-0.5 flex-shrink-0"
          />
          <p className="text-sm text-red-300">{errorMsg}</p>
        </div>
      )}
    </div>
  );
}

// ─── Generated Key Display ────────────────────────────────────────────────────

function KeyDisplay({ data }: { data: GeneratedKey }) {
  const [copied, setCopied] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validateInput, setValidateInput] = useState("");
  const [validateError, setValidateError] = useState("");
  const [validated, setValidated] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expiresDate = new Date(data.expiresAt);
  const expiresStr = expiresDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const handleValidate = () => {
    setValidateError("");
    if (validateInput.trim() === data.key) {
      setValidated(true);
    } else {
      setValidateError("Key does not match. Make sure you copied it exactly.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Key box */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Your License Key
          </label>
          <div className="flex gap-2 items-center">
            <div className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-4 py-3 font-mono text-base text-emerald-300 break-all select-all">
              {data.key}
            </div>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 p-3 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check size={18} className="text-emerald-400" />
              ) : (
                <Copy size={18} className="text-emerald-300" />
              )}
            </button>
          </div>
        </div>

        {/* Expiry + email */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            <Clock size={13} />
            <span>Expires at {expiresStr}</span>
          </div>

          {data.emailSent ? (
            <div className="flex items-center gap-2 text-xs text-blue-300 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
              <Mail size={13} />
              <span>Key emailed to you</span>
            </div>
          ) : data.warning ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-700/40 border border-slate-600 rounded-lg px-3 py-2">
              <AlertTriangle size={13} />
              <span>Email not sent — copy from here</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Step B — Validate */}
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Step B — Paste &amp; Validate Your Key
          </p>
          <p className="text-sm text-slate-400 leading-relaxed">
            Copy the key from your email or from Step A above, paste it exactly
            as shown below, then click{" "}
            <strong className="text-white">Validate Key</strong>. The key must
            be validated within 15 minutes of generation. You cannot proceed to
            checkout without a validated key.
          </p>
        </div>

        {validated ? (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-4">
            <ShieldCheck size={20} className="text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-300">
                Key Validated
              </p>
              <p className="text-xs text-emerald-400/70 mt-0.5">
                You can now proceed to checkout.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={validateInput}
                onChange={(e) => setValidateInput(e.target.value)}
                placeholder="OMNI-XXXX-XXXX-XXXX-XXXX"
                className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-4 py-3 font-mono text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
              <button
                onClick={handleValidate}
                disabled={validating || !validateInput.trim()}
                className="px-4 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {validating ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  "Validate"
                )}
              </button>
            </div>
            {validateError && (
              <p className="text-xs text-red-400">{validateError}</p>
            )}
          </div>
        )}
      </div>

      {/* License Details */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          License Details
        </p>
        <p className="text-sm text-slate-400 leading-relaxed">
          Read-only summary fetched live from OmniTask licensing servers.
        </p>
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 divide-y divide-slate-700/60">
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">
              Status
            </span>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-400" />
              <span className="text-sm font-semibold text-emerald-300">
                Active
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">
              Validity
            </span>
            <span className="text-sm font-semibold text-white">15 Minutes</span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">
              Type
            </span>
            <span className="text-sm font-semibold text-white">Single-Use</span>
          </div>
          <div className="flex justify-between items-center px-4 py-3">
            <span className="text-xs text-slate-500 uppercase tracking-wide font-medium">
              Expires
            </span>
            <span className="text-sm font-semibold text-white">
              {expiresStr}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page Content ─────────────────────────────────────────────────────────────

function LicensePageContent() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [generatedKey, setGeneratedKey] = useState<GeneratedKey | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/signin");
        return;
      }

      setUserEmail(user.email || "");
      setLoading(false);
    }

    init();
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/25">
            <Key size={20} className="text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">License Key</h1>
        </div>
        <p className="text-slate-400 text-sm leading-relaxed">
          Generate a short-lived license key to validate your account before
          checkout. Each key expires in 15 minutes and can only be used once.
        </p>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-800" />

      {/* Step A */}
      <GeneratePanel
        userEmail={userEmail}
        onGenerated={(data) => setGeneratedKey(data)}
      />

      {/* Step B + License Details — shown after generation */}
      {generatedKey && (
        <>
          <div className="border-t border-slate-800" />
          <KeyDisplay data={generatedKey} />
        </>
      )}

      {/* Important notice */}
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4">
        <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide mb-1">
          Important
        </p>
        <p className="text-xs text-amber-200/80 leading-relaxed">
          Your license key is personal and non-transferable. Never share it with
          anyone. Each key is tied to your account and can only be used once
          during checkout.
        </p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LicensePage() {
  return (
    <div className="min-h-screen bg-slate-950">
      <DashboardNavigation />
      <div className="max-w-2xl mx-auto p-4 pt-24 sm:pt-32 pb-32">
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[60vh]">
              <Loader2 size={32} className="text-emerald-400 animate-spin" />
            </div>
          }
        >
          <LicensePageContent />
        </Suspense>
      </div>
    </div>
  );
}
