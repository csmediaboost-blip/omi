"use client";

import { useState, Suspense, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cacheService } from "@/lib/cache-service";
import DashboardNavigation from "@/components/dashboard-navigation";
import {
  ArrowLeft,
  Copy,
  Check,
  RefreshCw,
  Shield,
  ChevronRight,
  Lock,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Info,
  Key,
  Zap,
  PenLine,
  Camera,
  CheckCircle2,
  XCircle,
  Timer,
  Mail,
  Loader2,
} from "lucide-react";

/* ═══════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════ */

type KeyStatus = "active" | "used" | "expired";

interface KeyRecord {
  key: string;
  status: KeyStatus;
  generatedAt: number;   // local timestamp (ms) for display
  expiresAt: number;     // local timestamp (ms) for countdown
}

/* ═══════════════════════════════════════════════
   STATIC DATA
═══════════════════════════════════════════════ */

const UNITS = [
  { code: "LC_BASE", desc: "LC Central Base",        name: "—", qty: 0, status: "Open" },
  { code: "LC_BASE", desc: "LC Central Base",        name: "—", qty: 0, status: "Open" },
  { code: "LC_BASE", desc: "LC Central Base",        name: "—", qty: 0, status: "Open" },
  { code: "LC_BASE", desc: "LC Central Base",        name: "—", qty: 0, status: "Open" },
  { code: "LC_GPG",  desc: "LC Central Sign Pay Go", name: "—", qty: 0, status: "Open" },
];

const BENEFITS = [
  { label: "Daily Thermal Calibration", value: "$0.50 / day",       desc: "Run one GPU optimization task every day to earn $0.50. The task resets at midnight UTC. Maintain a 7-day streak for bonus payouts." },
  { label: "RLHF Validation Tasks",     value: "$0.10 / task",      desc: "Review and rate AI-generated responses to help train enterprise models. Each submission earns $0.10 with no daily cap." },
  { label: "GPU Client Allocation",     value: "Hourly revenue",    desc: "Assign your node to a live enterprise AI client. Earnings accumulate every hour your node stays allocated and active." },
  { label: "Premium Client Access",     value: "Up to 3× earnings", desc: "Unlock exclusive high-multiplier clients — Beta (2.1×), Epsilon (3×), Zeta (1.6×) — unavailable to standard operators." },
  { label: "Priority Node Routing",     value: "First in queue",    desc: "Your tasks route ahead of standard-tier nodes — less idle time, faster delivery, higher uptime." },
  { label: "Certified Operator Seal",   value: "Lifetime badge",    desc: "A verified badge on your profile and every weekly compute report you generate — proof of certified status." },
];

const FAQS = [
  { q: "Is this a one-time purchase?",    a: "Yes. The $200 fee is charged once and stays valid for 4 years. A $5.00/month infrastructure charge is auto-deducted from your earnings balance — you are never billed to your card again. An optional $200 renewal after year 4 preserves your balance and history." },
  { q: "When do earnings begin?",         a: "The moment your license activates. Assign your node within minutes of purchase and hourly earnings start immediately. The first payout is available after your 7-day maturation period." },
  { q: "What is the inactivity penalty?", a: "If your node is unassigned for 3+ consecutive days, 20% of your balance is deducted as compensation for unallocated compute time. Log in and assign daily to avoid any deductions." },
  { q: "How quickly can I recover $200?", a: "Most operators recover their outlay within 48–83 days depending on GPU tier and client multipliers. This is historical data, not a guarantee." },
  { q: "Are payments secure?",            a: "Yes. Transactions go through a PCI DSS Level 1 certified partner with 256-bit SSL. Your card details never touch OmniTask servers." },
];

const TERMS = [
  "The Certified AI Operator License grants a non-exclusive, non-transferable right to participate in the OmniTask Pro compute network for four (4) years from the date of activation.",
  "Earnings are derived from real GPU compute workloads executed on behalf of enterprise AI clients. OmniTask Pro does not guarantee specific earnings levels. Historical performance data is for reference only.",
  "A monthly infrastructure surcharge of $5.00 USD is automatically deducted from the operator's available balance every 30 days following activation. This covers cooling, electricity, and maintenance costs.",
  "Operators who fail to assign their GPU node for three (3) or more consecutive calendar days are subject to a 20% inactivity deduction applied to their total available balance.",
  "OmniTask Pro reserves the right to suspend or revoke licenses for fraudulent activity, platform abuse, or violation of these terms.",
  "All sales are final. Refunds are not available after a license is activated and a node has been assigned to a client.",
  "By purchasing you confirm you are at least 18 years of age, participation is legal in your jurisdiction, and you accept these terms in full.",
];

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className={`relative inline-flex h-6 w-11 rounded-full transition-colors focus:outline-none shrink-0 ${checked ? "bg-green-500" : "bg-gray-200"}`}
    >
      <span className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function SectionHead({ number, title, note }: { number: string; title: string; note: string }) {
  return (
    <div className="flex gap-5 mb-6">
      <span className="text-3xl font-bold text-gray-100 leading-none select-none shrink-0 w-7 text-right" style={{ fontFamily: "Georgia, serif" }}>{number}</span>
      <div>
        <h2 className="text-xl font-bold text-gray-900 leading-tight" style={{ fontFamily: "Georgia, serif" }}>{title}</h2>
        <p className="text-sm text-gray-500 mt-1 leading-relaxed">{note}</p>
      </div>
    </div>
  );
}

function FieldNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-gray-400 leading-relaxed mt-2 flex items-start gap-1.5">
      <Info size={11} className="mt-0.5 shrink-0 text-gray-300" />
      <span>{children}</span>
    </p>
  );
}

function HR() { return <div className="h-px bg-gray-100 my-10" />; }

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-4 text-left gap-4 group">
        <span className="text-sm font-semibold text-gray-800 group-hover:text-black transition-colors">{q}</span>
        {open ? <ChevronUp size={13} className="text-gray-300 shrink-0" /> : <ChevronDown size={13} className="text-gray-300 shrink-0" />}
      </button>
      {open && <p className="text-sm text-gray-500 leading-relaxed pb-4">{a}</p>}
    </div>
  );
}

function fmt(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60).toString().padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function statusBadge(s: KeyStatus) {
  if (s === "active")  return "text-green-700 bg-green-50 border-green-200";
  if (s === "used")    return "text-blue-700 bg-blue-50 border-blue-200";
  return "text-red-600 bg-red-50 border-red-200";
}

/* ═══════════════════════════════════════════════
   KEY GENERATOR  (API-backed)
═══════════════════════════════════════════════ */

function KeyGenerator({ onKeyValidated }: { onKeyValidated: (key: string) => void }) {
  const [userKey, setUserKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(true);
  const [keyError, setKeyError] = useState("");
  const [copied, setCopied] = useState(false);

  // Helper function to generate a license key locally
  function generateLicenseKeyLocally(): string {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const segments = [4, 4, 4, 4];
    const parts: string[] = [];

    for (const segmentLength of segments) {
      let segment = '';
      for (let i = 0; i < segmentLength; i++) {
        segment += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      parts.push(segment);
    }

    return `OMNI-${parts.join('-')}`;
  }

  // Load user's pre-generated key on mount
  useEffect(() => {
    async function loadUserKey() {
      try {
        setLoadingKey(true);
        const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
        
        if (!session) {
          setKeyError("Not logged in");
          setLoadingKey(false);
          return;
        }

        const { data: user, error } = await (await import("@/lib/supabase")).supabase
          .from("users")
          .select("unique_license_key")
          .eq("id", session.user.id)
          .single();

        // If no key exists, generate one and save it
        if (!user?.unique_license_key || error) {
          console.log("[v0] Generating new license key for user");
          const generatedKey = generateLicenseKeyLocally();
          
          // Try to save it to database
          try {
            await (await import("@/lib/supabase")).supabase
              .from("users")
              .update({ unique_license_key: generatedKey })
              .eq("id", session.user.id);
          } catch (updateErr) {
            console.log("[v0] Could not save key to DB, using locally generated:", generatedKey);
          }
          
          setUserKey(generatedKey);
          onKeyValidated(generatedKey);
          setKeyError("");
          return;
        }

        setUserKey(user.unique_license_key);
        onKeyValidated(user.unique_license_key);
        setKeyError("");
      } catch (err: any) {
        console.error("[v0] Error loading license key:", err);
        // Generate a fallback key if all else fails
        const fallbackKey = generateLicenseKeyLocally();
        setUserKey(fallbackKey);
        onKeyValidated(fallbackKey);
        setKeyError("");
      } finally {
        setLoadingKey(false);
      }
    }

    loadUserKey();
  }, [onKeyValidated]);

  function handleCopy() {
    if (!userKey) return;
    navigator.clipboard.writeText(userKey).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6" style={{ fontFamily: "system-ui, sans-serif" }}>

      {/* ── INFO BOX ── */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
        <p className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
          <CheckCircle2 size={13} /> Your Certified AI Operator License
        </p>
        <p className="text-xs text-emerald-600 leading-relaxed">
          Your unique license key is pre-generated and saved to your account. Copy it below to proceed to checkout. 
          Once you complete payment, your environment will automatically upgrade to Production.
        </p>
      </div>

      {/* ── YOUR LICENSE KEY ── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-3">
          Your Unique License Key
        </p>

        {loadingKey ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-gray-400" />
            <span className="text-sm text-gray-500 ml-2">Loading your key...</span>
          </div>
        ) : keyError ? (
          <p className="text-xs text-red-500 flex items-center gap-1.5 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
            <AlertCircle size={13} /> {keyError}
          </p>
        ) : userKey ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 border-2 border-emerald-300 rounded-lg px-4 py-3 font-mono text-base font-bold text-emerald-900 tracking-widest bg-emerald-50 select-all">
                {userKey}
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 bg-emerald-500 text-white rounded-lg px-4 py-3 text-sm font-semibold hover:bg-emerald-600 transition-all shrink-0"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-emerald-600 flex items-center gap-1.5 font-medium">
              <CheckCircle2 size={12} /> Ready to proceed to checkout
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   SIGNATURE UPLOAD
═══════════════════════════════════════════════ */

function SignatureUpload({ onSignatureUpload }: { onSignatureUpload: (hasFile: boolean) => void }) {
  const [file, setFile]       = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function handleFile(f: File) {
    setFile(f);
    onSignatureUpload(true);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }

  function handleRemoveFile() {
    setFile(null);
    setPreview(null);
    onSignatureUpload(false);
  }

  return (
    <div className="space-y-5" style={{ fontFamily: "system-ui, sans-serif" }}>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2">Signed Agreement — Required</p>
        <p className="text-sm text-gray-600 leading-relaxed">
          To complete your operator registration, you must provide a{" "}
          <strong className="text-gray-800">handwritten signature</strong> as your binding agreement to the
          License Terms & Conditions above. This is a legal requirement for all Certified AI Operator licenses.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">How to sign and submit:</p>
        {[
          { step: "1", icon: FileText, label: "Write the agreement text on a blank sheet of paper", desc: 'Write: "I, [your full name], agree to the OmniTask Pro Certified AI Operator License Terms & Conditions. Date: [today\'s date]."' },
          { step: "2", icon: PenLine,  label: "Sign your name below that text",                     desc: "Use your normal handwritten signature — the same as on official documents. This confirms your identity and legal consent." },
          { step: "3", icon: Camera,   label: "Photograph or scan the signed paper clearly",        desc: "Take a clear, well-lit photo with your phone or scan it. The full text and signature must be legible. JPG, PNG, or PDF — max 10 MB." },
          { step: "4", icon: CheckCircle2, label: "Upload the image below",                         desc: "Once uploaded, our team verifies your signature within 24 hours and emails confirmation. Your node becomes eligible for client allocation after verification." },
        ].map(({ step, icon: Icon, label, desc }) => (
          <div key={step} className="flex gap-4">
            <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-[9px] font-bold text-gray-500">{step}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{label}</p>
              <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Template — write this on your paper:</p>
        <p className="text-sm text-gray-700 leading-relaxed italic">
          &ldquo;I, [Full Legal Name], agree to the OmniTask Pro Certified AI Operator License Terms & Conditions
          as presented to me on this date. I understand that earnings are not guaranteed and that a $5.00/month
          infrastructure charge will be deducted from my balance. Date: [DD/MM/YYYY].&rdquo;
        </p>
        <p className="text-xs text-gray-400">Sign your name beneath this paragraph.</p>
      </div>

      {!file ? (
        <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-200 hover:border-gray-400 rounded-xl p-8 cursor-pointer transition-colors group">
          <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-gray-200 flex items-center justify-center transition-colors">
            <Camera size={18} className="text-gray-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Upload your signed paper photo</p>
            <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, or PDF · max 10 MB</p>
          </div>
          <input type="file" accept=".jpg,.jpeg,.png,.pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </label>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 border border-gray-200 rounded-lg p-3">
            {preview && preview.startsWith("data:image") ? (
              <img src={preview} alt="Signature preview" className="w-20 h-14 object-cover rounded border border-gray-200 shrink-0" />
            ) : (
              <div className="w-20 h-14 rounded border border-gray-200 bg-gray-50 flex items-center justify-center shrink-0">
                <FileText size={20} className="text-gray-300" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-800 truncate">{file.name}</p>
              <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB · ready to submit</p>
            </div>
            <span className="text-xs font-bold text-green-700 bg-green-50 px-2.5 py-1 rounded-full shrink-0 border border-green-200">Uploaded</span>
          </div>
          <button onClick={handleRemoveFile}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1">
            <RefreshCw size={10} /> Replace file
          </button>
          <p className="text-xs text-gray-500 leading-relaxed bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
            <strong className="text-amber-700">Next step:</strong> Our verification team reviews your signature within 24 hours.
            You will receive a confirmation email once your operator status is activated.
          </p>
        </div>
      )}

      <FieldNote>
        Your signature is stored securely and used solely for identity verification.
        It is never shared with third parties and is retained only for the duration of your license.
      </FieldNote>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════ */

function LicenseInner() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const licenseType  = searchParams.get("licenseType") || "operator_license";

  const [updateEnv,     setUpdateEnv]     = useState(true);
  const [updateLicKey,  setUpdateLicKey]  = useState(true);
  const [showDetails,   setShowDetails]   = useState(false);
  const [copiedDetail,  setCopiedDetail]  = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen,     setTermsOpen]     = useState(false);
  const [signatureUploaded, setSignatureUploaded] = useState(false);
  const [validatedKey,  setValidatedKey]  = useState("");
  
  // Payment and environment state
  const [isPaid,        setIsPaid]        = useState(false);
  const [environment,   setEnvironment]   = useState<"localhost" | "production">("localhost");
  const [loadingEnv,    setLoadingEnv]    = useState(true);

  const mockDetailKey = "OMNI-XXXX-XXXX-XXXX-XXXX";
  const validUntil    = new Date(Date.now() + 4 * 365 * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const canCheckout   = termsAccepted && !!validatedKey && signatureUploaded;

  // Load environment and payment status
  useEffect(() => {
    async function loadEnvironment() {
      try {
        const { data: { session } } = await (await import("@/lib/supabase")).supabase.auth.getSession();
        
        if (!session) {
          setLoadingEnv(false);
          return;
        }

        const { data: user, error } = await (await import("@/lib/supabase")).supabase
          .from("users")
          .select("license_paid, deployment_environment")
          .eq("id", session.user.id)
          .single();

        if (!error && user) {
          setIsPaid(user.license_paid === true);
          setEnvironment(user.deployment_environment === "production" ? "production" : "localhost");
        }
      } catch (err) {
        console.error("Error loading environment:", err);
      } finally {
        setLoadingEnv(false);
      }
    }

    loadEnvironment();
  }, []);

  return (
    <div className="flex min-h-screen bg-white text-gray-900">
      <DashboardNavigation />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 md:px-12 pt-8 pb-32">

          <button onClick={() => router.back()} className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors text-sm mb-10" style={{ fontFamily: "system-ui, sans-serif" }}>
            <ArrowLeft size={14} /> Back
          </button>

          {/* Header */}
          <div className="flex items-start justify-between gap-6 mb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400 mb-3" style={{ fontFamily: "system-ui, sans-serif" }}>OmniTask Pro · Operator Program</p>
              <h1 className="text-4xl font-bold text-black leading-tight tracking-tight" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>Certified AI<br />Operator License</h1>
            </div>
            <div className="text-right shrink-0 hidden md:block">
              <p className="text-xs text-gray-400 mb-0.5" style={{ fontFamily: "system-ui, sans-serif" }}>One-time fee</p>
              <p className="text-5xl font-bold text-black leading-none" style={{ fontFamily: "Georgia, serif" }}>$200</p>
              <p className="text-xs text-gray-400 mt-1.5" style={{ fontFamily: "system-ui, sans-serif" }}>+ $5.00 / mo infrastructure</p>
            </div>
          </div>
          <p className="text-base text-gray-500 leading-relaxed mb-12" style={{ maxWidth: "480px" }}>
            This page walks you through every aspect of the license — what you earn, what you pay, how to validate your key, sign your agreement, and complete your purchase.
          </p>

          {/* 1 — BENEFITS */}
          <SectionHead number="1" title="What you unlock" note="All six features activate the moment your license is confirmed and your node is assigned to a client." />
          <div className="space-y-5 ml-12 mb-12">
            {BENEFITS.map(({ label, value, desc }, i) => (
              <div key={label} className="flex gap-4">
                <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[9px] font-bold text-gray-500" style={{ fontFamily: "system-ui, sans-serif" }}>{i + 1}</span>
                </div>
                <div>
                  <div className="flex items-baseline gap-2.5 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">{label}</p>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest" style={{ fontFamily: "system-ui, sans-serif" }}>{value}</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <HR />

          {/* 2 — FEES */}
          <SectionHead number="2" title="Fee schedule" note="There are no hidden charges. Every amount you will ever pay or be deducted is listed here." />
          <div className="ml-12 mb-12" style={{ fontFamily: "system-ui, sans-serif" }}>
            {[
              { label: "License Activation",    amount: "$200.00",        timing: "Charged once, today",                      note: "Unlocks your node and all operator features for 4 full years. The clock starts the moment payment is confirmed." },
              { label: "Infrastructure Charge", amount: "$5.00 / month",  timing: "Auto-deducted from earnings every 30 days", note: "Covers electricity, cooling, and maintenance. Deducted from your balance — not billed to your card." },
              { label: "Inactivity Penalty",    amount: "20% of balance", timing: "Triggered after 3 consecutive idle days",   note: "If your node is unassigned for 3+ days, 20% of your balance compensates waiting clients. Assign daily to avoid this." },
              { label: "Renewal (year 4+)",     amount: "$200.00",        timing: "Optional — balance fully preserved",        note: "After your 4-year term you may renew at the same price. All earnings history and node config carry over." },
            ].map(({ label, amount, timing, note }) => (
              <div key={label} className="py-5 border-b border-gray-100 last:border-0">
                <div className="flex items-start justify-between gap-6">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 text-sm">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{timing}</p>
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{note}</p>
                  </div>
                  <span className="font-bold text-sm text-gray-900 shrink-0 mt-0.5 tabular-nums">{amount}</span>
                </div>
              </div>
            ))}
          </div>

          <HR />

          {/* 3 — LICENSE KEY */}
          <SectionHead number="3" title="License Key" note="Generate your key below. It will be saved to our database and emailed to you. Paste it in the validation field within 15 minutes." />
          <div className="ml-12 mb-6 space-y-6" style={{ fontFamily: "system-ui, sans-serif" }}>
            {/* Config toggles */}
            <div className="space-y-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Configuration</p>
              {[
                { label: "Update Environment",   checked: updateEnv,    onChange: setUpdateEnv,    desc: "When on, your node environment (GPU tier, region, deployment type) is automatically synced to OmniTask servers when you save changes." },
                { label: "Update License Key",   checked: updateLicKey, onChange: setUpdateLicKey, desc: "Allows the key input to be edited. Disable after validating to lock the field against accidental changes." },
                { label: "Show License Details", checked: showDetails,  onChange: setShowDetails,  desc: "Reveals the full license status panel — activation status, expiry date, node ID, and operator tier." },
              ].map(({ label, checked, onChange, desc }) => (
                <div key={label}>
                  <div className="flex items-center justify-between gap-6">
                    <p className="text-sm font-semibold text-gray-800">{label}</p>
                    <Toggle checked={checked} onChange={onChange} />
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed mt-1 pr-16">{desc}</p>
                </div>
              ))}
            </div>

            <KeyGenerator onKeyValidated={setValidatedKey} />

            {/* License details panel */}
            {showDetails && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-2">License Details</p>
                <p className="text-xs text-gray-500 leading-relaxed mb-4">Read-only summary fetched live from OmniTask licensing servers.</p>
                <div>
                  {[
                    { label: "License Key", value: mockDetailKey,                                    copyable: true },
                    { label: "Status",      value: validatedKey ? "Active" : "Not activated",         green: !!validatedKey },
                    { label: "Valid Until", value: validatedKey ? validUntil : "—" },
                    { label: "Tier",        value: validatedKey ? "Certified Operator" : "—",         amber: !!validatedKey },
                    { label: "Node ID",     value: validatedKey ? "NODE-A3F9C12B" : "—" },
                  ].map(({ label, value, copyable, green, amber }) => (
                    <div key={label} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 gap-6">
                      <span className="text-xs text-gray-500">{label}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-mono font-semibold ${green ? "text-green-600" : amber ? "text-amber-600" : "text-gray-800"}`}>{value}</span>
                        {copyable && (
                          <button onClick={() => { navigator.clipboard.writeText(mockDetailKey); setCopiedDetail(true); setTimeout(() => setCopiedDetail(false), 2000); }} className="text-gray-300 hover:text-gray-600 transition-colors">
                            {copiedDetail ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <HR />

          {/* 4 — ENVIRONMENT */}
          <SectionHead number="4" title="Environment" note="Your node's deployment environment determines which AI clients can allocate to it. Localhost is the default — it automatically switches to Production after payment is confirmed." />
          <div className="ml-12 mb-12 space-y-4" style={{ fontFamily: "system-ui, sans-serif" }}>
            {loadingEnv ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="animate-spin text-gray-400" />
                <span className="text-sm text-gray-500 ml-2">Loading environment...</span>
              </div>
            ) : (
              <>
                <table className="w-full text-sm overflow-x-auto" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #f3f4f6" }}>
                      {["Deploy Type", "License Instance", "CLS Instance", "Server ID"].map((h) => (
                        <th key={h} className="text-left py-3 pr-8 text-[10px] font-bold uppercase tracking-widest text-gray-400">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-4 pr-8 text-gray-700 font-medium text-sm">{isPaid ? "Production" : "Test"}</td>
                      <td className="py-4 pr-8 text-gray-400 text-sm">—</td>
                      <td className="py-4 pr-8 text-gray-400 text-sm">—</td>
                      <td className="py-4 pr-8">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                          isPaid 
                            ? "text-emerald-700 bg-emerald-50"
                            : "text-green-700 bg-green-50"
                        }`}>
                          {isPaid ? "Production Live" : "Localhost"}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
                {!isPaid && (
                  <div className="flex items-start gap-2.5 bg-amber-50 rounded-lg px-4 py-3">
                    <AlertCircle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      <strong>Test environment active.</strong> Your node will not earn real revenue until you complete your payment. Your environment will automatically upgrade to Production once payment is confirmed.
                    </p>
                  </div>
                )}
                {isPaid && (
                  <div className="flex items-start gap-2.5 bg-emerald-50 rounded-lg px-4 py-3">
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-700 leading-relaxed">
                      <strong>Production live!</strong> Your license is active and your node is in production. You are now earning real revenue from AI clients.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <HR />

          {/* 5 — UNITS */}
          <SectionHead number="5" title="Node Units" note="Units map your license to specific compute capabilities. Open means the slot is available and will be filled when you assign to a client." />
          <div className="ml-12 mb-12" style={{ fontFamily: "system-ui, sans-serif" }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-400">5 units registered · all slots open</p>
              <button className="text-gray-400 hover:text-gray-700 transition-colors" title="Refresh"><RefreshCw size={12} /></button>
            </div>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #f3f4f6" }}>
                  {["Function Code", "Description", "Name", "Qty", "Status"].map((h) => (
                    <th key={h} className="text-left py-3 pr-6 text-[10px] font-bold uppercase tracking-widest text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {UNITS.map((u, i) => (
                  <tr key={i} style={{ borderBottom: i < UNITS.length - 1 ? "1px solid #fafafa" : "none" }}>
                    <td className="py-3 pr-6 font-mono text-xs font-semibold text-gray-800">{u.code}</td>
                    <td className="py-3 pr-6 text-gray-600 text-xs">{u.desc}</td>
                    <td className="py-3 pr-6 text-gray-400 text-xs">{u.name}</td>
                    <td className="py-3 pr-6 text-gray-400 text-xs">{u.qty}</td>
                    <td className="py-3 pr-6 text-xs font-semibold text-green-600">{u.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <HR />

          {/* 6 — SIGNATURE */}
          <SectionHead number="6" title="Signed Agreement" note="A handwritten signature on paper is required to complete your operator registration. This is your legally binding consent to the license terms." />
          <div className="ml-12 mb-12"><SignatureUpload onSignatureUpload={setSignatureUploaded} /></div>

          <HR />

          {/* 7 — FAQ */}
          <SectionHead number="7" title="Common questions" note="Everything new operators ask before activating their first license." />
          <div className="ml-12 mb-12">{FAQS.map((faq) => <FAQItem key={faq.q} {...faq} />)}</div>

          <HR />

          {/* 8 — TERMS */}
          <SectionHead number="8" title="Terms & Conditions" note="Read carefully. By activating your license and completing checkout you agree to all of the following." />
          <div className="ml-12 mb-12 space-y-4" style={{ fontFamily: "system-ui, sans-serif" }}>
            {TERMS.map((t, i) => (
              <div key={i} className="flex gap-4">
                <span className="text-xs font-mono text-gray-300 shrink-0 mt-0.5 w-4">{i + 1}.</span>
                <p className="text-sm text-gray-600 leading-relaxed">{t}</p>
              </div>
            ))}
            <button onClick={() => setTermsOpen((v) => !v)} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-2">
              {termsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {termsOpen ? "Collapse" : "Read full legal terms"}
            </button>
            {termsOpen && (
              <div className="border border-gray-100 rounded-lg p-4 space-y-3 bg-gray-50">
                <p className="text-xs text-gray-600 font-semibold">OmniTask Pro Certified AI Operator License Agreement — Full Text</p>
                {TERMS.map((t, i) => (
                  <p key={i} className="text-xs text-gray-500 leading-relaxed">{String(i + 1).padStart(2, "0")}. {t}</p>
                ))}
              </div>
            )}
          </div>

          <HR />

          {/* 9 — CHECKOUT */}
          <SectionHead number="9" title="Complete your purchase" note="Both items below must be complete before the checkout button activates." />
          <div className="ml-12 space-y-6" style={{ fontFamily: "system-ui, sans-serif" }}>
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 mb-3">Checklist</p>
              {[
                { label: "License key generated, emailed, and validated", done: !!validatedKey },
                { label: "Signed agreement photo uploaded and verified",   done: signatureUploaded },
                { label: "Terms & Conditions accepted below",             done: termsAccepted  },
              ].map(({ label, done }) => (
                <div key={label} className="flex items-center gap-2.5">
                  {done
                    ? <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                    : <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 shrink-0" />}
                  <span className={`text-sm ${done ? "text-gray-700 line-through decoration-gray-300" : "text-gray-500"}`}>{label}</span>
                </div>
              ))}
            </div>

            <div>
              <div className="flex justify-between items-baseline py-3 border-b border-gray-100">
                <span className="text-sm text-gray-600">License — 4 years</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">$200.00</span>
              </div>
              <div className="flex justify-between items-baseline py-3 border-b border-gray-100">
                <span className="text-sm text-gray-600">Monthly infrastructure (deducted from balance)</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">+$5.00 / mo</span>
              </div>
              <div className="flex justify-between items-baseline py-3">
                <span className="font-bold text-gray-900">Due today</span>
                <span className="text-2xl font-bold text-black tabular-nums" style={{ fontFamily: "Georgia, serif" }}>$200.00</span>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer group select-none">
              <button
                onClick={() => setTermsAccepted((v) => !v)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${termsAccepted ? "bg-black border-black" : "border-gray-300 bg-white hover:border-gray-500"}`}
              >
                {termsAccepted && <Check size={11} className="text-white" strokeWidth={3} />}
              </button>
              <p className="text-sm text-gray-500 leading-relaxed group-hover:text-gray-700 transition-colors">
                I have read and understood everything on this page — the fee schedule, inactivity policy, and license terms.
                I agree that earnings are not guaranteed and that the $5.00 monthly infrastructure charge will be deducted from my balance automatically every 30 days.
              </p>
            </label>

            <div className="space-y-3">
              {!validatedKey && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                  <Key size={13} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    <strong>Key required.</strong> Generate and validate your license key in Section 3.
                    A link will also be sent to your email — paste it in Step B to unlock checkout.
                  </p>
                </div>
              )}

              {!signatureUploaded && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
                  <AlertCircle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 leading-relaxed">
                    <strong>Signature required.</strong> Upload your signed agreement photo in Section 6 before you can proceed to checkout.
                  </p>
                </div>
              )}

              <button
                onClick={() => {
                  if (!canCheckout) return;
                  const currentLicenseType = searchParams.get("licenseType") || "operator_license";
                  router.push(`/dashboard/checkout?purchaseType=license&licenseType=${currentLicenseType}&node=${currentLicenseType}&price=200&name=Certified+AI+Operator+License&key=${encodeURIComponent(validatedKey)}`);
                }}
                disabled={!canCheckout}
                className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${canCheckout ? "bg-black text-white hover:bg-gray-900 cursor-pointer" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
              >
                <Lock size={14} />
                Proceed to Secure Checkout — $200.00
                <ChevronRight size={14} />
              </button>

              <div className="flex items-center justify-center gap-6">
                {["SSL Secured", "PCI DSS Compliant", "256-bit Encrypted"].map((b) => (
                  <div key={b} className="flex items-center gap-1.5">
                    <Shield size={9} className="text-gray-300" />
                    <span className="text-[9px] text-gray-400 uppercase tracking-wider">{b}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="h-16" />
        </div>
      </div>
    </div>
  );
}

export default function LicensePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-7 h-7 border-2 border-t-gray-800 rounded-full animate-spin" />
      </div>
    }>
      <LicenseInner />
    </Suspense>
  );
}
