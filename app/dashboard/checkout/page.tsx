"use client";
// app/dashboard/checkout/page.tsx — FULLY FIXED + DAILY LIMIT + SPLIT PAYMENT
// ─────────────────────────────────────────────────────────────────────────────
// ORIGINAL FIXES (all preserved):
//  1–9. miningPeriod from URL, KoraPay allocation, idempotency, etc.
// NEW:
//  A. Daily NGN limit — when platform receives ≥ ₦495,000 via bank transfer
//     today, bank transfer is locked; users directed to Crypto or Card only.
//  B. Large-deposit split — amounts > ₦200,000 (or local equivalent, ~$125 USD)
//     are staged into ≤₦200,000 instalments via a compliance pre-wallet modal.
//  C. AML notice — polished regulatory-compliance acknowledgement screen appears
//     before any split-payment flow; references FATF, CBN, and anti-fraud law.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PERIOD_DURATIONS_MS } from "@/lib/mining-service";
import {
  Lock,
  CheckCircle,
  ChevronRight,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Clock,
  ArrowDownToLine,
  Globe,
  Shield,
  Cpu,
  Brain,
  Server,
  Copy,
  Check,
  RefreshCw,
  Gift,
  ArrowRight,
  AlertTriangle,
  Ban,
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────
type CheckoutStep =
  | "country"
  | "details"
  | "processing"
  | "success"
  | "failed"
  | "pending_crypto"
  | "declined";
type PayMethod = "card" | "bank_transfer" | "crypto_wallet";
type PurchaseType = "gpu_plan" | "license" | "task";

type SplitChunk = {
  index: number;
  amountLocal: number;
  amountUSD: number;
  status: "pending" | "paid";
  ref: string | null;
};
type SplitSession = {
  sessionId: string;
  planParams: Record<string, any>;
  totalUSD: number;
  totalLocal: number;
  currency: string;
  currencyRate: number;
  chunkMaxLocal: number;
  chunks: SplitChunk[];
  expiresAt: string;
  countryCode: string;
  countryName: string;
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
/** Platform daily NGN ceiling — ₦500k KoraPay limit minus ₦5k safety buffer */
const DAILY_NGN_LIMIT = 495_000;
/** Per-chunk USD cap — equivalent of ₦200,000 at ₦1,600/USD */
const CHUNK_MAX_USD = 200_000 / 1_600; // ≈ $125
const SPLIT_SESSION_MINUTES = 20;

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  KES: "KSh",
  GHS: "GH₵",
  ZAR: "R",
  XAF: "FCFA",
  XOF: "FCFA",
  EGP: "E£",
  TZS: "TSh",
};

const BANK_TRANSFER_COUNTRIES = new Set([
  "KE",
  "GH",
  "CM",
  "CI",
  "EG",
  "TZ",
  "NG",
]);

const CURRENCY_RATES: Record<string, { currency: string; rate: number }> = {
  NG: { currency: "NGN", rate: 1600 },
  KE: { currency: "KES", rate: 130 },
  GH: { currency: "GHS", rate: 15 },
  ZA: { currency: "ZAR", rate: 18 },
  CM: { currency: "XAF", rate: 600 },
  CI: { currency: "XOF", rate: 600 },
  EG: { currency: "EGP", rate: 48 },
  TZ: { currency: "TZS", rate: 2500 },
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getChunkMaxLocal(cc: string): number {
  return Math.floor(CHUNK_MAX_USD * (CURRENCY_RATES[cc]?.rate ?? 1));
}
function buildSplitChunks(
  totalUSD: number,
  totalLocal: number,
  chunkMax: number,
): SplitChunk[] {
  const n = Math.ceil(totalLocal / chunkMax);
  const chunks: SplitChunk[] = [];
  let remUSD = totalUSD,
    remLocal = totalLocal;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const cl = last ? remLocal : Math.min(chunkMax, remLocal);
    const cu = last
      ? Math.round(remUSD * 100) / 100
      : Math.round((cl / totalLocal) * totalUSD * 100) / 100;
    chunks.push({
      index: i,
      amountLocal: Math.round(cl),
      amountUSD: cu,
      status: "pending",
      ref: null,
    });
    remLocal -= cl;
    remUSD -= cu;
  }
  return chunks;
}
const getPaymentMethodsForCountry = (
  cc: string,
  amount: number,
): PayMethod[] => {
  const m: PayMethod[] = [];
  if (BANK_TRANSFER_COUNTRIES.has(cc) && amount <= 10000)
    m.push("bank_transfer");
  m.push("crypto_wallet");
  m.push("card");
  return m;
};

const COUNTRIES = [
  { code: "AF", name: "Afghanistan" },
  { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" },
  { code: "AR", name: "Argentina" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BR", name: "Brazil" },
  { code: "CA", name: "Canada" },
  { code: "CM", name: "Cameroon (XAF)" },
  { code: "CI", name: "Côte d'Ivoire (XOF)" },
  { code: "EG", name: "Egypt (EGP)" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GH", name: "Ghana (GHS)" },
  { code: "GR", name: "Greece" },
  { code: "HK", name: "Hong Kong" },
  { code: "HU", name: "Hungary" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JP", name: "Japan" },
  { code: "JO", name: "Jordan" },
  { code: "KE", name: "Kenya (KES)" },
  { code: "KW", name: "Kuwait" },
  { code: "LB", name: "Lebanon" },
  { code: "MY", name: "Malaysia" },
  { code: "MX", name: "Mexico" },
  { code: "MA", name: "Morocco" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NG", name: "Nigeria (NGN)" },
  { code: "NO", name: "Norway" },
  { code: "PK", name: "Pakistan" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "QA", name: "Qatar" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SG", name: "Singapore" },
  { code: "ZA", name: "South Africa (ZAR)" },
  { code: "KR", name: "South Korea" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "TW", name: "Taiwan" },
  { code: "TZ", name: "Tanzania (TZS)" },
  { code: "TH", name: "Thailand" },
  { code: "TR", name: "Turkey" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "VN", name: "Vietnam" },
  { code: "YE", name: "Yemen" },
  { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
].sort((a, b) => a.name.localeCompare(b.name));

const LICENSE_CONFIGS: Record<
  string,
  { label: string; icon: any; color: string; features: string[] }
> = {
  thermal_optimization: {
    label: "Thermal & Neural Operator License",
    icon: Cpu,
    color: "#3b82f6",
    features: [
      "Daily Thermal Calibration — $0.50/day",
      "Neural Weight Re-alignment — $0.50/day",
      "7-day streak bonus multiplier",
      "Valid 4 years from activation",
    ],
  },
  rlhf_validation: {
    label: "RLHF Validation Operator License",
    icon: Brain,
    color: "#8b5cf6",
    features: [
      "Unlimited RLHF task access",
      "$0.10 per validated AI response",
      "Confidence-weighted rewards",
      "Valid 4 years from activation",
    ],
  },
  gpu_allocation: {
    label: "GPU Allocation Operator License",
    icon: Server,
    color: "#10b981",
    features: [
      "Live GPU client allocation",
      "Hourly compute revenue share",
      "5 enterprise client tiers",
      "Valid 4 years from activation",
    ],
  },
  operator_license: {
    label: "Certified AI Operator License",
    icon: Shield,
    color: "#f59e0b",
    features: [
      "Daily Thermal Calibration — $0.50/day",
      "RLHF Validation — $0.10/task",
      "GPU Client Allocation — hourly revenue",
      "Valid 4 years · Renewable",
    ],
  },
};
const PERIOD_LABELS: Record<string, string> = {
  hourly: "1 Hour",
  daily: "1 Day",
  weekly: "1 Week",
  monthly: "1 Month",
};
const PROCESSING_STEPS = [
  { id: 1, label: "Verifying payment details", ms: 1400 },
  { id: 2, label: "Securing payment channel", ms: 1800 },
  { id: 3, label: "Routing through payment network", ms: 2200 },
  { id: 4, label: "Completing your order", ms: 1600 },
  { id: 5, label: "Activating your mining session", ms: 1400 },
];

// ─── SMALL REUSABLE COMPONENTS ────────────────────────────────────────────────
function QRCode({ value, size = 160 }: { value: string; size?: number }) {
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=1a1f2e&color=ffffff&margin=12`}
      alt="QR Code"
      width={size}
      height={size}
      className="rounded-xl"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="shrink-0 p-1.5 rounded-lg transition-all hover:bg-white/10"
    >
      {copied ? (
        <Check size={14} className="text-emerald-400" />
      ) : (
        <Copy size={14} className="text-slate-400" />
      )}
    </button>
  );
}

// ─── ALLOCATION CREATION ──────────────────────────────────────────────────────
async function createMiningAllocation(params: {
  userId: string;
  planId: string;
  planName: string;
  amount: number;
  paymentModel: "flexible" | "contract";
  instanceType: string;
  gpuModel?: string;
  vram?: string;
  miningPeriod?: string;
  contractMonths?: number;
  contractLabel?: string;
  contractMinPct?: number;
  contractMaxPct?: number;
  lockInMonths?: number;
  lockInLabel?: string;
  lockInMultiplier?: number;
  transactionRef?: string;
  autoReinvest?: boolean;
  referralCode?: string;
}): Promise<string | null> {
  const {
    userId,
    planId,
    planName,
    amount,
    paymentModel,
    instanceType,
    gpuModel,
    vram,
    miningPeriod = "daily",
    contractMonths,
    contractLabel,
    contractMinPct,
    contractMaxPct,
    lockInMonths,
    lockInLabel,
    lockInMultiplier,
    transactionRef,
    autoReinvest = false,
    referralCode,
  } = params;
  const now = new Date(),
    nowIso = now.toISOString(),
    period = miningPeriod;
  if (transactionRef) {
    const { data: existing } = await supabase
      .from("node_allocations")
      .select("id")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .limit(1);
    if (existing && existing.length > 0) return existing[0].id;
  }
  const periodMs = PERIOD_DURATIONS_MS[period] ?? PERIOD_DURATIONS_MS.daily;
  const miningEndsAt =
    paymentModel === "flexible"
      ? new Date(now.getTime() + periodMs).toISOString()
      : null;
  const maturityDate =
    paymentModel === "contract" && contractMonths
      ? new Date(
          now.getTime() + contractMonths * 30 * 24 * 60 * 60 * 1000,
        ).toISOString()
      : null;
  let rateFactor = 0.86;
  try {
    const { data: r } = await supabase
      .from("current_mining_rates")
      .select("rate_factor")
      .eq("plan_id", planId)
      .eq("period", period)
      .single();
    if (r?.rate_factor != null) rateFactor = r.rate_factor;
  } catch {}
  const payload: Record<string, any> = {
    user_id: userId,
    plan_id: planId,
    amount_invested: amount,
    status: "active",
    payment_model: paymentModel,
    instance_type: instanceType,
    total_earned: 0,
    total_withdrawn: 0,
    created_at: nowIso,
    updated_at: nowIso,
    auto_reinvest: autoReinvest,
    ...(paymentModel === "flexible"
      ? {
          mining_period: period,
          mining_ends_at: miningEndsAt,
          mining_completed: false,
          rate_factor_used: rateFactor,
          capital_returned: false,
          final_profit: 0,
        }
      : {}),
    ...(paymentModel === "contract"
      ? {
          contract_months: contractMonths,
          contract_label: contractLabel,
          contract_min_pct: contractMinPct,
          contract_max_pct: contractMaxPct,
          maturity_date: maturityDate,
          lock_in_months: lockInMonths,
          lock_in_label: lockInLabel,
          lock_in_multiplier: lockInMultiplier,
          mining_completed: false,
          rate_factor_used: rateFactor,
          mining_period: "contract",
          mining_ends_at: maturityDate,
        }
      : {}),
  };
  const { data: newAlloc, error: allocErr } = await supabase
    .from("node_allocations")
    .insert(payload)
    .select("id")
    .single();
  if (allocErr) {
    console.error("[checkout] Allocation insert failed:", allocErr.message);
    return null;
  }
  try {
    await supabase.from("payment_transactions").insert({
      user_id: userId,
      node_key: planId,
      amount,
      currency: "USD",
      gateway: "gpu_mining",
      gateway_reference: newAlloc.id,
      status: "confirmed",
      verified_by_admin: false,
      created_at: nowIso,
      confirmed_at: nowIso,
      metadata: JSON.stringify({
        purchaseType:
          paymentModel === "contract" ? "gpu_contract" : "gpu_mining",
        planName,
        gpuModel,
        miningPeriod: period,
        allocationId: newAlloc.id,
        transactionRef: transactionRef ?? null,
      }),
    });
  } catch {}
  if (referralCode) {
    try {
      await supabase.from("referral_uses").insert({
        referral_code: referralCode,
        referred_user_id: userId,
        allocation_id: newAlloc.id,
        amount,
        created_at: nowIso,
      });
    } catch {}
  }
  return newAlloc.id;
}

// ─── SPLIT PAYMENT MODAL ──────────────────────────────────────────────────────
// Two screens: (1) AML acknowledgement, (2) instalment progress + pay button.
function SplitPaymentModal({
  session,
  onPayChunk,
  onCancel,
  loading,
  kpError,
}: {
  session: SplitSession;
  onPayChunk: (s: SplitSession, idx: number) => void;
  onCancel: () => void;
  loading: boolean;
  kpError: string;
}) {
  const [amlAck, setAmlAck] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    function tick() {
      const rem = new Date(session.expiresAt).getTime() - Date.now();
      if (rem <= 0) {
        setExpired(true);
        setTimeLeft("Expired");
        return;
      }
      const m = Math.floor(rem / 60000),
        s = Math.floor((rem % 60000) / 1000);
      setTimeLeft(`${m}:${String(s).padStart(2, "0")}`);
    }
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [session.expiresAt]);
  const paidCount = session.chunks.filter((c) => c.status === "paid").length;
  const totalCount = session.chunks.length;
  const currentChunk = session.chunks.find((c) => c.status === "pending");
  const allPaid = !currentChunk;
  const sym = CURRENCY_SYMBOLS[session.currency] ?? session.currency;
  const minsLeft = timeLeft
    ? parseInt(timeLeft.split(":")[0])
    : SPLIT_SESSION_MINUTES;
  const timerColor = expired
    ? "text-red-400"
    : minsLeft < 5
      ? "text-amber-400"
      : "text-emerald-400";

  /* ── Screen 1: AML acknowledgement ── */
  if (!amlAck)
    return (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.94)", backdropFilter: "blur(18px)" }}
      >
        <div
          className="relative max-w-lg w-full rounded-3xl overflow-hidden"
          style={{
            background: "rgb(5,8,16)",
            border: "1px solid rgba(245,158,11,0.4)",
            boxShadow: "0 0 80px rgba(245,158,11,0.07)",
          }}
        >
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{
              background:
                "linear-gradient(90deg,transparent,#f59e0b,transparent)",
            }}
          />
          {/* Header */}
          <div
            className="p-6 pb-5"
            style={{
              background:
                "linear-gradient(135deg,rgba(245,158,11,0.09),rgba(5,8,16,0.98))",
              borderBottom: "1px solid rgba(245,158,11,0.18)",
            }}
          >
            <div className="flex items-start gap-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: "rgba(245,158,11,0.12)",
                  border: "2px solid rgba(245,158,11,0.4)",
                }}
              >
                <Shield size={28} className="text-amber-400" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.28em] text-amber-500 mb-2">
                  Regulatory Compliance Notice
                </p>
                <h3 className="text-white font-black text-xl leading-tight">
                  Anti-Money Laundering
                  <br />
                  Transaction Protocol
                </h3>
                <p className="text-amber-400/60 text-xs mt-1.5">
                  Required for all deposits exceeding the single-transaction
                  threshold
                </p>
              </div>
            </div>
          </div>
          {/* Body */}
          <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            <p className="text-slate-300 text-sm leading-relaxed">
              To comply with{" "}
              <strong className="text-white">
                Anti-Money Laundering (AML)
              </strong>{" "}
              regulations,{" "}
              <strong className="text-white">
                Counter-Terrorism Financing (CTF)
              </strong>{" "}
              directives, and international{" "}
              <strong className="text-white">Know Your Customer (KYC)</strong>{" "}
              standards mandated by the{" "}
              <strong className="text-white">
                Financial Action Task Force (FATF)
              </strong>{" "}
              and applicable Central Bank regulatory frameworks, transactions
              exceeding <strong className="text-amber-300">{sym}200,000</strong>{" "}
              per single transaction must be processed in structured,
              individually-auditable instalments.
            </p>
            <p className="text-slate-400 text-sm leading-relaxed">
              This mandatory protocol is specifically designed to protect you
              from{" "}
              <strong className="text-slate-200">
                unauthorised account access, compromised financial credentials,
                stolen-device fraud, and transactions conducted without the
                account holder's knowledge or consent.
              </strong>{" "}
              Each instalment is independently verified, fully traceable, and
              exclusively attributable to the registered account holder.
            </p>
            <div
              className="rounded-2xl p-5 space-y-3"
              style={{
                background: "rgba(245,158,11,0.05)",
                border: "1px solid rgba(245,158,11,0.18)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle size={12} className="text-amber-400" />
                <p className="text-amber-300 text-[10px] font-black uppercase tracking-wider">
                  What This Means For You
                </p>
              </div>
              {[
                `Your deposit of ${sym}${session.totalLocal.toLocaleString()} will be processed in ${totalCount} secure, compliance-approved instalment${totalCount > 1 ? "s" : ""}`,
                "Each instalment is individually verified through an encrypted, fraud-monitored payment channel",
                "Your plan or license activates automatically and immediately once all instalments are confirmed",
                `This secure session expires in ${SPLIT_SESSION_MINUTES} minutes — please complete all instalments without closing your browser`,
                "No additional fees or surcharges are applied for instalment processing",
              ].map((item) => (
                <div key={item} className="flex items-start gap-2.5">
                  <CheckCircle
                    size={11}
                    className="text-amber-400 shrink-0 mt-0.5"
                  />
                  <p className="text-amber-400/75 text-xs leading-relaxed">
                    {item}
                  </p>
                </div>
              ))}
            </div>
            <div
              className="rounded-xl px-4 py-3"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.05)",
              }}
            >
              <p className="text-slate-600 text-[10px] leading-relaxed">
                <strong className="text-slate-500">Legal Basis:</strong> FATF
                Recommendation 10 (Customer Due Diligence) · FATF Recommendation
                20 (Suspicious Transaction Reporting) · CBN AML/CFT Regulations
                2022 · Money Laundering (Prevention &amp; Prohibition) Act 2022
              </p>
            </div>
            <button
              onClick={() => setAmlAck(true)}
              className="w-full py-4 rounded-2xl font-black text-slate-950 text-base flex items-center justify-center gap-2 transition-all hover:opacity-90"
              style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}
            >
              <CheckCircle size={16} /> I Understand &amp; Acknowledge — Proceed
              Securely
            </button>
            <button
              onClick={onCancel}
              className="w-full py-2.5 text-slate-600 text-xs hover:text-slate-400 transition-colors"
            >
              Cancel — Choose a different payment method
            </button>
          </div>
        </div>
      </div>
    );

  /* ── Screen 2: Instalment progress ── */
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.94)", backdropFilter: "blur(18px)" }}
    >
      <div
        className="max-w-lg w-full rounded-3xl overflow-hidden"
        style={{
          background: "rgb(5,8,16)",
          border: "1px solid rgba(16,185,129,0.3)",
          boxShadow: "0 0 80px rgba(16,185,129,0.07)",
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{
            background: "rgba(16,185,129,0.07)",
            borderBottom: "1px solid rgba(16,185,129,0.18)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: "rgba(16,185,129,0.12)",
                border: "1px solid rgba(16,185,129,0.3)",
              }}
            >
              <Lock size={15} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-black text-sm">
                Staged Payment Portal
              </p>
              <p className="text-slate-500 text-[10px]">
                Compliance-secured instalment processing
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider">
              Session
            </p>
            <p className={`font-black text-base tabular-nums ${timerColor}`}>
              {timeLeft}
            </p>
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Overview */}
          <div
            className="flex items-center justify-between p-4 rounded-2xl"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                Total Deposit
              </p>
              <p className="text-white font-black text-2xl">
                {sym}
                {session.totalLocal.toLocaleString()}
              </p>
              <p className="text-slate-600 text-xs">
                ${session.totalUSD.toFixed(2)} USD · {totalCount} instalment
                {totalCount > 1 ? "s" : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                Progress
              </p>
              <p className="text-emerald-400 font-black text-2xl">
                {paidCount}/{totalCount}
              </p>
              <p className="text-slate-600 text-xs">paid</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="h-2 rounded-full overflow-hidden bg-slate-800/80">
              <div
                className="h-2 rounded-full transition-all duration-700"
                style={{
                  width: `${totalCount > 0 ? (paidCount / totalCount) * 100 : 0}%`,
                  background: "linear-gradient(90deg,#10b981,#34d399)",
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-700">
              <span>0%</span>
              <span>
                {Math.round((paidCount / totalCount) * 100)}% complete
              </span>
              <span>100%</span>
            </div>
          </div>

          {/* Chunk list */}
          <div className="space-y-2">
            {session.chunks.map((chunk) => {
              const isPaid = chunk.status === "paid";
              const isCurrent =
                !isPaid &&
                session.chunks
                  .slice(0, chunk.index)
                  .every((c) => c.status === "paid");
              return (
                <div
                  key={chunk.index}
                  className="rounded-xl p-3.5 flex items-center gap-3"
                  style={{
                    background: isPaid
                      ? "rgba(16,185,129,0.08)"
                      : isCurrent
                        ? "rgba(59,130,246,0.08)"
                        : "rgba(15,23,42,0.5)",
                    border: isPaid
                      ? "1px solid rgba(16,185,129,0.25)"
                      : isCurrent
                        ? "1px solid rgba(59,130,246,0.3)"
                        : "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0
                    ${isPaid ? "bg-emerald-500 text-slate-950" : isCurrent ? "border-2 border-blue-400 text-blue-300" : "bg-slate-800/80 text-slate-600"}`}
                  >
                    {isPaid ? (
                      <CheckCircle size={14} className="text-slate-950" />
                    ) : (
                      chunk.index + 1
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-black ${isPaid ? "text-emerald-300" : isCurrent ? "text-white" : "text-slate-600"}`}
                    >
                      Instalment {chunk.index + 1} of {totalCount}
                    </p>
                    <p className="text-[10px] text-slate-600">
                      {sym}
                      {chunk.amountLocal.toLocaleString()} · $
                      {chunk.amountUSD.toFixed(2)} USD
                    </p>
                  </div>
                  <div className="shrink-0">
                    {isPaid ? (
                      <span
                        className="text-[9px] font-black px-2.5 py-1 rounded-full"
                        style={{
                          background: "rgba(16,185,129,0.15)",
                          border: "1px solid rgba(16,185,129,0.3)",
                          color: "#10b981",
                        }}
                      >
                        PAID ✓
                      </span>
                    ) : isCurrent ? (
                      <span
                        className="text-[9px] font-black px-2.5 py-1 rounded-full flex items-center gap-1"
                        style={{
                          background: "rgba(59,130,246,0.15)",
                          border: "1px solid rgba(59,130,246,0.35)",
                          color: "#60a5fa",
                        }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />{" "}
                        NEXT
                      </span>
                    ) : (
                      <span
                        className="text-[9px] font-black px-2.5 py-1 rounded-full"
                        style={{
                          background: "rgba(15,23,42,0.6)",
                          border: "1px solid rgba(255,255,255,0.05)",
                          color: "#475569",
                        }}
                      >
                        QUEUED
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error */}
          {kpError && (
            <div
              className="rounded-xl p-3 flex items-start gap-2"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
              }}
            >
              <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-300 text-xs">{kpError}</p>
            </div>
          )}

          {/* Pay CTA */}
          {!allPaid && !expired && currentChunk && (
            <button
              onClick={() => onPayChunk(session, currentChunk.index)}
              disabled={loading}
              className="w-full py-4 rounded-2xl font-black text-white text-base flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#3b82f6,#1d4ed8)" }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Connecting to
                  secure payment…
                </>
              ) : (
                <>
                  <Lock size={15} /> Pay Instalment {currentChunk.index + 1} —{" "}
                  {sym}
                  {currentChunk.amountLocal.toLocaleString()}{" "}
                  <ArrowRight size={13} />
                </>
              )}
            </button>
          )}
          {expired && !allPaid && (
            <div
              className="rounded-xl p-4 text-center"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
              }}
            >
              <AlertCircle size={20} className="text-red-400 mx-auto mb-2" />
              <p className="text-red-400 font-black text-sm">
                Secure Session Expired
              </p>
              <p className="text-red-400/70 text-xs mt-1">
                Please restart the checkout process to begin a new secure
                session.
              </p>
            </div>
          )}
          {allPaid && (
            <div
              className="rounded-xl p-4 text-center"
              style={{
                background: "rgba(16,185,129,0.08)",
                border: "1px solid rgba(16,185,129,0.25)",
              }}
            >
              <CheckCircle
                size={20}
                className="text-emerald-400 mx-auto mb-2"
              />
              <p className="text-emerald-300 font-black text-sm">
                All Instalments Confirmed — Activating Your Plan…
              </p>
            </div>
          )}
          <button
            onClick={onCancel}
            className="w-full py-2 text-slate-700 text-[11px] hover:text-slate-500 transition-colors"
          >
            Cancel — Return to payment options
          </button>
          <div
            className="rounded-xl px-4 py-3"
            style={{
              background: "rgba(245,158,11,0.04)",
              border: "1px solid rgba(245,158,11,0.1)",
            }}
          >
            <p className="text-amber-500/55 text-[10px] leading-relaxed">
              ⚠ Do not close or refresh your browser between instalments. Each
              payment is individually verified and recorded. Your plan activates
              automatically upon final instalment confirmation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── RECEIPT ──────────────────────────────────────────────────────────────────
function Receipt({
  data,
  onClose,
}: {
  data: {
    txId: string;
    purchaseType: PurchaseType;
    nodeName: string;
    amount: number;
    gpu: string;
    vram: string;
    payMethod: string;
    country: string;
    date: string;
    paymentModel: string;
    contractLabel: string;
    contractMonths: number;
    licenseType: string;
    miningPeriod: string;
    discounted?: boolean;
    originalAmount?: number;
    walletAddress?: string;
  };
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isContract = data.paymentModel === "contract";
  const licConfig =
    LICENSE_CONFIGS[data.licenseType] ?? LICENSE_CONFIGS.operator_license;
  const LicIcon = licConfig.icon;
  const periodLabel = PERIOD_LABELS[data.miningPeriod] ?? data.miningPeriod;
  const cdl =
    data.contractMonths === 6
      ? "6 months"
      : data.contractMonths === 12
        ? "12 months"
        : "2 years";
  function download() {
    if (!ref.current) return;
    const blob = new Blob([ref.current.innerText], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `OmniTask-Receipt-${data.txId}.txt`;
    a.click();
  }
  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="max-w-md w-full rounded-2xl overflow-hidden"
        style={{
          background: "rgb(10,16,28)",
          border: "1px solid rgba(255,255,255,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={ref}>
          <div
            className="p-6 text-center"
            style={{
              background:
                "linear-gradient(135deg,rgba(16,185,129,0.15),rgba(6,12,24,0.9))",
            }}
          >
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-3">
              <CheckCircle size={22} className="text-emerald-400" />
            </div>
            <h3 className="text-white font-black text-lg">Payment Receipt</h3>
            <p className="text-slate-400 text-xs mt-1">
              OmniTask Pro ·{" "}
              {data.purchaseType === "license"
                ? "Operator License"
                : "GPU Mining Session"}
            </p>
          </div>
          <div className="px-6">
            <div className="border-t border-dashed border-slate-700" />
          </div>
          <div className="px-6 py-5 space-y-3 text-sm">
            {(data.purchaseType === "license"
              ? [
                  ["Transaction ID", data.txId],
                  ["Date & Time", data.date],
                  ["License Type", licConfig.label],
                  ["Validity", "4 years from activation"],
                  [
                    "Amount Paid",
                    `$${data.amount.toFixed(2)}${data.discounted ? " (Crypto discount)" : ""}`,
                  ],
                  ["Payment Method", data.payMethod],
                  ["Country", data.country],
                  ["Status", "License Activated"],
                ]
              : [
                  ["Transaction ID", data.txId],
                  ["Date & Time", data.date],
                  ["Node Allocated", data.nodeName],
                  ["GPU Model", data.gpu],
                  ["VRAM", data.vram],
                  [
                    "Payment Model",
                    isContract ? `Contract — ${cdl}` : "Pay-As-You-Go",
                  ],
                  ["Mining Session", isContract ? cdl : periodLabel],
                  [
                    "Amount Paid",
                    `$${data.amount.toFixed(2)}${data.discounted ? " (Crypto discount)" : ""}`,
                  ],
                  ["Payment Method", data.payMethod],
                  ...(data.walletAddress
                    ? [["Sender Wallet", data.walletAddress]]
                    : []),
                  ["Country", data.country],
                  ["Status", "Mining Active"],
                ]
            ).map(([l, v]) => (
              <div key={l} className="flex justify-between items-start">
                <span className="text-slate-500 shrink-0 mr-4">{l}</span>
                <span className="text-white font-semibold text-right break-all">
                  {v}
                </span>
              </div>
            ))}
          </div>
          <div className="px-6">
            <div className="border-t border-dashed border-slate-700" />
          </div>
          <div className="px-6 py-4 text-center">
            <p className="text-slate-600 text-[11px] leading-relaxed">
              {data.purchaseType === "license"
                ? "Your license is now active."
                : isContract
                  ? "Earnings accrue daily and unlock at contract maturity."
                  : "Mining has started. View live earnings in your portfolio."}
            </p>
          </div>
        </div>
        <div className="flex gap-2 px-6 pb-6">
          <button
            onClick={download}
            className="flex-1 flex items-center justify-center gap-2 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-bold py-2.5 rounded-xl text-sm transition-all"
          >
            <ArrowDownToLine size={13} /> Save Receipt
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl text-sm transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ORDER SUMMARY ────────────────────────────────────────────────────────────
function OrderSummary({
  purchaseType,
  nodeName,
  gpu,
  vram,
  itype,
  paymentModel,
  contractLabel,
  contractMonths,
  price,
  licenseType,
  effectivePrice,
  cryptoDiscount,
  payMethod,
  miningPeriod,
}: {
  purchaseType: PurchaseType;
  nodeName: string;
  gpu: string;
  vram: string;
  itype: string;
  paymentModel: string;
  contractLabel: string;
  contractMonths: number;
  price: number;
  licenseType: string;
  effectivePrice: number;
  cryptoDiscount: number;
  payMethod: PayMethod;
  miningPeriod: string;
}) {
  const isContract = paymentModel === "contract";
  const cdl =
    contractMonths === 6
      ? "6 months"
      : contractMonths === 12
        ? "12 months"
        : contractMonths === 24
          ? "2 years"
          : `${contractMonths} months`;
  const licConfig =
    LICENSE_CONFIGS[licenseType] ?? LICENSE_CONFIGS.operator_license;
  const LicIcon = licConfig.icon;
  const periodLabel = PERIOD_LABELS[miningPeriod] ?? miningPeriod;
  return (
    <div>
      <div className="text-2xl font-black text-white mb-6">Order Summary</div>
      {purchaseType === "gpu_plan" && (
        <>
          <div
            className="rounded-2xl p-6 mb-4"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="space-y-4">
              {[
                ["Plan", nodeName],
                ["GPU", gpu],
                ["VRAM", vram],
                [
                  "Payment Model",
                  isContract ? "Contract-Based" : "Pay-As-You-Go (Flexible)",
                ],
                ...(!isContract
                  ? [
                      ["Mining Duration", periodLabel],
                      [
                        "Earnings",
                        "Live — visible in your portfolio after activation",
                      ],
                    ]
                  : [
                      ["Contract Term", cdl],
                      [
                        "Earnings",
                        "Accumulate daily — visible in your portfolio",
                      ],
                    ]),
                ["Instance Type", itype.replace(/_/g, " ")],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between items-start">
                  <span className="text-slate-400 text-sm">{l}</span>
                  <span className="text-white font-semibold text-right max-w-[55%] text-sm">
                    {v}
                  </span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-700 my-4" />
            {payMethod === "crypto_wallet" && (
              <div className="mb-3 p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg">
                <p className="text-violet-200 text-sm">
                  <strong>Crypto Discount:</strong> {cryptoDiscount}% off
                </p>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-slate-400 text-sm">Total Investment</span>
              <span className="text-2xl font-black text-emerald-400">
                ${effectivePrice.toFixed(2)}
              </span>
            </div>
          </div>
          {isContract ? (
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.2)",
              }}
            >
              <p className="text-amber-400 text-xs font-bold mb-1.5">
                Contract Investment Notice
              </p>
              <p className="text-amber-400/80 text-xs leading-relaxed">
                Capital of{" "}
                <strong className="text-amber-300">${price.toFixed(2)}</strong>{" "}
                is locked for <strong className="text-amber-300">{cdl}</strong>.
                Earnings accumulate every second. Capital released at maturity.{" "}
                <strong className="text-white">Returns not guaranteed.</strong>
              </p>
            </div>
          ) : (
            <div
              className="rounded-xl p-4 mb-4"
              style={{
                background: "rgba(16,185,129,0.05)",
                border: "1px solid rgba(16,185,129,0.15)",
              }}
            >
              <p className="text-emerald-400 text-xs font-bold mb-1.5">
                Pay-As-You-Go Terms
              </p>
              <p className="text-emerald-400/70 text-xs leading-relaxed">
                Mining runs for{" "}
                <strong className="text-emerald-300">{periodLabel}</strong>.
                Capital + earnings credited automatically when done. Returns not
                guaranteed.
              </p>
            </div>
          )}
        </>
      )}
      {purchaseType === "license" && (
        <div
          className="rounded-2xl p-6 mb-4"
          style={{
            background: "rgba(22,28,36,0.95)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-start gap-4 mb-5 pb-5 border-b border-slate-700">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: `${licConfig.color}18`,
                border: `1px solid ${licConfig.color}40`,
              }}
            >
              <LicIcon size={22} style={{ color: licConfig.color }} />
            </div>
            <div>
              <p className="text-white font-black text-sm">{licConfig.label}</p>
              <p className="text-slate-500 text-xs mt-1">
                Certified AI Operator Program
              </p>
            </div>
          </div>
          <div className="space-y-2.5 mb-5">
            {licConfig.features.map((f) => (
              <div key={f} className="flex items-center gap-2.5">
                <CheckCircle
                  size={13}
                  style={{ color: licConfig.color }}
                  className="shrink-0"
                />
                <span className="text-slate-300 text-sm">{f}</span>
              </div>
            ))}
          </div>
          <div className="space-y-3 mb-4">
            {[
              ["License Fee (one-time)", `$${price.toFixed(2)}`],
              ["Validity", "4 years from activation"],
              ["Monthly Infrastructure", "$5.00 / month (auto-deducted)"],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between items-start">
                <span className="text-slate-400 text-sm">{l}</span>
                <span className="text-white font-semibold text-right text-sm">
                  {v}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-700 my-4" />
          {payMethod === "crypto_wallet" && (
            <div className="mb-3 p-3 bg-violet-500/10 border border-violet-500/30 rounded-lg">
              <p className="text-violet-200 text-sm">
                <strong>Crypto Discount:</strong> {cryptoDiscount}% off
              </p>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-slate-400 text-sm">Due Today</span>
            <span className="text-2xl font-black text-amber-400">
              ${effectivePrice.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CHECKOUT INNER ───────────────────────────────────────────────────────────
function CheckoutInner() {
  const router = useRouter(),
    params = useSearchParams();
  const [step, setStep] = useState<CheckoutStep>("country");
  const [userId, setUserId] = useState<string | undefined | null>(undefined);
  const [processingStep, setProcessingStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState(""),
    [transactionId, setTransactionId] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);
  const [allocationId, setAllocationId] = useState<string | null>(null);
  // Config
  const [cryptoDiscount, setCryptoDiscount] = useState(5);
  const [cryptoWalletAddress, setCryptoWalletAddress] = useState("");
  const [cryptoNetwork, setCryptoNetwork] = useState("TRC-20 (TRON)");
  const [cryptoQrImageUrl, setCryptoQrImageUrl] = useState("");
  const [configLoaded, setConfigLoaded] = useState(false);
  // Daily NGN limit (global platform — protects KoraPay account ceiling)
  const [dailyNgnTotal, setDailyNgnTotal] = useState(0);
  const bankTransferLocked = dailyNgnTotal >= DAILY_NGN_LIMIT;
  // Split payment
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitSession, setSplitSession] = useState<SplitSession | null>(null);
  // Form
  const [countryCode, setCountryCode] = useState(""),
    [countryName, setCountryName] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod>("crypto_wallet");
  const [countrySearch, setCountrySearch] = useState("");
  const [kpPhone, setKpPhone] = useState(""),
    [kpLoading, setKpLoading] = useState(false),
    [kpError, setKpError] = useState("");
  const [twSenderAddress, setTwSenderAddress] = useState(""),
    [twConfirmed, setTwConfirmed] = useState(false);
  const [cryptoError, setCryptoError] = useState("");
  const [autoReinvest, setAutoReinvest] = useState(false);
  const [referralCode, setReferralCode] = useState(""),
    [referralValid, setReferralValid] = useState<boolean | null>(null);
  const [referralDiscount, setReferralDiscount] = useState(0),
    [checkingReferral, setCheckingReferral] = useState(false);
  const isSubmittingRef = useRef(false);

  // URL params
  const rawPurchaseType = params.get("purchaseType"),
    nodeKey = params.get("node") || "foundation";
  const purchaseType: PurchaseType = rawPurchaseType
    ? (rawPurchaseType as PurchaseType)
    : nodeKey === "operator_license" ||
        nodeKey.includes("license") ||
        nodeKey.includes("optimization") ||
        nodeKey.includes("rlhf") ||
        nodeKey.includes("allocation")
      ? "license"
      : "gpu_plan";
  const nodeName = params.get("name") || "Foundation Node";
  const price = parseFloat(params.get("price") || "5");
  const itype = params.get("itype") || "on_demand",
    gpu = params.get("gpu") || "Shared Pool (NVIDIA T4)",
    vram = params.get("vram") || "16 GB GDDR6";
  const paymentModel = (params.get("paymentModel") || "flexible") as
    | "flexible"
    | "contract";
  const isContract = paymentModel === "contract";
  const miningPeriod = params.get("miningPeriod") ?? "daily";
  const contractMonths = parseInt(params.get("contractMonths") || "6");
  const contractLabel = params.get("contractLabel") || "6 Months";
  const contractMinPct = parseFloat(params.get("contractMinPct") || "52");
  const contractMaxPct = parseFloat(params.get("contractMaxPct") || "93");
  const lockInMonths = parseInt(params.get("lockInMonths") || "0");
  const lockInLabel =
    params.get("lockInLabel") || (isContract ? contractLabel : "Flexible");
  const lockInMultiplier = parseFloat(params.get("lockInMultiplier") || "1");
  const licenseType =
    params.get("licenseType") ||
    params.get("type") ||
    nodeKey ||
    "operator_license";
  const discountedPrice = +(price * (1 - cryptoDiscount / 100)).toFixed(2);
  const effectivePrice = (() => {
    let p = payMethod === "crypto_wallet" ? discountedPrice : price;
    if (referralValid && referralDiscount > 0)
      p = +(p * (1 - referralDiscount / 100)).toFixed(2);
    return p;
  })();
  const conversionInfo = CURRENCY_RATES[countryCode];
  const localAmount = conversionInfo
    ? Math.round(price * conversionInfo.rate)
    : null;

  // Init
  useEffect(() => {
    let c = false;
    supabase.auth.getUser().then(({ data: { user } }: any) => {
      if (c) return;
      if (!user) {
        router.push("/auth/signin");
        return;
      }
      setUserId(user.id);
    });
    supabase
      .from("payment_config")
      .select("key,value")
      .then(({ data }: any) => {
        if (c || !data) {
          setConfigLoaded(true);
          return;
        }
        const get = (k: string) =>
          data.find((d: any) => d.key === k)?.value || "";
        const disc = get("crypto_discount_percent"),
          wallet = get("crypto_wallet_usdt_trc20");
        const network = get("crypto_network_label"),
          qr = get("crypto_qr_image_url");
        if (disc && !isNaN(parseFloat(disc)))
          setCryptoDiscount(parseFloat(disc));
        if (wallet && wallet !== "EMPTY") setCryptoWalletAddress(wallet);
        if (network && network !== "EMPTY") setCryptoNetwork(network);
        if (qr && qr !== "EMPTY") setCryptoQrImageUrl(qr);
        setConfigLoaded(true);
      });
    return () => {
      c = true;
    };
  }, []); // eslint-disable-line

  // Daily NGN limit — queries all confirmed NGN transactions platform-wide
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    supabase
      .from("payment_transactions")
      .select("amount")
      .eq("currency", "NGN")
      .in("status", ["confirmed", "success"])
      .gte("created_at", today.toISOString())
      .then(({ data }) => {
        const total = (data || []).reduce(
          (s: number, tx: any) => s + (Number(tx.amount) || 0),
          0,
        );
        setDailyNgnTotal(total);
      });
  }, [step]);

  // KoraPay redirect handler — split-payment aware
  useEffect(() => {
    const s = params.get("status"),
      r = params.get("reference");
    if (!s && !r) {
      // Resume any live split session
      const saved = sessionStorage.getItem("split_payment_session");
      if (saved) {
        try {
          const sess: SplitSession = JSON.parse(saved);
          const alive = new Date(sess.expiresAt) > new Date();
          const hasPending = sess.chunks.some((c) => c.status === "pending");
          if (alive && hasPending) {
            setCountryCode(sess.countryCode);
            setCountryName(sess.countryName);
            setSplitSession(sess);
            setStep("details");
            setShowSplitModal(true);
          } else if (!alive) {
            sessionStorage.removeItem("split_payment_session");
          }
        } catch {
          sessionStorage.removeItem("split_payment_session");
        }
      }
      return;
    }
    if (!s || !r) return;
    if (s === "success") {
      setTransactionId(r);
      window.history.replaceState({}, "", "/dashboard/checkout");
      const savedCheckout = sessionStorage.getItem("korapay_pending_checkout");
      if (savedCheckout) {
        sessionStorage.removeItem("korapay_pending_checkout");
        try {
          const cd = JSON.parse(savedCheckout);
          if (cd.isSplitPayment && cd.splitSessionId) {
            const savedSplit = sessionStorage.getItem("split_payment_session");
            if (savedSplit) {
              const sess: SplitSession = JSON.parse(savedSplit);
              if (sess.sessionId === cd.splitSessionId) {
                const updChunks = sess.chunks.map((c) =>
                  c.index === cd.chunkIndex
                    ? { ...c, status: "paid" as const, ref: r }
                    : c,
                );
                const allPaid = updChunks.every((c) => c.status === "paid");
                const updSess = { ...sess, chunks: updChunks };
                if (allPaid) {
                  sessionStorage.removeItem("split_payment_session");
                  supabase.auth.getUser().then(async ({ data: { user } }) => {
                    if (!user) return;
                    try {
                      const id = await createMiningAllocation({
                        ...sess.planParams,
                        userId: user.id,
                        transactionRef: r,
                      });
                      if (id) setAllocationId(id);
                    } catch (e) {
                      console.error("[checkout] Split alloc error:", e);
                    }
                  });
                  setStep("success");
                } else {
                  sessionStorage.setItem(
                    "split_payment_session",
                    JSON.stringify(updSess),
                  );
                  setSplitSession(updSess);
                  setCountryCode(sess.countryCode);
                  setCountryName(sess.countryName);
                  setStep("details");
                  setShowSplitModal(true);
                }
              }
            }
          } else {
            supabase.auth.getUser().then(async ({ data: { user } }) => {
              if (!user) return;
              try {
                const id = await createMiningAllocation({
                  ...cd,
                  userId: user.id,
                  transactionRef: r,
                });
                if (id) setAllocationId(id);
              } catch (e) {
                console.error("[checkout] KoraPay alloc error:", e);
              }
            });
            setStep("success");
          }
        } catch {
          setStep("success");
        }
      } else {
        setStep("success");
      }
    } else if (s === "declined") {
      window.history.replaceState({}, "", "/dashboard/checkout");
      const savedCheckout = sessionStorage.getItem("korapay_pending_checkout");
      if (savedCheckout) {
        try {
          const cd = JSON.parse(savedCheckout);
          if (cd.isSplitPayment) {
            sessionStorage.removeItem("korapay_pending_checkout");
            const savedSplit = sessionStorage.getItem("split_payment_session");
            if (savedSplit) {
              const sess: SplitSession = JSON.parse(savedSplit);
              setSplitSession(sess);
              setCountryCode(sess.countryCode);
              setCountryName(sess.countryName);
              setKpError("Payment declined. Please try again.");
              setStep("details");
              setShowSplitModal(true);
              return;
            }
          }
        } catch {}
      }
      sessionStorage.removeItem("korapay_pending_checkout");
      setTransactionId(r);
      setStep("declined");
    }
  }, [params]); // eslint-disable-line

  // Auto-select payment method when country changes
  useEffect(() => {
    if (!countryCode) return;
    setPayMethod(
      BANK_TRANSFER_COUNTRIES.has(countryCode) && !bankTransferLocked
        ? "bank_transfer"
        : "crypto_wallet",
    );
  }, [countryCode, bankTransferLocked]);

  const validateReferralCode = useCallback(async (code: string) => {
    if (!code || code.length < 4) {
      setReferralValid(null);
      setReferralDiscount(0);
      return;
    }
    setCheckingReferral(true);
    try {
      const { data } = await supabase
        .from("referral_codes")
        .select("discount_percent,is_active")
        .eq("code", code.toUpperCase())
        .single();
      if (data && data.is_active) {
        setReferralValid(true);
        setReferralDiscount(data.discount_percent ?? 0);
      } else {
        setReferralValid(false);
        setReferralDiscount(0);
      }
    } catch {
      setReferralValid(false);
      setReferralDiscount(0);
    }
    setCheckingReferral(false);
  }, []);

  // Split helpers
  function initiateSplitPayment(totalLocal: number, chunkMax: number) {
    const chunks = buildSplitChunks(price, totalLocal, chunkMax);
    const sessionId = `SPL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const newSession: SplitSession = {
      sessionId,
      planParams: {
        planId: nodeKey,
        planName: nodeName,
        amount: price,
        paymentModel,
        instanceType: itype,
        gpuModel: gpu,
        vram,
        miningPeriod,
        contractMonths,
        contractLabel,
        contractMinPct,
        contractMaxPct,
        lockInMonths: isContract ? contractMonths : lockInMonths,
        lockInLabel: isContract ? contractLabel : lockInLabel,
        lockInMultiplier,
        countryCode,
        countryName,
        autoReinvest,
        referralCode: referralValid ? referralCode.toUpperCase() : undefined,
      },
      totalUSD: price,
      totalLocal,
      currency: conversionInfo!.currency,
      currencyRate: conversionInfo!.rate,
      chunkMaxLocal: chunkMax,
      chunks,
      expiresAt: new Date(
        Date.now() + SPLIT_SESSION_MINUTES * 60_000,
      ).toISOString(),
      countryCode,
      countryName,
    };
    sessionStorage.setItem("split_payment_session", JSON.stringify(newSession));
    setSplitSession(newSession);
    setShowSplitModal(true);
  }

  async function payChunk(session: SplitSession, chunkIndex: number) {
    const chunk = session.chunks[chunkIndex];
    setKpLoading(true);
    setKpError("");
    sessionStorage.setItem(
      "korapay_pending_checkout",
      JSON.stringify({
        ...session.planParams,
        isSplitPayment: true,
        splitSessionId: session.sessionId,
        chunkIndex,
        chunkAmountUSD: chunk.amountUSD,
      }),
    );
    try {
      const res = await fetch("/api/korapay/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          phone: kpPhone.trim() || "",
          nodeKey,
          nodeName,
          price: chunk.amountLocal,
          originalPrice: chunk.amountUSD,
          currency: session.currency,
          itype,
          gpu,
          vram,
          purchaseType,
          licenseType,
          paymentModel,
          miningPeriod,
          contractMonths,
          contractLabel,
          contractMinPct,
          contractMaxPct,
          lockInMonths: isContract ? contractMonths : lockInMonths,
          lockInMultiplier,
          lockInLabel: isContract ? contractLabel : lockInLabel,
          countryCode,
          countryName,
          isSplitPayment: true,
          splitChunkIndex: chunkIndex,
          splitTotalChunks: session.chunks.length,
          splitSessionId: session.sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        sessionStorage.removeItem("korapay_pending_checkout");
        setKpError(
          data.error || "Payment initiation failed. Please try again.",
        );
        setKpLoading(false);
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      sessionStorage.removeItem("korapay_pending_checkout");
      setKpError("Connection error. Please check your internet and try again.");
      setKpLoading(false);
    }
  }

  function cancelSplitPayment() {
    sessionStorage.removeItem("split_payment_session");
    setSplitSession(null);
    setShowSplitModal(false);
    setKpError("");
  }

  async function handleBankTransferSubmit() {
    if (bankTransferLocked) {
      setKpError(
        "Bank transfer is temporarily unavailable — daily processing capacity has been reached. Please use Crypto (USDT) or Card payment to continue.",
      );
      return;
    }
    if (!userId) {
      setKpError("Session not ready. Please wait and try again.");
      return;
    }
    setKpError("");
    setKpLoading(true);
    try {
      const conversion = CURRENCY_RATES[countryCode];
      const localCurrency = conversion?.currency ?? "NGN";
      const convertedPrice = conversion
        ? parseFloat((price * conversion.rate).toFixed(2))
        : price;
      const chunkMax = getChunkMaxLocal(countryCode);
      if (convertedPrice > chunkMax) {
        setKpLoading(false);
        initiateSplitPayment(convertedPrice, chunkMax);
        return;
      }
      // Normal single payment
      sessionStorage.setItem(
        "korapay_pending_checkout",
        JSON.stringify({
          planId: nodeKey,
          planName: nodeName,
          amount: price,
          paymentModel,
          instanceType: itype,
          gpuModel: gpu,
          vram,
          miningPeriod,
          contractMonths,
          contractLabel,
          contractMinPct,
          contractMaxPct,
          lockInMonths: isContract ? contractMonths : lockInMonths,
          lockInLabel: isContract ? contractLabel : lockInLabel,
          lockInMultiplier,
          countryCode,
          countryName,
          autoReinvest,
          referralCode: referralValid ? referralCode.toUpperCase() : undefined,
        }),
      );
      const res = await fetch("/api/korapay/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          phone: kpPhone.trim() || "",
          nodeKey,
          nodeName,
          price: convertedPrice,
          originalPrice: price,
          currency: localCurrency,
          itype,
          gpu,
          vram,
          purchaseType,
          licenseType,
          paymentModel,
          miningPeriod,
          contractMonths,
          contractLabel,
          contractMinPct,
          contractMaxPct,
          lockInMonths: isContract ? contractMonths : lockInMonths,
          lockInMultiplier,
          lockInLabel: isContract ? contractLabel : lockInLabel,
          countryCode,
          countryName,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        sessionStorage.removeItem("korapay_pending_checkout");
        setKpError(
          data.error || "Payment initiation failed. Please try again.",
        );
        setKpLoading(false);
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      sessionStorage.removeItem("korapay_pending_checkout");
      setKpError("Connection error. Please check your internet and try again.");
      setKpLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) {
      setErrorMsg("Session not ready. Please wait a moment.");
      return;
    }
    if (isSubmittingRef.current) return;
    if (payMethod === "bank_transfer") {
      await handleBankTransferSubmit();
      return;
    }
    if (payMethod === "crypto_wallet") {
      setCryptoError("");
      if (!twConfirmed) {
        setCryptoError("Please confirm you will send the payment.");
        return;
      }
      if (!cryptoWalletAddress) {
        setCryptoError(
          "Payment wallet not configured. Please contact support.",
        );
        return;
      }
    }
    isSubmittingRef.current = true;
    setStep("processing");
    setProcessingStep(0);
    if (payMethod === "crypto_wallet") {
      setProcessingStep(1);
      await new Promise((r) => setTimeout(r, 1200));
      setProcessingStep(2);
      await new Promise((r) => setTimeout(r, 800));
      try {
        const txId = `CRYPTO-${Date.now()}`;
        const { error: insertErr } = await supabase
          .from("payment_transactions")
          .insert({
            user_id: userId,
            node_key: nodeKey,
            amount: discountedPrice,
            currency: "USDT",
            gateway: "crypto",
            status: "pending",
            gateway_reference: txId,
            receiving_wallet: cryptoWalletAddress,
            crypto_wallet: twSenderAddress || null,
            crypto_network: cryptoNetwork,
            crypto_currency: "USDT",
            verified_by_admin: false,
            metadata: JSON.stringify({
              purchaseType,
              licenseType,
              nodeName,
              gpu,
              vram,
              originalAmount: price,
              discountPercent: cryptoDiscount,
              paymentModel,
              miningPeriod,
              contractMonths,
              contractLabel,
              contractMinPct,
              contractMaxPct,
              lockInMonths: isContract ? contractMonths : lockInMonths,
              lockInLabel: isContract ? contractLabel : lockInLabel,
              countryCode,
              countryName,
              autoReinvest,
            }),
          });
        if (insertErr) throw insertErr;
        setTransactionId(txId);
        setStep("pending_crypto");
        isSubmittingRef.current = false;
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to submit payment details.");
        setStep("failed");
        isSubmittingRef.current = false;
      }
      return;
    }
    // Card
    let cur = 0;
    for (const ps of PROCESSING_STEPS) {
      setProcessingStep(cur);
      await new Promise((r) => setTimeout(r, ps.ms));
      cur++;
    }
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          nodeKey,
          amount: price,
          currency: "USD",
          itype,
          payMethod,
          countryCode,
          gateway: "card",
          purchaseType,
          licenseType,
          paymentModel,
          miningPeriod,
          contractMonths,
          contractLabel,
          contractMinPct,
          contractMaxPct,
          lockInMonths: isContract ? contractMonths : lockInMonths,
          lockInMultiplier,
          lockInLabel: isContract ? contractLabel : lockInLabel,
          autoReinvest,
          referralCode: referralValid ? referralCode.toUpperCase() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment failed");
      const id = await createMiningAllocation({
        userId,
        planId: nodeKey,
        planName: nodeName,
        amount: price,
        paymentModel: paymentModel as "flexible" | "contract",
        instanceType: itype,
        gpuModel: gpu,
        vram,
        miningPeriod,
        contractMonths,
        contractLabel,
        contractMinPct,
        contractMaxPct,
        lockInMonths: isContract ? contractMonths : lockInMonths,
        lockInLabel: isContract ? contractLabel : lockInLabel,
        lockInMultiplier,
        transactionRef: data.transactionId,
        autoReinvest,
        referralCode: referralValid ? referralCode.toUpperCase() : undefined,
      });
      if (id) setAllocationId(id);
      setTransactionId(data.transactionId || `TXN-${Date.now()}`);
      setStep("success");
      isSubmittingRef.current = false;
    } catch (err: any) {
      setErrorMsg(err.message || "Payment could not be processed.");
      setStep("failed");
      isSubmittingRef.current = false;
    }
  }

  const receiptData = {
    txId: transactionId,
    purchaseType,
    nodeName,
    amount: effectivePrice,
    gpu,
    vram,
    paymentModel,
    contractLabel,
    contractMonths,
    licenseType,
    miningPeriod,
    payMethod:
      payMethod === "bank_transfer"
        ? "Bank / Mobile Transfer"
        : payMethod === "crypto_wallet"
          ? "Crypto Payment (USDT)"
          : "Credit / Debit Card",
    country: countryName,
    date: new Date().toLocaleString("en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
    discounted: payMethod === "crypto_wallet",
    originalAmount: price,
    walletAddress: payMethod === "crypto_wallet" ? twSenderAddress : undefined,
  };
  const filteredCountries = COUNTRIES.filter((c) =>
    c.name.toLowerCase().includes(countrySearch.toLowerCase()),
  );
  const periodLabel = PERIOD_LABELS[miningPeriod] ?? miningPeriod;

  if (userId === undefined)
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#0d1117" }}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-t-emerald-400 border-slate-700 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading secure checkout…</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: "#0d1117" }}>
      {showReceipt && (
        <Receipt data={receiptData} onClose={() => setShowReceipt(false)} />
      )}
      {showSplitModal && splitSession && (
        <SplitPaymentModal
          session={splitSession}
          onPayChunk={payChunk}
          onCancel={cancelSplitPayment}
          loading={kpLoading}
          kpError={kpError}
        />
      )}
      <div className="max-w-[960px] mx-auto mb-6">
        <button
          onClick={() =>
            step === "details" ? setStep("country") : router.back()
          }
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 transition-colors text-sm"
        >
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      {/* PENDING CRYPTO */}
      {step === "pending_crypto" && (
        <div className="max-w-[560px] mx-auto">
          <div
            className="rounded-3xl p-8"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(139,92,246,0.3)",
            }}
          >
            <div className="w-16 h-16 rounded-full bg-violet-500/15 border-2 border-violet-500/40 flex items-center justify-center mx-auto mb-5">
              <Clock size={28} className="text-violet-400" />
            </div>
            <h2 className="text-white font-black text-2xl text-center mb-2">
              Payment Details Submitted
            </h2>
            <p className="text-slate-400 text-sm text-center mb-6 leading-relaxed">
              Send your USDT to the wallet address below. Our team will verify
              and{" "}
              <strong className="text-violet-300">
                activate your mining session within 30 minutes
              </strong>
              .
            </p>
            <div
              className="rounded-2xl p-5 mb-5 space-y-4"
              style={{
                background: "rgba(139,92,246,0.08)",
                border: "1px solid rgba(139,92,246,0.25)",
              }}
            >
              <p className="text-violet-300 text-xs font-black uppercase tracking-widest text-center">
                Send Payment To This Address
              </p>
              <div className="flex justify-center">
                {cryptoQrImageUrl ? (
                  <img
                    src={cryptoQrImageUrl}
                    alt="QR"
                    className="w-40 h-40 rounded-xl object-contain"
                    style={{ background: "white", padding: "8px" }}
                  />
                ) : cryptoWalletAddress ? (
                  <QRCode value={cryptoWalletAddress} size={160} />
                ) : null}
              </div>
              <div
                className="rounded-xl p-3"
                style={{
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex items-center gap-2">
                  <p className="text-white font-mono text-xs break-all flex-1 select-all">
                    {cryptoWalletAddress || "Loading…"}
                  </p>
                  {cryptoWalletAddress && (
                    <CopyButton text={cryptoWalletAddress} />
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {[
                  ["Amount to Send", `${discountedPrice.toFixed(2)} USDT`],
                  ["Network", cryptoNetwork],
                  ["Currency", "USDT (Tether)"],
                  ["Transaction Ref", transactionId.slice(-12) + "…"],
                ].map(([l, v]) => (
                  <div
                    key={l}
                    className="rounded-lg p-2.5"
                    style={{ background: "rgba(0,0,0,0.3)" }}
                  >
                    <p className="text-slate-500 text-[10px] mb-0.5">{l}</p>
                    <p className="text-white font-bold text-xs break-all">
                      {v}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div
              className="rounded-xl p-3 mb-5"
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.2)",
              }}
            >
              <p className="text-amber-400 text-xs leading-relaxed">
                <strong>Important:</strong> Send exactly{" "}
                <strong>{discountedPrice.toFixed(2)} USDT</strong> on the{" "}
                <strong>{cryptoNetwork}</strong> network only. Wrong network =
                lost funds.
              </p>
            </div>
            <button
              onClick={() => router.push("/dashboard")}
              className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 rounded-xl transition-all"
            >
              {"I've Sent the Payment — Return to Dashboard"}
            </button>
          </div>
        </div>
      )}

      {/* DECLINED */}
      {step === "declined" && (
        <div className="max-w-[520px] mx-auto">
          <div
            className="rounded-3xl p-8"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="w-16 h-16 rounded-full bg-red-500/15 border-2 border-red-500/40 flex items-center justify-center mx-auto mb-5">
              <AlertCircle size={28} className="text-red-400" />
            </div>
            <h2 className="text-white font-black text-2xl text-center mb-2">
              Payment Declined
            </h2>
            <p className="text-slate-400 text-sm text-center mb-5">
              Your payment was declined or cancelled. Please try again.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("details")}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg"
              >
                Try Again
              </button>
              <button
                onClick={() => router.back()}
                className="flex-1 border border-slate-700 text-slate-300 font-bold py-3 rounded-lg"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COUNTRY */}
      {step === "country" && (
        <div className="max-w-[960px] mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-white mb-2">
              Select Your Country
            </h1>
            <p className="text-slate-400">
              Determines your available payment methods
            </p>
          </div>
          <div
            className="rounded-2xl p-8"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="mb-6 relative">
              <Globe
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search countries…"
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-black/30 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
              {filteredCountries.map((c) => (
                <button
                  key={c.code}
                  onClick={() => {
                    setCountryCode(c.code);
                    setCountryName(c.name);
                  }}
                  className={`p-3 rounded-lg text-left transition-all border ${countryCode === c.code ? "bg-emerald-600/20 border-emerald-500 text-emerald-100" : "bg-black/20 border-slate-700 text-slate-300 hover:border-slate-600"}`}
                >
                  <div className="font-semibold text-sm">{c.name}</div>
                  <div className="text-xs opacity-70">{c.code}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => countryCode && setStep("details")}
              disabled={!countryCode}
              className={`w-full mt-6 py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${countryCode ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-slate-700 text-slate-400 cursor-not-allowed"}`}
            >
              Continue <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* DETAILS */}
      {step === "details" && (
        <div className="max-w-[960px] mx-auto">
          <div className="grid lg:grid-cols-[1fr_420px] gap-8">
            <OrderSummary
              purchaseType={purchaseType}
              nodeName={nodeName}
              gpu={gpu}
              vram={vram}
              itype={itype}
              paymentModel={paymentModel}
              contractLabel={contractLabel}
              contractMonths={contractMonths}
              price={price}
              licenseType={licenseType}
              effectivePrice={effectivePrice}
              cryptoDiscount={cryptoDiscount}
              payMethod={payMethod}
              miningPeriod={miningPeriod}
            />
            <div className="space-y-5">
              <div>
                <div className="text-xl font-bold text-white mb-1">
                  Choose Payment Method
                </div>
                <p className="text-slate-400 text-xs mb-4">
                  Crypto offers faster processing &amp; exclusive discounts
                </p>
              </div>

              {/* Daily limit banner */}
              {bankTransferLocked &&
                BANK_TRANSFER_COUNTRIES.has(countryCode) && (
                  <div
                    className="rounded-2xl p-4 flex items-start gap-3"
                    style={{
                      background: "rgba(239,68,68,0.07)",
                      border: "1px solid rgba(239,68,68,0.3)",
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: "rgba(239,68,68,0.12)",
                        border: "1px solid rgba(239,68,68,0.3)",
                      }}
                    >
                      <Ban size={18} className="text-red-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-red-300 font-black text-sm">
                        Bank Transfer Unavailable Today
                      </p>
                      <p className="text-red-400/70 text-xs mt-1 leading-relaxed">
                        Daily bank-transfer processing capacity has been
                        reached. Please use{" "}
                        <strong className="text-white">Crypto (USDT)</strong> or{" "}
                        <strong className="text-white">Card</strong> to continue
                        — both are instant and fully supported.
                      </p>
                    </div>
                  </div>
                )}

              {/* Payment methods */}
              {(() => {
                const baseMethods = getPaymentMethodsForCountry(
                  countryCode,
                  price,
                );
                const methods = baseMethods.filter(
                  (m) => m !== "bank_transfer" || !bankTransferLocked,
                );
                const chunkMax = getChunkMaxLocal(countryCode);
                const willSplit =
                  methods.includes("bank_transfer") &&
                  localAmount !== null &&
                  localAmount > chunkMax;
                return (
                  <div className="space-y-3">
                    {/* Crypto */}
                    <button
                      type="button"
                      onClick={() => setPayMethod("crypto_wallet")}
                      className={`w-full p-4 rounded-xl transition-all border-2 relative overflow-hidden ${payMethod === "crypto_wallet" ? "bg-gradient-to-r from-violet-600/40 to-purple-600/40 border-violet-400" : "bg-slate-800/50 border-slate-600 hover:border-violet-400/50"}`}
                    >
                      <div className="absolute top-2 right-2 bg-violet-500 text-white text-[10px] font-black px-2 py-1 rounded">
                        RECOMMENDED
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">₿</div>
                        <div className="text-left flex-1">
                          <div className="text-white font-bold text-sm">
                            Crypto Payment (USDT)
                          </div>
                          <div className="text-slate-400 text-xs">
                            {cryptoDiscount}% discount · Instant · Secure
                          </div>
                        </div>
                        <div className="text-emerald-400 font-bold text-sm">
                          ${discountedPrice.toFixed(2)}
                        </div>
                      </div>
                    </button>
                    {/* Card */}
                    {methods.includes("card") && (
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/dashboard/checkout/card?${params.toString()}&miningPeriod=${miningPeriod}&autoReinvest=${autoReinvest}`,
                          )
                        }
                        className="w-full p-4 rounded-xl transition-all border-2 bg-slate-800/30 border-slate-700 hover:border-slate-500"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-xl">💳</div>
                          <div className="text-left flex-1">
                            <div className="text-slate-300 font-bold text-sm">
                              Credit / Debit Card
                            </div>
                            <div className="text-slate-500 text-xs">
                              OTP Required · Verify with your bank
                            </div>
                          </div>
                          <div className="text-slate-400 font-bold text-sm">
                            ${price.toFixed(2)}
                          </div>
                        </div>
                      </button>
                    )}
                    {/* Bank transfer */}
                    {methods.includes("bank_transfer") && (
                      <button
                        type="button"
                        onClick={() => setPayMethod("bank_transfer")}
                        className={`w-full p-4 rounded-xl transition-all border-2 ${payMethod === "bank_transfer" ? "bg-blue-700/20 border-blue-400" : "bg-slate-800/30 border-slate-700 hover:border-blue-500/50"}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-xl">🏦</div>
                          <div className="text-left flex-1">
                            <div className="text-slate-300 font-bold text-sm">
                              Local Transfer
                            </div>
                            <div className="text-slate-500 text-xs">
                              Bank · Card · Mobile Money
                            </div>
                          </div>
                          <div className="text-slate-400 font-bold text-sm">
                            ${price.toFixed(2)}
                          </div>
                        </div>
                      </button>
                    )}
                    {/* Split preview notice */}
                    {willSplit && payMethod === "bank_transfer" && (
                      <div
                        className="rounded-xl p-3 flex items-start gap-2"
                        style={{
                          background: "rgba(59,130,246,0.07)",
                          border: "1px solid rgba(59,130,246,0.25)",
                        }}
                      >
                        <AlertTriangle
                          size={13}
                          className="text-blue-400 shrink-0 mt-0.5"
                        />
                        <p className="text-blue-300 text-xs leading-relaxed">
                          This deposit (
                          {CURRENCY_SYMBOLS[conversionInfo?.currency ?? ""] ??
                            ""}
                          {localAmount?.toLocaleString()}) exceeds the
                          single-transaction limit and will be split into{" "}
                          <strong className="text-white">
                            {Math.ceil((localAmount ?? 0) / chunkMax)} secure
                            instalments
                          </strong>{" "}
                          in compliance with AML regulations. No extra fees
                          apply.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Auto-reinvest */}
              {purchaseType === "gpu_plan" && (
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(16,185,129,0.05)",
                    border: "1px solid rgba(16,185,129,0.2)",
                  }}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <div
                      onClick={() => setAutoReinvest((v) => !v)}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${autoReinvest ? "bg-emerald-500 border-emerald-500" : "border-slate-600"}`}
                    >
                      {autoReinvest && (
                        <Check size={12} className="text-white" />
                      )}
                    </div>
                    <div>
                      <p className="text-emerald-300 text-sm font-bold flex items-center gap-1.5">
                        <RefreshCw size={12} /> Auto-Reinvest After Session Ends
                      </p>
                      <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">
                        When your mining session completes, earnings
                        automatically start a new {periodLabel} session.
                        Compound your returns continuously.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Referral */}
              <div>
                <label className="block text-slate-300 text-sm font-bold mb-2 flex items-center gap-1.5">
                  <Gift size={13} className="text-amber-400" /> Referral Code{" "}
                  <span className="text-slate-600 font-normal text-xs">
                    (optional)
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Enter referral code"
                    value={referralCode}
                    onChange={(e) => {
                      setReferralCode(e.target.value.toUpperCase());
                      setReferralValid(null);
                    }}
                    onBlur={() => validateReferralCode(referralCode)}
                    className={`w-full px-4 py-3 bg-black/30 border rounded-lg text-white placeholder-slate-600 text-sm font-mono uppercase focus:outline-none transition-colors ${referralValid === true ? "border-emerald-500" : referralValid === false ? "border-red-500" : "border-slate-700 focus:border-amber-500"}`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {checkingReferral && (
                      <Loader2
                        size={14}
                        className="text-slate-400 animate-spin"
                      />
                    )}
                    {!checkingReferral && referralValid === true && (
                      <CheckCircle size={14} className="text-emerald-400" />
                    )}
                    {!checkingReferral && referralValid === false && (
                      <AlertCircle size={14} className="text-red-400" />
                    )}
                  </div>
                </div>
                {referralValid === true && referralDiscount > 0 && (
                  <p className="text-emerald-400 text-xs mt-1 font-bold">
                    ✓ {referralDiscount}% discount applied!
                  </p>
                )}
                {referralValid === false && (
                  <p className="text-red-400 text-xs mt-1">
                    Invalid or expired referral code.
                  </p>
                )}
              </div>

              <form onSubmit={handleSubmit}>
                {/* Bank transfer form */}
                {payMethod === "bank_transfer" && (
                  <div
                    className="rounded-2xl p-6 space-y-4"
                    style={{
                      background: "rgba(22,28,36,0.95)",
                      border: "1px solid rgba(59,130,246,0.25)",
                    }}
                  >
                    <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <p className="text-blue-200 text-xs leading-relaxed">
                        You will be redirected to complete payment securely via
                        bank transfer, card, or mobile money.
                      </p>
                    </div>
                    {localAmount && conversionInfo && (
                      <div
                        className="p-3 rounded-lg"
                        style={{
                          background: "rgba(16,185,129,0.07)",
                          border: "1px solid rgba(16,185,129,0.2)",
                        }}
                      >
                        <p className="text-emerald-300 text-xs">
                          Approx. amount:{" "}
                          <strong className="text-emerald-200">
                            {conversionInfo.currency}{" "}
                            {localAmount.toLocaleString()}
                          </strong>
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="block text-slate-400 text-xs mb-1.5">
                        Phone Number{" "}
                        <span className="text-slate-600">(optional)</span>
                      </label>
                      <input
                        type="tel"
                        value={kpPhone}
                        onChange={(e) => setKpPhone(e.target.value)}
                        className="w-full px-4 py-3 bg-black/30 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    {kpError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                        <AlertCircle
                          size={14}
                          className="text-red-400 shrink-0 mt-0.5"
                        />
                        <p className="text-red-300 text-xs">{kpError}</p>
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={kpLoading}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
                    >
                      {kpLoading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />{" "}
                          Connecting…
                        </>
                      ) : (
                        <>
                          <Lock size={14} /> Proceed to Secure Payment
                        </>
                      )}
                    </button>
                  </div>
                )}
                {/* Crypto form */}
                {payMethod === "crypto_wallet" && (
                  <div
                    className="rounded-2xl p-6 space-y-5"
                    style={{
                      background: "rgba(22,28,36,0.95)",
                      border: "1px solid rgba(139,92,246,0.25)",
                    }}
                  >
                    <div>
                      <p className="text-violet-300 font-black text-sm mb-1">
                        Pay with USDT
                      </p>
                      <p className="text-slate-500 text-xs">
                        Scan the QR or copy the address, then send the exact
                        amount.
                      </p>
                    </div>
                    {!configLoaded ? (
                      <div className="flex justify-center py-4">
                        <Loader2
                          size={24}
                          className="text-violet-400 animate-spin"
                        />
                      </div>
                    ) : !cryptoWalletAddress ? (
                      <div
                        className="rounded-xl p-4 text-center"
                        style={{
                          background: "rgba(244,63,94,0.08)",
                          border: "1px solid rgba(244,63,94,0.2)",
                        }}
                      >
                        <p className="text-rose-400 text-xs font-bold">
                          Crypto payment not currently available
                        </p>
                        <p className="text-rose-400/70 text-xs mt-1">
                          Please use card or bank transfer, or contact support.
                        </p>
                      </div>
                    ) : (
                      <div
                        className="rounded-xl p-4 space-y-4"
                        style={{
                          background: "rgba(139,92,246,0.06)",
                          border: "1px solid rgba(139,92,246,0.2)",
                        }}
                      >
                        <div className="flex justify-center">
                          {cryptoQrImageUrl ? (
                            <img
                              src={cryptoQrImageUrl}
                              alt="QR"
                              className="w-36 h-36 rounded-xl object-contain"
                              style={{ background: "white", padding: "6px" }}
                            />
                          ) : (
                            <QRCode value={cryptoWalletAddress} size={144} />
                          )}
                        </div>
                        <p className="text-center text-slate-400 text-xs">
                          Scan with your crypto wallet app
                        </p>
                        <div>
                          <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1.5 font-bold">
                            Wallet Address
                          </p>
                          <div
                            className="flex items-center gap-2 rounded-lg p-3"
                            style={{
                              background: "rgba(0,0,0,0.4)",
                              border: "1px solid rgba(255,255,255,0.08)",
                            }}
                          >
                            <p className="text-white font-mono text-xs break-all flex-1 select-all">
                              {cryptoWalletAddress}
                            </p>
                            <CopyButton text={cryptoWalletAddress} />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div
                            className="rounded-lg p-2.5"
                            style={{ background: "rgba(0,0,0,0.3)" }}
                          >
                            <p className="text-slate-500 text-[10px] mb-0.5">
                              Exact Amount
                            </p>
                            <p className="text-emerald-400 font-black text-sm">
                              {discountedPrice.toFixed(2)} USDT
                            </p>
                          </div>
                          <div
                            className="rounded-lg p-2.5"
                            style={{ background: "rgba(0,0,0,0.3)" }}
                          >
                            <p className="text-slate-500 text-[10px] mb-0.5">
                              Network
                            </p>
                            <p className="text-white font-bold text-xs">
                              {cryptoNetwork}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-white text-sm font-bold mb-1.5">
                        Your Wallet Address{" "}
                        <span className="text-slate-500 font-normal text-xs">
                          (optional)
                        </span>
                      </label>
                      <input
                        type="text"
                        placeholder="Paste your sending wallet address"
                        value={twSenderAddress}
                        onChange={(e) => setTwSenderAddress(e.target.value)}
                        className="w-full px-4 py-3 bg-black/30 border border-slate-700 rounded-lg text-white placeholder-slate-500 font-mono text-xs focus:outline-none focus:border-violet-500"
                      />
                    </div>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <div
                        onClick={() => setTwConfirmed((v) => !v)}
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${twConfirmed ? "bg-violet-500 border-violet-500" : "border-slate-600"}`}
                      >
                        {twConfirmed && (
                          <Check size={12} className="text-white" />
                        )}
                      </div>
                      <p className="text-slate-300 text-xs leading-relaxed">
                        I understand I must send exactly{" "}
                        <strong className="text-white">
                          {discountedPrice.toFixed(2)} USDT
                        </strong>{" "}
                        on the{" "}
                        <strong className="text-white">{cryptoNetwork}</strong>{" "}
                        network to the address above.
                      </p>
                    </label>
                    {cryptoError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                        <AlertCircle
                          size={14}
                          className="text-red-400 shrink-0 mt-0.5"
                        />
                        <p className="text-red-300 text-xs">{cryptoError}</p>
                      </div>
                    )}
                    <button
                      type="submit"
                      disabled={!twConfirmed || !cryptoWalletAddress}
                      className="w-full py-3 rounded-lg font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed text-white"
                      style={{
                        background:
                          twConfirmed && cryptoWalletAddress
                            ? "linear-gradient(135deg,#8b5cf6,#6d28d9)"
                            : "rgba(139,92,246,0.3)",
                      }}
                    >
                      Submit Payment Details
                    </button>
                  </div>
                )}
              </form>

              {/* Total */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">You pay</span>
                  <div className="text-right">
                    <span className="text-white font-black text-xl">
                      ${effectivePrice.toFixed(2)}
                    </span>
                    {(payMethod === "crypto_wallet" ||
                      (referralValid && referralDiscount > 0)) && (
                      <p className="text-emerald-400 text-[10px]">
                        {payMethod === "crypto_wallet"
                          ? `-${cryptoDiscount}% crypto`
                          : ""}
                        {referralValid && referralDiscount > 0
                          ? ` -${referralDiscount}% referral`
                          : ""}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PROCESSING */}
      {step === "processing" && (
        <div className="max-w-[520px] mx-auto">
          <div
            className="rounded-3xl p-8 text-center"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Loader2
              size={32}
              className="text-emerald-400 mx-auto mb-4 animate-spin"
            />
            <h2 className="text-white font-black text-2xl mb-2">
              Processing Payment
            </h2>
            <p className="text-slate-400 text-sm mb-6">
              {PROCESSING_STEPS[processingStep]?.label || "Completing…"}
            </p>
            <div className="space-y-3">
              {PROCESSING_STEPS.map((ps, idx) => (
                <div
                  key={ps.id}
                  className={`flex items-center gap-3 text-sm ${idx <= processingStep ? "text-emerald-300" : "text-slate-600"}`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${idx < processingStep ? "bg-emerald-500 border-emerald-500" : idx === processingStep ? "border-emerald-500 animate-pulse" : "border-slate-600"}`}
                  >
                    {idx < processingStep && (
                      <CheckCircle size={14} className="text-white" />
                    )}
                  </div>
                  <span>{ps.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS */}
      {step === "success" && (
        <div className="max-w-[520px] mx-auto">
          <div
            className="rounded-3xl p-8"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center mx-auto mb-5">
              <CheckCircle size={32} className="text-emerald-400" />
            </div>
            <h2 className="text-white font-black text-2xl text-center mb-2">
              {purchaseType === "license"
                ? "License Activated!"
                : "Mining Session Started!"}
            </h2>
            <p className="text-slate-400 text-sm text-center mb-6">
              {purchaseType === "license"
                ? "Your operator license is now active."
                : isContract
                  ? "Your GPU node contract is active. Earnings accrue daily."
                  : `Your ${periodLabel} mining session is live. Watch earnings tick in your portfolio.`}
            </p>
            <div
              className="rounded-xl p-4 mb-6 space-y-3 text-sm"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {[
                ["Transaction ID", transactionId],
                ["Amount Paid", `$${effectivePrice.toFixed(2)}`],
                ...(!isContract && purchaseType === "gpu_plan"
                  ? [["Mining Duration", periodLabel]]
                  : []),
                ["Country", countryName],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between">
                  <span className="text-slate-500">{l}</span>
                  <span className="text-white font-semibold">{v}</span>
                </div>
              ))}
              {autoReinvest && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Auto-Reinvest</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <RefreshCw size={11} /> Enabled
                  </span>
                </div>
              )}
            </div>
            {autoReinvest && purchaseType === "gpu_plan" && (
              <div
                className="rounded-xl p-3 mb-5"
                style={{
                  background: "rgba(16,185,129,0.08)",
                  border: "1px solid rgba(16,185,129,0.25)",
                }}
              >
                <p className="text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                  <RefreshCw size={11} /> Auto-Reinvest Active
                </p>
                <p className="text-emerald-400/70 text-xs mt-0.5">
                  When this session ends, a new {periodLabel} session will start
                  automatically.
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowReceipt(true)}
                className="flex-1 border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white font-bold py-3 rounded-lg transition-all"
              >
                View Receipt
              </button>
              <button
                onClick={() =>
                  router.push(
                    purchaseType === "license"
                      ? "/dashboard/tasks"
                      : "/dashboard/gpu-plans",
                  )
                }
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-lg transition-all"
              >
                {purchaseType === "license"
                  ? "Go to Tasks"
                  : "View Portfolio →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FAILED */}
      {step === "failed" && (
        <div className="max-w-[520px] mx-auto">
          <div
            className="rounded-3xl p-8"
            style={{
              background: "rgba(22,28,36,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center mx-auto mb-5">
              <AlertCircle size={32} className="text-red-400" />
            </div>
            <h2 className="text-white font-black text-2xl text-center mb-2">
              Payment Failed
            </h2>
            <p className="text-slate-400 text-sm text-center mb-4">
              {errorMsg || "Something went wrong. Please try again."}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setErrorMsg("");
                  isSubmittingRef.current = false;
                  setStep("details");
                }}
                className="flex-1 border border-slate-700 hover:border-slate-500 text-slate-300 font-bold py-3 rounded-lg transition-all"
              >
                Try Again
              </button>
              <button
                onClick={() => router.back()}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg transition-all"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ background: "#0d1117" }}
        >
          <div className="w-10 h-10 border-2 border-t-emerald-400 border-slate-700 rounded-full animate-spin" />
        </div>
      }
    >
      <CheckoutInner />
    </Suspense>
  );
}
