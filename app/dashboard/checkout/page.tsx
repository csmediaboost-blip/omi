"use client";
// app/dashboard/checkout/page.tsx — WITH DAILY LIMIT + SPLIT PAYMENT
// ─────────────────────────────────────────────────────────────────────────────
// ORIGINAL FIXES (unchanged):
//  1–9 as documented in original file
//
// NEW FEATURES:
//  F1. Daily NGN Limit Guard — once platform receives ₦495,000 via bank transfer
//      in a calendar day, bank transfer is disabled; users are routed to Crypto/Card.
//  F2. Split Payment Modal — any single bank transfer exceeding ₦200,000 is
//      automatically split into ₦200,000 installments. A professional AML notice
//      explains the compliance requirement. Allocation activates only after all
//      installments are successfully received.
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
  AlertTriangle,
  FileCheck,
  Landmark,
  CreditCard,
} from "lucide-react";

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

// ─── DAILY NGN LIMIT CONSTANTS ─────────────────────────────────────────────
// F1: Platform-wide daily cap — KoraPay merchant account limit is ₦500,000/day.
// We halt at ₦495,000 to maintain a ₦5,000 safety buffer.
const DAILY_NGN_LIMIT = 495_000;

// F2: KoraPay enforces a ₦200,000 ceiling per individual transaction.
// Any single payment above this threshold must be split into installments.
const MAX_SINGLE_NGN_TXN = 200_000;

// ─── SPLIT PAYMENT STATE TYPE ──────────────────────────────────────────────
type SplitState = {
  totalNGN: number; // Full amount in NGN, e.g. 320_000
  totalUSD: number; // Full amount in USD, e.g. 200
  ngnRate: number; // Conversion rate used, e.g. 1600
  localCurrency: string; // e.g. "NGN"
  installmentsNGN: number[]; // e.g. [200_000, 120_000]
  completed: number; // How many installments done so far
  references: string[]; // KoraPay refs collected
  kpPhone: string;
  planData: Record<string, any>; // Everything needed to create allocation + call KoraPay
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

const getPaymentMethodsForCountry = (
  countryCode: string,
  amount: number,
): PayMethod[] => {
  const methods: PayMethod[] = [];
  if (BANK_TRANSFER_COUNTRIES.has(countryCode) && amount <= 10000)
    methods.push("bank_transfer");
  methods.push("crypto_wallet");
  methods.push("card");
  return methods;
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

function detectCardType(n: string): "visa" | "mc" | "unsupported" {
  const d = n.replace(/\s/g, "");
  if (/^4/.test(d)) return "visa";
  if (/^5[1-5]|^2[2-7]/.test(d)) return "mc";
  return "unsupported";
}

const PROCESSING_STEPS = [
  { id: 1, label: "Verifying payment details", ms: 1400 },
  { id: 2, label: "Securing payment channel", ms: 1800 },
  { id: 3, label: "Routing through payment network", ms: 2200 },
  { id: 4, label: "Completing your order", ms: 1600 },
  { id: 5, label: "Activating your mining session", ms: 1400 },
];

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

// ─── ALLOCATION CREATION ───────────────────────────────────────────────────
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

  const now = new Date();
  const nowIso = now.toISOString();
  const period = miningPeriod;

  if (transactionRef) {
    const { data: existing } = await supabase
      .from("node_allocations")
      .select("id")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .limit(1);
    if (existing && existing.length > 0) {
      console.log(
        "[checkout] Allocation already exists, skipping:",
        existing[0].id,
      );
      return existing[0].id;
    }
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
    const { data: rateSnap } = await supabase
      .from("current_mining_rates")
      .select("rate_factor")
      .eq("plan_id", planId)
      .eq("period", period)
      .single();
    if (rateSnap?.rate_factor != null) rateFactor = rateSnap.rate_factor;
  } catch {}

  const allocationPayload: Record<string, any> = {
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
    .insert(allocationPayload)
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

// ─── F1: DAILY NGN TOTAL QUERY ─────────────────────────────────────────────
// Queries platform-wide confirmed bank transfer payments for today,
// returns estimated NGN total (all amounts stored in USD × NGN rate).
async function getDailyBankTransferNGNTotal(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  try {
    const { data } = await supabase
      .from("payment_transactions")
      .select("amount, metadata")
      .gte("created_at", today.toISOString())
      .in("status", ["confirmed", "completed"])
      .not("gateway", "eq", "crypto")
      .not("gateway", "eq", "gpu_mining");

    if (!data || data.length === 0) return 0;
    const NGN_RATE = CURRENCY_RATES["NG"].rate; // 1600

    // ✅ Fix: explicitly type both reduce parameters
    return data.reduce(
      (sum: number, tx: { amount: unknown; metadata: unknown }) =>
        sum + (Number(tx.amount) || 0) * NGN_RATE,
      0,
    );
  } catch {
    return 0;
  }
}

// ─── F2: COMPUTE INSTALLMENTS ──────────────────────────────────────────────
function computeInstallments(totalLocalAmount: number): number[] {
  const installments: number[] = [];
  let remaining = Math.round(totalLocalAmount);
  while (remaining > 0) {
    const chunk = Math.min(remaining, MAX_SINGLE_NGN_TXN);
    installments.push(chunk);
    remaining -= chunk;
  }
  return installments;
}

// ─── F2: SPLIT PAYMENT MODAL ───────────────────────────────────────────────
function SplitPaymentModal({
  state,
  loading,
  error,
  onInitiate,
  onCancel,
}: {
  state: SplitState;
  loading: boolean;
  error: string;
  onInitiate: (s: SplitState) => void;
  onCancel: () => void;
}) {
  const allDone = state.completed >= state.installmentsNGN.length;
  const currentInstallmentNGN = !allDone
    ? state.installmentsNGN[state.completed]
    : 0;
  const paidNGN = state.installmentsNGN
    .slice(0, state.completed)
    .reduce((s, v) => s + v, 0);
  const progressPct = state.totalNGN > 0 ? (paidNGN / state.totalNGN) * 100 : 0;
  const isFirst = state.completed === 0;
  const totalCount = state.installmentsNGN.length;
  const nextIndex = state.completed + 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(12px)" }}
    >
      <div
        className="w-full max-w-lg rounded-3xl overflow-hidden"
        style={{
          background: "rgb(8,12,22)",
          border: "1px solid rgba(245,158,11,0.35)",
          boxShadow: "0 0 60px rgba(245,158,11,0.08)",
        }}
      >
        {/* Header */}
        <div
          className="px-6 pt-6 pb-5"
          style={{
            background: "rgba(245,158,11,0.07)",
            borderBottom: "1px solid rgba(245,158,11,0.2)",
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: "rgba(245,158,11,0.12)",
                border: "1px solid rgba(245,158,11,0.3)",
              }}
            >
              <Landmark size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-400 mb-1">
                Regulatory Compliance · Installment Processing
              </p>
              <h3 className="text-white font-black text-lg leading-tight">
                {isFirst
                  ? "Payment Split Required"
                  : `Installment ${state.completed} of ${totalCount} Complete`}
              </h3>
              {!isFirst && (
                <p className="text-emerald-400 text-sm font-bold mt-1 flex items-center gap-1.5">
                  <CheckCircle size={12} />₦
                  {state.installmentsNGN[state.completed - 1].toLocaleString()}{" "}
                  received successfully
                </p>
              )}
            </div>
          </div>
        </div>

        {/* AML Compliance Notice */}
        <div
          className="mx-5 mt-5 rounded-2xl p-4"
          style={{
            background: "rgba(15,23,42,0.9)",
            border: "1px solid rgba(100,116,139,0.2)",
          }}
        >
          <div className="flex items-start gap-3">
            <Shield size={14} className="text-slate-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-slate-300 text-[11px] font-black uppercase tracking-wider mb-1.5">
                Why is my payment being split?
              </p>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                In accordance with Anti-Money Laundering (AML) directives and
                electronic payment regulations, individual bank transfer
                transactions are subject to a{" "}
                <strong className="text-slate-300">
                  ₦200,000 per-transaction ceiling
                </strong>
                . This safeguard protects you against unauthorised use of
                payment instruments — including transactions initiated on
                compromised or stolen devices where the legitimate account
                holder is unaware. Each installment undergoes real-time fraud
                screening and transaction monitoring by our payment processor.
                Your service activates automatically once all installments are
                received and reconciled.{" "}
                <strong className="text-slate-300">
                  No additional fees are applied.
                </strong>
              </p>
            </div>
          </div>
        </div>

        {/* Payment Plan */}
        <div className="px-5 mt-4 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">
              Payment Plan
            </p>
            <p className="text-slate-400 text-xs">
              Total:{" "}
              <span className="text-white font-black">
                ₦{state.totalNGN.toLocaleString()}
              </span>{" "}
              <span className="text-slate-600">
                (${state.totalUSD.toFixed(2)})
              </span>
            </p>
          </div>

          {/* Progress bar */}
          <div>
            <div className="flex justify-between text-[10px] text-slate-600 mb-1.5">
              <span>₦{paidNGN.toLocaleString()} paid</span>
              <span>{progressPct.toFixed(0)}% complete</span>
              <span>
                ₦{(state.totalNGN - paidNGN).toLocaleString()} remaining
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-2 rounded-full transition-all duration-700"
                style={{
                  width: `${progressPct}%`,
                  background: "linear-gradient(90deg, #f59e0b, #10b981)",
                }}
              />
            </div>
          </div>

          {/* Installment list */}
          <div className="space-y-2">
            {state.installmentsNGN.map((amt, i) => {
              const isPaid = i < state.completed;
              const isCurrent = i === state.completed;
              const isPending = i > state.completed;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{
                    background: isPaid
                      ? "rgba(16,185,129,0.07)"
                      : isCurrent
                        ? "rgba(245,158,11,0.07)"
                        : "rgba(15,23,42,0.6)",
                    border: isPaid
                      ? "1px solid rgba(16,185,129,0.25)"
                      : isCurrent
                        ? "1px solid rgba(245,158,11,0.3)"
                        : "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black"
                      style={{
                        background: isPaid
                          ? "rgba(16,185,129,0.2)"
                          : isCurrent
                            ? "rgba(245,158,11,0.2)"
                            : "rgba(100,116,139,0.15)",
                        color: isPaid
                          ? "#10b981"
                          : isCurrent
                            ? "#f59e0b"
                            : "#475569",
                      }}
                    >
                      {isPaid ? <CheckCircle size={12} /> : i + 1}
                    </div>
                    <div>
                      <p
                        className={`text-sm font-black ${isPaid ? "text-emerald-300" : isCurrent ? "text-amber-300" : "text-slate-500"}`}
                      >
                        Installment {i + 1} of {totalCount}
                      </p>
                      {isPaid && state.references[i] && (
                        <p className="text-emerald-600 text-[10px] font-mono">
                          Ref: {state.references[i].slice(-10)}…
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`font-black text-sm ${isPaid ? "text-emerald-400" : isCurrent ? "text-amber-400" : "text-slate-600"}`}
                    >
                      ₦{amt.toLocaleString()}
                    </p>
                    <p
                      className="text-[10px]"
                      style={{
                        color: isPaid
                          ? "#059669"
                          : isCurrent
                            ? "#d97706"
                            : "#334155",
                      }}
                    >
                      {isPaid ? "✓ Paid" : isCurrent ? "→ Next" : "○ Pending"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mx-5 mt-3 rounded-xl p-3 flex items-start gap-2"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            <AlertCircle size={13} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-red-300 text-xs">{error}</p>
          </div>
        )}

        {/* CTA */}
        <div className="px-5 py-5 space-y-3 mt-1">
          <button
            onClick={() => onInitiate(state)}
            disabled={loading}
            className="w-full py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              color: "#0c0a00",
            }}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Connecting to
                bank…
              </>
            ) : isFirst ? (
              <>
                <Landmark size={16} />
                Begin Payment — Installment 1 of {totalCount}: ₦
                {state.installmentsNGN[0].toLocaleString()}
              </>
            ) : (
              <>
                <Landmark size={16} />
                Continue — Installment {nextIndex} of {totalCount}: ₦
                {currentInstallmentNGN.toLocaleString()}
              </>
            )}
          </button>

          {/* ── FIX: prominent "switch method" button ── */}
          <button
            onClick={onCancel}
            disabled={loading}
            className="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{
              background: "rgba(139,92,246,0.12)",
              border: "1px solid rgba(139,92,246,0.35)",
              color: "#a78bfa",
            }}
          >
            ₿ Pay with Crypto &nbsp;·&nbsp; 💳 Pay with Card
          </button>
          <p className="text-slate-600 text-[11px] text-center pb-1">
            Tap above to cancel this split and choose a different payment method
          </p>
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
  const periodLabel = PERIOD_LABELS[data.miningPeriod] ?? data.miningPeriod;
  const contractDurLabel =
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
                    isContract
                      ? `Contract — ${contractDurLabel}`
                      : "Pay-As-You-Go",
                  ],
                  [
                    "Mining Session",
                    isContract ? contractDurLabel : periodLabel,
                  ],
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
  const contractDurLabel =
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
                      ["Contract Term", contractDurLabel],
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
                is locked for{" "}
                <strong className="text-amber-300">{contractDurLabel}</strong>.
                Earnings accumulate every second and are visible in your
                portfolio. Capital released at maturity.{" "}
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
                When done, your capital + earnings are credited to your wallet
                automatically. Returns not guaranteed.
              </p>
            </div>
          )}
        </>
      )}

      {purchaseType === "license" && (
        <>
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
                <p className="text-white font-black text-sm">
                  {licConfig.label}
                </p>
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
        </>
      )}
    </div>
  );
}

// ─── INNER CHECKOUT COMPONENT ─────────────────────────────────────────────────
function CheckoutInner() {
  const router = useRouter();
  const params = useSearchParams();

  const [step, setStep] = useState<CheckoutStep>("country");
  const [userId, setUserId] = useState<string | undefined | null>(undefined);
  const [processingStep, setProcessingStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [showReceipt, setShowReceipt] = useState(false);
  const [allocationId, setAllocationId] = useState<string | null>(null);

  // Config
  const [cryptoDiscount, setCryptoDiscount] = useState(5);
  const [cryptoWalletAddress, setCryptoWalletAddress] = useState("");
  const [cryptoNetwork, setCryptoNetwork] = useState("TRC-20 (TRON)");
  const [cryptoQrImageUrl, setCryptoQrImageUrl] = useState("");
  const [configLoaded, setConfigLoaded] = useState(false);

  // Form state
  const [countryCode, setCountryCode] = useState("");
  const [countryName, setCountryName] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod>("crypto_wallet");
  const [countrySearch, setCountrySearch] = useState("");
  const [kpPhone, setKpPhone] = useState("");
  const [kpLoading, setKpLoading] = useState(false);
  const [kpError, setKpError] = useState("");
  const [twSenderAddress, setTwSenderAddress] = useState("");
  const [twConfirmed, setTwConfirmed] = useState(false);
  const [cryptoError, setCryptoError] = useState("");

  // ── F1: Daily limit state ──
  const [bankTransferBlocked, setBankTransferBlocked] = useState(false);
  const [dailyLimitChecked, setDailyLimitChecked] = useState(false);

  // ── F2: Split payment state ──
  const [splitState, setSplitState] = useState<SplitState | null>(null);
  const [splitLoading, setSplitLoading] = useState(false);
  const [splitError, setSplitError] = useState("");

  // Feature A: Auto-reinvest toggle
  const [autoReinvest, setAutoReinvest] = useState(false);

  // Feature B: Referral code
  const [referralCode, setReferralCode] = useState("");
  const [referralValid, setReferralValid] = useState<boolean | null>(null);
  const [referralDiscount, setReferralDiscount] = useState(0);
  const [checkingReferral, setCheckingReferral] = useState(false);

  // Idempotency ref
  const isSubmittingRef = useRef(false);

  // ── URL PARAMS ───────────────────────────────────────────────────────────
  const rawPurchaseType = params.get("purchaseType");
  const nodeKey = params.get("node") || "foundation";
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
  const itype = params.get("itype") || "on_demand";
  const gpu = params.get("gpu") || "Shared Pool (NVIDIA T4)";
  const vram = params.get("vram") || "16 GB GDDR6";
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

  // ── FIX-STALE: On a fresh visit (no ?status= redirect), wipe any leftover
  // split/pending session so the user always starts clean.
  useEffect(() => {
    const hasRedirect =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("status");
    if (!hasRedirect) {
      sessionStorage.removeItem("korapay_split_checkout");
      sessionStorage.removeItem("korapay_pending_checkout");
    }
  }, []); // eslint-disable-line

  // ── INIT: auth + config in parallel ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    supabase.auth.getUser().then(({ data: { user } }: any) => {
      if (cancelled) return;
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
        if (cancelled || !data) {
          setConfigLoaded(true);
          return;
        }
        const get = (k: string) =>
          data.find((d: any) => d.key === k)?.value || "";
        const disc = get("crypto_discount_percent");
        const wallet = get("crypto_wallet_usdt_trc20");
        const network = get("crypto_network_label");
        const qr = get("crypto_qr_image_url");
        if (disc && !isNaN(parseFloat(disc)))
          setCryptoDiscount(parseFloat(disc));
        if (wallet && wallet !== "EMPTY") setCryptoWalletAddress(wallet);
        if (network && network !== "EMPTY") setCryptoNetwork(network);
        if (qr && qr !== "EMPTY") setCryptoQrImageUrl(qr);
        setConfigLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line

  // ── F1: Check daily bank transfer limit on mount ────────────────────────
  useEffect(() => {
    getDailyBankTransferNGNTotal().then((total) => {
      if (total >= DAILY_NGN_LIMIT) setBankTransferBlocked(true);
      setDailyLimitChecked(true);
    });
  }, []);

  // ── Handle KoraPay redirect (SPLIT + regular) ───────────────────────────
  useEffect(() => {
    const s = params.get("status");
    const r = params.get("reference");
    if (!s || !r) return;

    // ── F2: Handle split payment continuation ──
    const splitSaved = sessionStorage.getItem("korapay_split_checkout");
    if (splitSaved) {
      if (s === "success") {
        window.history.replaceState({}, "", "/dashboard/checkout");
        try {
          const saved: SplitState = JSON.parse(splitSaved);

          // Restore country so details step renders correctly
          if (saved.planData.countryCode) {
            setCountryCode(saved.planData.countryCode);
            setCountryName(saved.planData.countryName || "");
          }

          const updated: SplitState = {
            ...saved,
            completed: saved.completed + 1,
            references: [...saved.references, r],
          };

          if (updated.completed >= updated.installmentsNGN.length) {
            // ── All installments done — create allocation ──
            sessionStorage.removeItem("korapay_split_checkout");
            setTransactionId(r);

            supabase.auth.getUser().then(async ({ data: { user } }) => {
              if (!user) return;
              try {
                const id = await createMiningAllocation({
                  ...updated.planData,
                  userId: user.id,
                  transactionRef: updated.references.join(","),
                });
                if (id) setAllocationId(id);
              } catch (e) {
                console.error("[checkout] Split allocation failed:", e);
              }
            });

            setStep("success");
          } else {
            // ── More installments needed — show continuation modal ──
            sessionStorage.setItem(
              "korapay_split_checkout",
              JSON.stringify(updated),
            );
            setSplitState(updated);
            setStep("details");
          }
        } catch (e) {
          console.error("[checkout] Split state parse error:", e);
          sessionStorage.removeItem("korapay_split_checkout");
          setStep("failed");
          setErrorMsg("Payment session error. Please contact support.");
        }
      } else if (s === "declined") {
        sessionStorage.removeItem("korapay_split_checkout");
        setTransactionId(r);
        setStep("declined");
        window.history.replaceState({}, "", "/dashboard/checkout");
      }
      return; // Don't fall through to regular handler
    }

    // ── Regular KoraPay handler (unchanged) ──
    if (s === "success") {
      setTransactionId(r);
      setStep("success");
      window.history.replaceState({}, "", "/dashboard/checkout");

      const saved = sessionStorage.getItem("korapay_pending_checkout");
      if (saved) {
        sessionStorage.removeItem("korapay_pending_checkout");
        supabase.auth.getUser().then(async ({ data: { user } }) => {
          if (!user) return;
          try {
            const checkoutData = JSON.parse(saved);
            const id = await createMiningAllocation({
              ...checkoutData,
              userId: user.id,
              transactionRef: r,
            });
            if (id) setAllocationId(id);
          } catch (e) {
            console.error(
              "[checkout] Failed to create allocation after KoraPay:",
              e,
            );
          }
        });
      }
    } else if (s === "declined") {
      sessionStorage.removeItem("korapay_pending_checkout");
      setTransactionId(r);
      setStep("declined");
      window.history.replaceState({}, "", "/dashboard/checkout");
    }
  }, [params]); // eslint-disable-line

  // Default payment method when country changes
  useEffect(() => {
    if (!countryCode) return;
    setPayMethod(
      BANK_TRANSFER_COUNTRIES.has(countryCode)
        ? "bank_transfer"
        : "crypto_wallet",
    );
  }, [countryCode]);

  // Feature B: Validate referral code
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
        .select("discount_percent, is_active")
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

  // ── F2: Initiate a single split installment via KoraPay ─────────────────
  async function initiateSplitInstallment(state: SplitState) {
    if (!userId) return;
    setSplitLoading(true);
    setSplitError("");

    const installmentNGN = state.installmentsNGN[state.completed];
    const installmentUSD = parseFloat(
      (installmentNGN / state.ngnRate).toFixed(2),
    );

    try {
      // Save split state to sessionStorage so we can restore after redirect
      sessionStorage.setItem("korapay_split_checkout", JSON.stringify(state));

      const res = await fetch("/api/korapay/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          phone: state.kpPhone || "",
          nodeKey: state.planData.nodeKey || nodeKey,
          nodeName: state.planData.nodeName || nodeName,
          price: installmentNGN,
          originalPrice: installmentUSD,
          currency: state.localCurrency,
          itype: state.planData.itype || itype,
          gpu: state.planData.gpuModel || gpu,
          vram: state.planData.vram || vram,
          purchaseType,
          licenseType,
          paymentModel,
          miningPeriod: state.planData.miningPeriod || miningPeriod,
          contractMonths: state.planData.contractMonths || contractMonths,
          contractLabel: state.planData.contractLabel || contractLabel,
          contractMinPct: state.planData.contractMinPct || contractMinPct,
          contractMaxPct: state.planData.contractMaxPct || contractMaxPct,
          lockInMonths: state.planData.lockInMonths || lockInMonths,
          lockInMultiplier: state.planData.lockInMultiplier || lockInMultiplier,
          lockInLabel: state.planData.lockInLabel || lockInLabel,
          countryCode: state.planData.countryCode || countryCode,
          countryName: state.planData.countryName || countryName,
          // Split metadata
          isSplitPayment: true,
          splitInstallment: state.completed + 1,
          splitTotal: state.installmentsNGN.length,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        sessionStorage.removeItem("korapay_split_checkout");
        setSplitError(
          data.error || "Payment initiation failed. Please try again.",
        );
        setSplitLoading(false);
        return;
      }

      window.location.href = data.checkoutUrl;
    } catch (err: any) {
      sessionStorage.removeItem("korapay_split_checkout");
      setSplitError(
        "Connection error. Please check your internet and try again.",
      );
      setSplitLoading(false);
    }
  }

  // ── F1 + F2: Bank Transfer Submit ───────────────────────────────────────
  async function handleBankTransferSubmit() {
    if (!userId) {
      setKpError("Session not ready. Please wait and try again.");
      return;
    }
    setKpError("");
    setKpLoading(true);

    // ── F1: Re-check daily limit at time of submission ──
    const currentNGNTotal = await getDailyBankTransferNGNTotal();
    if (currentNGNTotal >= DAILY_NGN_LIMIT) {
      setBankTransferBlocked(true);
      setKpError(
        "Bank transfer is unavailable — today's processing limit has been reached. Please use Crypto or Card payment.",
      );
      setKpLoading(false);
      return;
    }

    const conversion = CURRENCY_RATES[countryCode];
    const localCurrency = conversion?.currency ?? "NGN";
    const convertedPrice = conversion
      ? parseFloat((price * conversion.rate).toFixed(2))
      : price;

    // ── F2: Check single-transaction limit ──
    if (convertedPrice > MAX_SINGLE_NGN_TXN) {
      const installmentsNGN = computeInstallments(convertedPrice);
      const planData: Record<string, any> = {
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
        // Extra fields for KoraPay call in initiateSplitInstallment
        nodeKey,
        nodeName,
        itype,
        purchaseType,
        licenseType,
      };

      const newSplitState: SplitState = {
        totalNGN: convertedPrice,
        totalUSD: price,
        ngnRate: conversion?.rate ?? 1600,
        localCurrency,
        installmentsNGN,
        completed: 0,
        references: [],
        kpPhone: kpPhone.trim(),
        planData,
      };

      setSplitState(newSplitState);
      setKpLoading(false);
      return; // Modal will render and handle from here
    }

    // ── Normal bank transfer flow (amount ≤ ₦200,000) ──
    try {
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
      console.error("Bank transfer error:", err);
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

    // Card payment
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
  const conversionInfo = CURRENCY_RATES[countryCode];
  const localAmount = conversionInfo
    ? Math.round(price * conversionInfo.rate)
    : null;

  if (userId === undefined) {
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
  }

  const periodLabel = PERIOD_LABELS[miningPeriod] ?? miningPeriod;

  // F1: Payment methods filtered by daily limit
  const availablePayMethods = (() => {
    const methods = getPaymentMethodsForCountry(countryCode, price);
    if (bankTransferBlocked)
      return methods.filter((m) => m !== "bank_transfer");
    return methods;
  })();

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: "#0d1117" }}>
      {showReceipt && (
        <Receipt data={receiptData} onClose={() => setShowReceipt(false)} />
      )}

      {/* ── F2: Split Payment Modal ── */}
      {splitState !== null && step === "details" && (
        <SplitPaymentModal
          state={splitState}
          loading={splitLoading}
          error={splitError}
          onInitiate={initiateSplitInstallment}
          onCancel={() => {
            sessionStorage.removeItem("korapay_split_checkout");
            setSplitState(null);
            setSplitError("");
            // ── FIX: switch to crypto so user sees an immediately usable option
            setPayMethod("crypto_wallet");
          }}
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

      {/* ── PENDING CRYPTO ── */}
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
                    alt="Payment QR"
                    className="w-40 h-40 rounded-xl object-contain"
                    style={{ background: "white", padding: "8px" }}
                  />
                ) : (
                  cryptoWalletAddress && (
                    <QRCode value={cryptoWalletAddress} size={160} />
                  )
                )}
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

      {/* ── DECLINED ── */}
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

      {/* ── COUNTRY SELECTION ── */}
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
                  className={`p-3 rounded-lg text-left transition-all border ${
                    countryCode === c.code
                      ? "bg-emerald-600/20 border-emerald-500 text-emerald-100"
                      : "bg-black/20 border-slate-700 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  <div className="font-semibold text-sm">{c.name}</div>
                  <div className="text-xs opacity-70">{c.code}</div>
                </button>
              ))}
            </div>
            <button
              onClick={() => countryCode && setStep("details")}
              disabled={!countryCode}
              className={`w-full mt-6 py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${
                countryCode
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                  : "bg-slate-700 text-slate-400 cursor-not-allowed"
              }`}
            >
              Continue <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── PAYMENT DETAILS ── */}
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

              {/* ── F1: Daily limit banner ── */}
              {bankTransferBlocked && dailyLimitChecked && (
                <div
                  className="rounded-xl p-4 flex items-start gap-3"
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.25)",
                  }}
                >
                  <AlertTriangle
                    size={15}
                    className="text-red-400 shrink-0 mt-0.5"
                  />
                  <div>
                    <p className="text-red-300 text-sm font-black">
                      Bank Transfer Unavailable Today
                    </p>
                    <p className="text-red-400/70 text-xs mt-0.5 leading-relaxed">
                      Our daily processing capacity for bank transfers has been
                      reached for today. This resets at midnight. Please use{" "}
                      <strong className="text-red-300">Crypto</strong> or{" "}
                      <strong className="text-red-300">Card</strong> to complete
                      your payment.
                    </p>
                  </div>
                </div>
              )}

              {/* Payment method selector */}
              {(() => {
                const methods = getPaymentMethodsForCountry(countryCode, price);
                return (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setPayMethod("crypto_wallet")}
                      className={`w-full p-4 rounded-xl transition-all border-2 relative overflow-hidden ${
                        payMethod === "crypto_wallet"
                          ? "bg-gradient-to-r from-violet-600/40 to-purple-600/40 border-violet-400"
                          : "bg-slate-800/50 border-slate-600 hover:border-violet-400/50"
                      }`}
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

                    {/* ── F1: Bank transfer button — disabled when limit reached ── */}
                    {methods.includes("bank_transfer") && (
                      <button
                        type="button"
                        onClick={() =>
                          !bankTransferBlocked && setPayMethod("bank_transfer")
                        }
                        disabled={bankTransferBlocked}
                        className={`w-full p-4 rounded-xl transition-all border-2 ${
                          bankTransferBlocked
                            ? "bg-slate-900/20 border-slate-800 opacity-50 cursor-not-allowed"
                            : payMethod === "bank_transfer"
                              ? "bg-blue-700/20 border-blue-400"
                              : "bg-slate-800/30 border-slate-700 hover:border-blue-500/50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-xl">🏦</div>
                          <div className="text-left flex-1">
                            <div className="text-slate-300 font-bold text-sm">
                              Local Transfer
                              {bankTransferBlocked && (
                                <span className="ml-2 text-[10px] font-black text-red-400 bg-red-900/20 border border-red-800/30 px-1.5 py-0.5 rounded-full">
                                  LIMIT REACHED
                                </span>
                              )}
                            </div>
                            <div className="text-slate-500 text-xs">
                              {bankTransferBlocked
                                ? "Unavailable today — resets at midnight"
                                : "Bank · Card · Mobile Money"}
                            </div>
                          </div>
                          <div className="text-slate-400 font-bold text-sm">
                            ${price.toFixed(2)}
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Feature A: Auto-reinvest toggle */}
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
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                        autoReinvest
                          ? "bg-emerald-500 border-emerald-500"
                          : "border-slate-600"
                      }`}
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

              {/* Feature B: Referral code */}
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
                    className={`w-full px-4 py-3 bg-black/30 border rounded-lg text-white placeholder-slate-600 text-sm font-mono uppercase focus:outline-none transition-colors ${
                      referralValid === true
                        ? "border-emerald-500"
                        : referralValid === false
                          ? "border-red-500"
                          : "border-slate-700 focus:border-amber-500"
                    }`}
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
                {/* ── Bank Transfer ── */}
                {payMethod === "bank_transfer" && !bankTransferBlocked && (
                  <div
                    className="rounded-2xl p-6 space-y-4"
                    style={{
                      background: "rgba(22,28,36,0.95)",
                      border: "1px solid rgba(59,130,246,0.25)",
                    }}
                  >
                    {/* F2: Show split notice if amount will require splitting */}
                    {localAmount && localAmount > MAX_SINGLE_NGN_TXN && (
                      <div
                        className="p-3 rounded-xl flex items-start gap-2.5"
                        style={{
                          background: "rgba(245,158,11,0.07)",
                          border: "1px solid rgba(245,158,11,0.25)",
                        }}
                      >
                        <Landmark
                          size={13}
                          className="text-amber-400 mt-0.5 shrink-0"
                        />
                        <div>
                          <p className="text-amber-300 text-xs font-black">
                            Installment Payment Required
                          </p>
                          <p className="text-amber-400/70 text-xs mt-0.5 leading-relaxed">
                            Your payment of{" "}
                            <strong className="text-amber-200">
                              ₦{localAmount.toLocaleString()}
                            </strong>{" "}
                            exceeds the ₦200,000 single-transaction limit. It
                            will be split into{" "}
                            <strong className="text-amber-200">
                              {computeInstallments(localAmount).length}{" "}
                              installments
                            </strong>{" "}
                            for regulatory compliance.
                          </p>
                        </div>
                      </div>
                    )}

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
                        placeholder=""
                        value={kpPhone}
                        onChange={(e) => setKpPhone(e.target.value)}
                        className="w-full px-4 py-3 bg-black/30 border border-slate-700 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
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
                      ) : localAmount && localAmount > MAX_SINGLE_NGN_TXN ? (
                        <>
                          <Landmark size={14} /> Set Up Installment Payment
                        </>
                      ) : (
                        <>
                          <Lock size={14} /> Proceed to Secure Payment
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* ── Crypto ── */}
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
                              alt="Payment QR Code"
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
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                          twConfirmed
                            ? "bg-violet-500 border-violet-500"
                            : "border-slate-600"
                        }`}
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

              {/* Total summary */}
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

      {/* ── PROCESSING ── */}
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
                  className={`flex items-center gap-3 text-sm ${
                    idx <= processingStep
                      ? "text-emerald-300"
                      : "text-slate-600"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      idx < processingStep
                        ? "bg-emerald-500 border-emerald-500"
                        : idx === processingStep
                          ? "border-emerald-500 animate-pulse"
                          : "border-slate-600"
                    }`}
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

      {/* ── SUCCESS ── */}
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

      {/* ── FAILED ── */}
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
