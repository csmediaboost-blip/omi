"use client";
// app/dashboard/financials/page.tsx — FIXED VERSION
// Fix 1: Withdraw button now clickable — canWithdraw no longer blocked by isBizDay
//         (business day is enforced server-side; UI only shows a notice)
// Fix 2: Business day + holiday notice shown clearly in UI and modal
// Fix 3: Withdrawal uses /api/withdraw route → Korapay auto-processes bank transfers
//         Exact API error messages surfaced to user
// Fix 4: Korapay narration = "OmniTaskPro Earnings" (handled server-side)

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getBusinessDayMessage,
  isBusinessDay,
  getTodayHoliday,
  nextBusinessDayLabel,
} from "@/lib/business-days";
import DashboardNavigation from "@/components/dashboard-navigation";
import {
  isKYCApproved,
  logWithdrawalEvent,
  type UserSecurityProfile,
} from "@/lib/withdrawal-security";
import {
  Receipt,
  DollarSign,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Server,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  Wallet,
  BarChart3,
  CreditCard,
  Lock,
  Activity,
  Send,
  X,
  Pickaxe,
  Cpu,
  CalendarX,
  Info,
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────
type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  status: string | null;
  balance_available: number;
  wallet_balance: number;
  balance: number | null;
  total_earned: number;
  total_withdrawn: number;
  referral_earnings: number;
  kyc_verified: boolean;
  kyc_status: string | null;
  payout_registered: boolean;
  payout_account_name: string | null;
  payout_bank_name: string | null;
  payout_account_number: string | null;
  payout_gateway: string | null;
  payout_currency: string | null;
  payout_kyc_match: boolean;
  withdrawals_frozen: boolean;
  withdrawal_freeze_until: string | null;
  withdrawal_freeze_reason: string | null;
  last_login: string | null;
  pin_set: boolean;
  created_at: string;
};

type NodeAllocation = {
  id: string;
  user_id: string;
  plan_id: string;
  amount_invested: number;
  currency: string;
  payment_model: string;
  contract_months: number | null;
  contract_label: string | null;
  contract_min_pct: number | null;
  contract_max_pct: number | null;
  maturity_date: string | null;
  lock_in_label: string;
  status: string;
  total_earned: number;
  total_withdrawn: number;
  mining_period: string | null;
  mining_ends_at: string | null;
  mining_completed: boolean;
  final_profit: number | null;
  created_at: string;
};

type PaymentTx = {
  id: number;
  user_id: string;
  node_key: string;
  amount: number;
  currency: string;
  gateway: string;
  gateway_reference: string | null;
  status: string;
  crypto_currency: string | null;
  crypto_amount: number | null;
  metadata: string | null;
  created_at: string;
  confirmed_at: string | null;
  verified_by_admin: boolean | null;
};

type OperatorLicense = {
  id: string;
  user_id: string;
  license_type: string;
  status: string;
  expires_at: string | null;
  purchased_at: string | null;
  payment_id: string | null;
};

type LedgerTx = {
  id: string;
  type: string;
  amount: number;
  balance_after: number | null;
  description: string;
  reference_id: string | null;
  created_at: string;
};

type Withdrawal = {
  id: string | number;
  amount: number;
  wallet_address: string;
  status: string;
  tracking_status?: string;
  expected_date?: string | null;
  created_at: string;
  paid_at: string | null;
  failure_reason: string | null;
  payout_account_name?: string | null;
  payout_method?: string | null;
  auto_processed?: boolean;
  reference?: string | null;
};

type DepositEntry = {
  id: string;
  type: "payment" | "gpu_mining" | "gpu_contract" | "license";
  label: string;
  amount: number;
  status: "confirmed" | "pending" | "failed";
  gateway: string;
  planName?: string;
  gpuModel?: string;
  miningPeriod?: string;
  reference?: string;
  created_at: string;
};

// ─── KYC helper ──────────────────────────────────────────────────────────────
function resolveKycOk(profile: UserProfile | null): boolean {
  if (!profile) return false;
  if (profile.kyc_verified === true) return true;
  if (profile.kyc_status === "approved" || profile.kyc_status === "verified")
    return true;
  try {
    return isKYCApproved(profile as unknown as UserSecurityProfile);
  } catch {
    return false;
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
    confmrmed: "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
    completed: "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
    active: "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
    queued: "bg-blue-900/30 border-blue-700/40 text-blue-400",
    processing: "bg-violet-900/30 border-violet-700/40 text-violet-400",
    paid: "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
    pending: "bg-amber-900/30 border-amber-700/40 text-amber-400",
    failed: "bg-red-900/30 border-red-700/40 text-red-400",
    declined: "bg-red-900/30 border-red-700/40 text-red-400",
    rejected: "bg-red-900/30 border-red-700/40 text-red-400",
    expired: "bg-slate-800 border-slate-700 text-slate-400",
    flagged: "bg-orange-900/30 border-orange-700/40 text-orange-400",
    matured: "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
  };
  return (
    <span
      className={`text-[10px] font-black px-2 py-0.5 rounded-full border capitalize ${map[status] ?? "bg-slate-800 border-slate-700 text-slate-400"}`}
    >
      {status}
    </span>
  );
}

function StatBox({
  label,
  value,
  color,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  sub?: string;
}) {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <div
        className={`w-8 h-8 bg-slate-800 rounded-xl flex items-center justify-center mb-2 ${color}`}
      >
        <Icon size={15} />
      </div>
      <p className="text-slate-400 text-[10px] uppercase tracking-wide">
        {label}
      </p>
      <p className={`font-black text-lg ${color}`}>{value}</p>
      {sub && <p className="text-slate-600 text-[10px] mt-0.5">{sub}</p>}
    </div>
  );
}

function GatewayBadge({ gateway }: { gateway: string }) {
  const g = (gateway || "").toLowerCase();
  if (g === "crypto_wallet" || g === "crypto" || g === "usdt" || g === "btc")
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-900/30 border border-violet-700/40 text-violet-400">
        ₿ Crypto
      </span>
    );
  if (g === "bank_transfer" || g === "korapay" || g === "bank")
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-700/40 text-blue-400">
        🏦 Bank Transfer
      </span>
    );
  if (g === "gpu_mining")
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-900/30 border border-emerald-700/40 text-emerald-400">
        ⛏️ GPU Mining
      </span>
    );
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
      💳 Card
    </span>
  );
}

const LICENSE_LABELS: Record<string, string> = {
  thermal_optimization: "Thermal & Neural Operator",
  rlhf_validation: "RLHF Validation Operator",
  gpu_allocation: "GPU Allocation Operator",
  operator_license: "Certified AI Operator",
  all: "Full Operator License",
};

const PERIOD_LABELS: Record<string, string> = {
  hourly: "1 Hour",
  daily: "1 Day",
  weekly: "1 Week",
  monthly: "1 Month",
  contract: "Contract",
};

// ─── BUSINESS DAY NOTICE BANNER ───────────────────────────────────────────────
function BusinessDayBanner() {
  const bizDay = isBusinessDay();
  const holiday = getTodayHoliday();
  const nextDay = nextBusinessDayLabel();

  if (bizDay) return null; // Don't show anything on business days

  const day = new Date().getDay();
  const isWeekend = day === 0 || day === 6;

  return (
    <div
      className="rounded-xl px-4 py-3 flex items-start gap-3"
      style={{
        background: "rgba(245,158,11,0.08)",
        border: "1px solid rgba(245,158,11,0.3)",
      }}
    >
      <CalendarX size={15} className="text-amber-400 shrink-0 mt-0.5" />
      <div>
        <p className="text-amber-300 text-sm font-bold">
          {holiday
            ? `🎌 Public Holiday — ${holiday.name}`
            : isWeekend
              ? `🏖️ ${day === 6 ? "Saturday" : "Sunday"} — Weekend`
              : "Non-Business Day"}
        </p>
        <p className="text-amber-400/80 text-xs mt-0.5">
          {holiday
            ? `Banks are closed today. Withdrawals will resume on ${nextDay}.`
            : `Withdrawals are only processed on business days (Mon–Fri). Next available day: ${nextDay}.`}
        </p>
        <p className="text-amber-500/60 text-[11px] mt-1">
          You can still queue a request — it will be processed on the next
          business day.
        </p>
      </div>
    </div>
  );
}

// ─── WITHDRAW MODAL ───────────────────────────────────────────────────────────
function WithdrawModal({
  userId,
  availableBalance,
  isFrozen,
  profile,
  onClose,
  onSuccess,
}: {
  userId: string;
  availableBalance: number;
  isFrozen: boolean;
  profile: UserProfile;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorAction, setErrorAction] = useState<string | null>(null);
  const router = useRouter();

  const MIN = 10;
  const amt = parseFloat(amount) || 0;
  const available = Math.max(0, availableBalance);
  const expDays = amt < 500 ? 1 : amt < 5000 ? 2 : amt < 50000 ? 5 : 7;
  const expDate = new Date(Date.now() + expDays * 86400000);
  const bizMsg = getBusinessDayMessage();
  const isBizDay = isBusinessDay();
  const holiday = getTodayHoliday();
  const nextDay = nextBusinessDayLabel();

  const payoutGateway = profile.payout_gateway ?? "unknown";
  const payoutName = profile.payout_account_name ?? "—";
  const payoutBank = profile.payout_bank_name ?? "";
  const payoutAcct = profile.payout_account_number ?? "—";
  const hasPayout = !!(
    profile.payout_registered && profile.payout_account_number
  );
  const kycOk = resolveKycOk(profile);

  const isCrypto =
    payoutGateway === "crypto" ||
    payoutGateway === "crypto_wallet" ||
    payoutGateway === "usdt" ||
    payoutGateway === "btc";

  // Check all qualifications for display
  const qualifications = [
    { label: "KYC Verified", ok: kycOk, action: "complete_kyc" },
    {
      label: "Payout Account Set Up",
      ok: hasPayout,
      action: "setup_payout",
    },
    {
      label: "Account Name Matches KYC",
      ok: profile.payout_kyc_match,
      action: "fix_payout",
    },
    { label: "Withdrawals Not Frozen", ok: !isFrozen, action: null },
    { label: "Balance ≥ $10.00", ok: available >= MIN, action: null },
    { label: "Security PIN Set", ok: profile.pin_set, action: "set_pin" },
  ];
  const allQualified = qualifications.every((q) => q.ok);

  async function handleSubmit() {
    setError("");
    setErrorAction(null);

    if (!amount || amt <= 0) {
      setError("Please enter a withdrawal amount.");
      return;
    }
    if (amt < MIN) {
      setError(`Minimum withdrawal is $${MIN.toFixed(2)}.`);
      return;
    }
    if (amt > available) {
      setError(
        `Amount exceeds your available balance of $${available.toFixed(2)}.`,
      );
      return;
    }
    if (!pin || pin.length < 4) {
      setError("Please enter your security PIN (4–6 digits).");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, pin }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(
          data.error ||
            "Withdrawal failed. Please refresh the page and try again.",
        );
        if (data.action) setErrorAction(data.action);

        // Log the failure
        logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
          reason: data.error,
          amount: amt,
        }).catch(() => {});
        setLoading(false);
        return;
      }

      onSuccess(
        data.message ||
          `Withdrawal of $${amt.toFixed(2)} submitted successfully!`,
      );
    } catch (e: any) {
      setError(
        "A network error occurred. Please check your connection and try again.",
      );
    }
    setLoading(false);
  }

  function handleActionClick() {
    if (errorAction === "complete_kyc") router.push("/dashboard/verification");
    else if (errorAction === "setup_payout")
      router.push("/dashboard/verification");
    else if (errorAction === "fix_payout")
      router.push("/dashboard/verification");
    else if (errorAction === "set_pin") router.push("/dashboard/settings");
  }

  const canSubmit =
    allQualified &&
    amt >= MIN &&
    amt <= available &&
    pin.length >= 4 &&
    !loading;

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col"
        style={{
          background: "rgb(10,16,28)",
          border: "1px solid rgba(16,185,129,0.3)",
          maxHeight: "92vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-center justify-between flex-shrink-0"
          style={{
            background: "rgba(16,185,129,0.08)",
            borderBottom: "1px solid rgba(16,185,129,0.2)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <ArrowUpRight size={16} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-black text-sm">
                Request Withdrawal
              </p>
              <p className="text-slate-500 text-xs">
                Processed to your registered account
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Non-business day notice */}
          {!isBizDay && (
            <div
              className="rounded-xl p-3"
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.3)",
              }}
            >
              <p className="text-amber-400 text-sm font-bold flex items-center gap-2">
                <CalendarX size={13} />
                {holiday
                  ? `Public Holiday — ${holiday.name}`
                  : "Non-Business Day"}
              </p>
              <p className="text-amber-500/80 text-xs mt-1">
                {holiday
                  ? `Banks are closed today. Your request will be queued and processed on ${nextDay}.`
                  : `Your request will be queued and processed on ${nextDay} (next business day).`}
              </p>
            </div>
          )}

          {/* Qualification checklist */}
          <div
            className="rounded-xl p-4"
            style={{
              background: "rgba(15,23,42,0.8)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <p className="text-slate-400 text-[10px] uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Shield size={9} className="text-blue-400" /> Withdrawal
              Requirements
            </p>
            <div className="space-y-1.5">
              {qualifications.map((q) => (
                <div key={q.label} className="flex items-center gap-2">
                  {q.ok ? (
                    <CheckCircle
                      size={12}
                      className="text-emerald-400 shrink-0"
                    />
                  ) : (
                    <XCircle size={12} className="text-red-400 shrink-0" />
                  )}
                  <span
                    className={`text-xs ${q.ok ? "text-slate-400" : "text-red-400 font-semibold"}`}
                  >
                    {q.label}
                  </span>
                  {!q.ok && q.action && (
                    <button
                      onClick={() => {
                        setErrorAction(q.action);
                        handleActionClick();
                      }}
                      className="text-[10px] text-blue-400 underline ml-auto shrink-0"
                    >
                      Fix →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Payout account info */}
          <div
            className="rounded-xl p-4"
            style={{
              background: "rgba(59,130,246,0.06)",
              border: "1px solid rgba(59,130,246,0.2)",
            }}
          >
            <p className="text-slate-400 text-[10px] uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Shield size={9} className="text-blue-400" /> Registered Payout
              Account
            </p>
            {hasPayout ? (
              <div className="space-y-0.5">
                <p className="text-white font-bold text-sm">{payoutName}</p>
                {payoutBank && (
                  <p className="text-slate-400 text-xs">{payoutBank}</p>
                )}
                <p className="text-slate-500 text-xs font-mono">
                  {payoutAcct.length > 12
                    ? payoutAcct.slice(0, 12) + "..."
                    : payoutAcct}
                </p>
                <p className="text-blue-400 text-[10px] capitalize">
                  via {payoutGateway}
                </p>
                {isCrypto && (
                  <p className="text-violet-400 text-[10px] flex items-center gap-1 mt-1">
                    <Info size={9} /> Crypto withdrawals are processed manually
                    by financial Team (1–3 business days)
                  </p>
                )}
                {kycOk && (
                  <p className="text-emerald-400 text-[10px] flex items-center gap-1 mt-0.5">
                    <CheckCircle size={9} /> KYC verified
                  </p>
                )}
              </div>
            ) : (
              <div>
                <p className="text-red-400 text-sm font-bold">
                  No payout account registered
                </p>
                <p className="text-slate-500 text-xs mt-0.5">
                  Go to Verification → Payout Setup first.
                </p>
              </div>
            )}
          </div>

          {/* Available balance */}
          <div
            className="rounded-xl p-4"
            style={{
              background: "rgba(16,185,129,0.06)",
              border: "1px solid rgba(16,185,129,0.2)",
            }}
          >
            <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">
              Available Balance
            </p>
            <p className="text-emerald-400 font-black text-2xl">
              ${available.toFixed(4)}
            </p>
            <p className="text-slate-600 text-xs mt-0.5">
              Minimum withdrawal: $10.00
            </p>
          </div>

          {/* Amount input */}
          <div>
            <label className="text-slate-300 text-sm font-bold block mb-2">
              Amount (USD)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">
                $
              </span>
              <input
                type="number"
                min={MIN}
                max={available}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-9 pr-4 py-3.5 rounded-xl text-xl font-black text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <div className="flex gap-2 mt-2">
              {[25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  onClick={() => setAmount(((available * p) / 100).toFixed(2))}
                  className="flex-1 text-[11px] font-bold py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-400 transition-all"
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>

          {/* Business day status */}
          <div
            className="rounded-xl p-3"
            style={{
              background: isBizDay
                ? "rgba(16,185,129,0.08)"
                : "rgba(245,158,11,0.08)",
              border: isBizDay
                ? "1px solid rgba(16,185,129,0.2)"
                : "1px solid rgba(245,158,11,0.3)",
            }}
          >
            <p
              className={`text-sm font-bold flex items-center gap-2 ${isBizDay ? "text-emerald-400" : "text-amber-400"}`}
            >
              {isBizDay ? <CheckCircle size={13} /> : <CalendarX size={13} />}
              {bizMsg}
            </p>
            {!isBizDay && (
              <p className="text-amber-500/70 text-xs mt-1">
                Requests submitted now will be processed on {nextDay}.
              </p>
            )}
          </div>

          {/* PIN */}
          <div>
            <label className="text-slate-300 text-sm font-bold block mb-2">
              Security PIN <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="Enter your 4–6 digit PIN"
              className="w-full px-4 py-3 rounded-xl text-lg font-bold text-center tracking-widest text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            {!profile.pin_set && (
              <p className="text-amber-400 text-xs mt-1.5 flex items-center gap-1">
                <AlertTriangle size={10} /> You haven&apos;t set a PIN yet.{" "}
                <button
                  onClick={() => router.push("/dashboard/settings")}
                  className="underline"
                >
                  Set PIN in Settings →
                </button>
              </p>
            )}
          </div>

          {/* Settlement timeline */}
          {amt >= MIN && amt <= available && (
            <div
              className="rounded-xl p-4 space-y-2"
              style={{
                background: "rgba(59,130,246,0.06)",
                border: "1px solid rgba(59,130,246,0.2)",
              }}
            >
              <p className="text-blue-300 text-xs font-black uppercase tracking-wide">
                Settlement Timeline
              </p>
              {[
                {
                  label: "Queued",
                  desc: "Request received",
                  done: true,
                  active: false,
                },
                {
                  label: isCrypto ? "Manual Review" : "Auto-Processing",
                  desc: isCrypto
                    ? "Admin sends crypto"
                    : "Korapay auto-transfers",
                  done: false,
                  active: true,
                },
                {
                  label: "In Transit",
                  desc: amt < 500 ? "Same day" : "Batch",
                  done: false,
                  active: false,
                },
                {
                  label: "Paid",
                  desc: `Expected ${expDate.toLocaleDateString()}`,
                  done: false,
                  active: false,
                },
              ].map((s) => (
                <div key={s.label} className="flex items-start gap-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${s.done ? "bg-emerald-500 border-emerald-500" : s.active ? "border-blue-400 animate-pulse" : "border-slate-700"}`}
                  >
                    {s.done && <CheckCircle size={9} className="text-white" />}
                  </div>
                  <div>
                    <p
                      className={`text-xs font-bold ${s.done ? "text-emerald-400" : s.active ? "text-blue-300" : "text-slate-600"}`}
                    >
                      {s.label}
                    </p>
                    <p className="text-slate-600 text-[10px]">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error display */}
          {error && (
            <div
              className="rounded-xl p-3"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
              }}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  size={13}
                  className="text-red-400 shrink-0 mt-0.5"
                />
                <div className="flex-1">
                  <p className="text-red-400 text-sm">{error}</p>
                  {errorAction && (
                    <button
                      onClick={handleActionClick}
                      className="text-blue-400 text-xs underline mt-1.5 flex items-center gap-1"
                    >
                      <ArrowUpRight size={10} />
                      {errorAction === "complete_kyc" &&
                        "Go to KYC Verification →"}
                      {errorAction === "setup_payout" && "Go to Payout Setup →"}
                      {errorAction === "fix_payout" && "Fix Payout Account →"}
                      {errorAction === "set_pin" &&
                        "Go to Settings → Set PIN →"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
          >
            {loading ? (
              <>
                <RefreshCw size={15} className="animate-spin" /> Submitting…
              </>
            ) : pin.length < 4 ? (
              <>
                <Lock size={15} /> Enter PIN to continue
              </>
            ) : !allQualified ? (
              <>
                <AlertTriangle size={15} /> Complete requirements above
              </>
            ) : (
              <>
                <Send size={15} />
                {isBizDay
                  ? `Request Withdrawal of $${amount || "0.00"}`
                  : `Queue Withdrawal of $${amount || "0.00"} (processes ${nextDay})`}
              </>
            )}
          </button>
          <p className="text-slate-600 text-[11px] text-center pb-1">
            {isCrypto
              ? "Crypto withdrawals are processed manually by our team within 1–3 business days."
              : "Bank transfers are auto-processed via OmniTaskPro payment system."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function FinancialsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [paymentTxs, setPaymentTxs] = useState<PaymentTx[]>([]);
  const [nodeAllocations, setNodeAllocations] = useState<NodeAllocation[]>([]);
  const [licenses, setLicenses] = useState<OperatorLicense[]>([]);
  const [ledgerTxs, setLedgerTxs] = useState<LedgerTx[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [gpuPlans, setGpuPlans] = useState<
    Record<string, { name: string; gpu_model: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    | "overview"
    | "deposits"
    | "investments"
    | "licenses"
    | "ledger"
    | "withdrawals"
  >("overview");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(
    null,
  );
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  function showToast(text: string, ok = true) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 7000);
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/auth/signin");
      return;
    }
    setUserId(user.id);

    try {
      await fetch("/api/mining/claim-session", { method: "POST" });
    } catch {}

    const [profRes, payRes, nodeRes, licRes, ledgerRes, wRes, plansRes] =
      await Promise.allSettled([
        supabase
          .from("users")
          .select(
            "id, email, full_name, role, status, " +
              "balance_available, wallet_balance, balance, " +
              "total_earned, total_withdrawn, referral_earnings, " +
              "kyc_verified, kyc_status, " +
              "payout_registered, payout_account_name, payout_bank_name, " +
              "payout_account_number, payout_gateway, payout_currency, payout_kyc_match, " +
              "withdrawals_frozen, withdrawal_freeze_until, withdrawal_freeze_reason, " +
              "last_login, pin_set, created_at",
          )
          .eq("id", user.id)
          .single(),

        supabase
          .from("payment_transactions")
          .select(
            "id, user_id, node_key, amount, currency, gateway, gateway_reference, status, metadata, created_at, confirmed_at, verified_by_admin",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),

        supabase
          .from("node_allocations")
          .select(
            "id, user_id, plan_id, amount_invested, currency, payment_model, contract_months, contract_label, contract_min_pct, contract_max_pct, maturity_date, lock_in_label, status, total_earned, total_withdrawn, mining_period, mining_ends_at, mining_completed, final_profit, created_at",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),

        supabase
          .from("operator_licenses")
          .select(
            "id, user_id, license_type, status, expires_at, purchased_at, payment_id",
          )
          .eq("user_id", user.id)
          .order("purchased_at", { ascending: false })
          .limit(20),

        supabase
          .from("transaction_ledger")
          .select(
            "id, type, amount, balance_after, description, reference_id, created_at",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),

        supabase
          .from("withdrawals")
          .select(
            "id, user_id, amount, wallet_address, payout_method, payout_account_name, payout_bank_name, status, tracking_status, expected_date, created_at, paid_at, failure_reason, auto_processed, reference",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),

        supabase.from("gpu_plans").select("id, name, gpu_model"),
      ]);

    if (profRes.status === "fulfilled" && profRes.value.error) {
      console.error("[PROFILE] Query error:", profRes.value.error.message);
    }
    if (profRes.status === "fulfilled" && profRes.value.data) {
      setProfile(profRes.value.data as UserProfile);
    }
    if (payRes.status === "fulfilled") setPaymentTxs(payRes.value.data ?? []);
    if (nodeRes.status === "fulfilled")
      setNodeAllocations(nodeRes.value.data ?? []);
    if (licRes.status === "fulfilled") setLicenses(licRes.value.data ?? []);
    if (ledgerRes.status === "fulfilled")
      setLedgerTxs(ledgerRes.value.data ?? []);
    if (wRes.status === "fulfilled") setWithdrawals(wRes.value.data ?? []);

    if (plansRes.status === "fulfilled" && plansRes.value.data) {
      const map: Record<string, { name: string; gpu_model: string }> = {};
      for (const p of plansRes.value.data)
        map[p.id] = { name: p.name, gpu_model: p.gpu_model };
      setGpuPlans(map);
    }

    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("finance_realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "payment_transactions",
          filter: `user_id=eq.${userId}`,
        },
        () => loadData(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "payment_transactions",
          filter: `user_id=eq.${userId}`,
        },
        () => loadData(),
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "node_allocations",
          filter: `user_id=eq.${userId}`,
        },
        () => loadData(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          const updated = payload.new as any;
          if (updated?.balance_available !== undefined) {
            setProfile((prev) =>
              prev
                ? {
                    ...prev,
                    balance_available: updated.balance_available,
                    total_earned: updated.total_earned ?? prev.total_earned,
                  }
                : prev,
            );
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, loadData]);

  if (loading)
    return (
      <div className="flex min-h-screen bg-slate-950">
        <DashboardNavigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      </div>
    );

  // ─── DERIVED VALUES ──────────────────────────────────────────────────────
  const avail =
    profile?.balance_available ??
    profile?.wallet_balance ??
    profile?.balance ??
    0;
  const totalEarned = profile?.total_earned ?? 0;
  const totalWd = profile?.total_withdrawn ?? 0;
  const isFrozen = profile?.withdrawals_frozen ?? false;
  const kycOk = resolveKycOk(profile);

  const activeLicenses = licenses.filter((l) => l.status === "active");
  const activeNodes = nodeAllocations.filter(
    (n) => n.status === "active" && !n.mining_completed,
  );
  const totalInvested = nodeAllocations.reduce(
    (s, n) => s + (n.amount_invested ?? 0),
    0,
  );
  const totalNodeEarned = nodeAllocations.reduce(
    (s, n) => s + (n.total_earned ?? 0),
    0,
  );
  const pendingWDs = withdrawals.filter(
    (w) => w.status === "queued" || w.status === "processing",
  );

  const unclaimedMatured = nodeAllocations.filter(
    (n) =>
      !n.mining_completed &&
      n.payment_model === "flexible" &&
      n.mining_ends_at &&
      new Date(n.mining_ends_at) <= new Date(),
  );
  const unclaimedTotal = unclaimedMatured.reduce(
    (s, n) => s + (n.amount_invested ?? 0) + (n.total_earned ?? 0),
    0,
  );
  const effectiveAvail = avail + unclaimedTotal;
  const effectiveTotalEarned = Math.max(totalEarned, totalNodeEarned);

  // ─── FIX #1: canWithdraw no longer blocked by business day ───────────────
  // Business day enforcement is on the server — UI just shows a notice.
  // User can always click the button; server will reject with exact message.
  const canWithdraw =
    !isFrozen &&
    effectiveAvail >= 10 &&
    !!profile?.payout_registered &&
    kycOk &&
    !!profile?.pin_set;

  // ─── DEPOSIT ENTRIES ─────────────────────────────────────────────────────
  const depositEntries: DepositEntry[] = [];

  for (const pt of paymentTxs) {
    const meta = (() => {
      try {
        return pt.metadata ? JSON.parse(pt.metadata) : {};
      } catch {
        return {};
      }
    })();
    const isGpuPayment =
      pt.gateway === "gpu_mining" ||
      meta.purchaseType === "gpu_plan" ||
      meta.purchaseType === "gpu_contract" ||
      meta.purchaseType === "gpu_mining";
    const isLicensePayment = meta.purchaseType === "license";
    const resolvedStatus: "confirmed" | "pending" | "failed" =
      pt.status === "confirmed" ||
      pt.status === "confmrmed" ||
      pt.status === "completed"
        ? "confirmed"
        : pt.status === "failed" ||
            pt.status === "declined" ||
            pt.status === "rejected"
          ? "failed"
          : "pending";

    depositEntries.push({
      id: `pt-${pt.id}`,
      type: isLicensePayment
        ? "license"
        : isGpuPayment
          ? meta.purchaseType === "gpu_contract"
            ? "gpu_contract"
            : "gpu_mining"
          : "payment",
      label: isLicensePayment
        ? `Operator License${meta.licenseType ? ` — ${LICENSE_LABELS[meta.licenseType] ?? meta.licenseType}` : ""}`
        : isGpuPayment
          ? `GPU Mining Deposit${meta.planName ? ` — ${meta.planName}` : ""}`
          : "Payment",
      amount: pt.amount,
      status: resolvedStatus,
      gateway: pt.gateway,
      planName: meta.planName,
      miningPeriod: meta.miningPeriod,
      reference: pt.gateway_reference ?? String(pt.id),
      created_at: pt.created_at,
    });
  }

  const ptAllocIds = new Set<string>();
  for (const pt of paymentTxs) {
    if (pt.node_key) ptAllocIds.add(pt.node_key);
    if (pt.gateway_reference) ptAllocIds.add(pt.gateway_reference);
    try {
      const m = pt.metadata ? JSON.parse(pt.metadata) : {};
      if (m.allocationId) ptAllocIds.add(m.allocationId);
    } catch {}
  }
  for (const alloc of nodeAllocations) {
    if (ptAllocIds.has(alloc.id)) continue;
    const plan = gpuPlans[alloc.plan_id];
    depositEntries.push({
      id: `alloc-${alloc.id}`,
      type: alloc.payment_model === "contract" ? "gpu_contract" : "gpu_mining",
      label: `GPU Mining Deposit${plan ? ` — ${plan.name}` : ""}`,
      amount: alloc.amount_invested,
      status: "confirmed",
      gateway: "gpu_mining",
      planName: plan?.name,
      gpuModel: plan?.gpu_model,
      miningPeriod: alloc.mining_period ?? "daily",
      reference: alloc.id,
      created_at: alloc.created_at,
    });
  }

  depositEntries.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const confirmedDeposits = depositEntries.filter(
    (d) => d.status === "confirmed",
  );
  const pendingDeposits = depositEntries.filter((d) => d.status === "pending");
  const totalDeposited = confirmedDeposits.reduce((s, d) => s + d.amount, 0);
  const totalPendingDeposits = pendingDeposits.reduce(
    (s, d) => s + d.amount,
    0,
  );

  // Header button label — now includes non-biz day info but button stays clickable
  const isBizDay = isBusinessDay();
  const headerBtnLabel = isFrozen
    ? "Frozen"
    : !profile?.payout_registered
      ? "Setup Payout First"
      : !kycOk
        ? "KYC Required"
        : !profile?.pin_set
          ? "Set PIN First"
          : effectiveAvail < 10
            ? "Need $10 min"
            : !isBizDay
              ? `Withdraw $${effectiveAvail.toFixed(2)} (queue)`
              : `Withdraw $${effectiveAvail.toFixed(2)}`;

  const TABS: Array<{
    id: typeof tab;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
  }> = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "deposits", label: "All Deposits", icon: CreditCard },
    { id: "investments", label: "Mining Portfolio", icon: Server },
    { id: "licenses", label: "Licenses", icon: Shield },
    { id: "ledger", label: "Ledger", icon: Receipt },
    { id: "withdrawals", label: "Withdrawals", icon: ArrowUpRight },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <DashboardNavigation />

      {showWithdrawModal && userId && profile && (
        <WithdrawModal
          userId={userId}
          availableBalance={effectiveAvail}
          isFrozen={isFrozen}
          profile={profile}
          onClose={() => setShowWithdrawModal(false)}
          onSuccess={(message: string) => {
            setShowWithdrawModal(false);
            showToast(message);
            loadData();
            setTab("withdrawals");
          }}
        />
      )}

      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl max-w-sm flex items-start gap-2 ${toast.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
        >
          <span className="shrink-0 mt-0.5">
            {toast.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
          </span>
          <span>{toast.text}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 md:p-6 pb-24 md:pb-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
                <Wallet size={22} className="text-amber-400" /> Financials
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">
                Your complete financial picture
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={loadData}
                className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs px-3 py-1.5 border border-slate-800 rounded-lg transition-all"
              >
                <RefreshCw size={12} /> Refresh
              </button>
              {/* FIX #1: Button is always clickable when user meets basic requirements */}
              <button
                onClick={() => setShowWithdrawModal(true)}
                disabled={!canWithdraw}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg,#10b981,#059669)",
                }}
              >
                <ArrowUpRight size={14} />
                {headerBtnLabel}
              </button>
            </div>
          </div>

          {/* FIX #2: Business day / holiday banner */}
          <BusinessDayBanner />

          {/* Alerts */}
          {!kycOk && (
            <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={14} className="text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">
                KYC verification required before  withdrawals
                .{" "}
                <button
                  onClick={() => router.push("/dashboard/verification")}
                  className="underline font-bold"
                >
                  Complete verification →
                </button>
              </p>
            </div>
          )}

          {profile && !profile.pin_set && kycOk && (
            <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <Lock size={14} className="text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">
                <strong>Security PIN not set.</strong> You need a PIN to
                withdraw.{" "}
                <button
                  onClick={() => router.push("/dashboard/settings")}
                  className="underline"
                >
                  Set PIN in Settings →
                </button>
              </p>
            </div>
          )}

          {pendingDeposits.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <Clock size={14} className="text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">
                <strong>
                  {pendingDeposits.length} payment
                  {pendingDeposits.length > 1 ? "s" : ""} pending approval
                </strong>{" "}
                — ${totalPendingDeposits.toFixed(2)} total.
              </p>
            </div>
          )}

          {unclaimedMatured.length > 0 && (
            <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Pickaxe size={14} className="text-emerald-400 shrink-0" />
                <p className="text-emerald-300 text-sm">
                  <strong>
                    {unclaimedMatured.length} mining session
                    {unclaimedMatured.length > 1 ? "s" : ""} completed
                  </strong>{" "}
                  — ${unclaimedTotal.toFixed(2)} pending credit.
                </p>
              </div>
              <button
                onClick={async () => {
                  await fetch("/api/mining/claim-session", { method: "POST" });
                  loadData();
                }}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-black text-slate-950"
                style={{ background: "#10b981" }}
              >
                Claim Now
              </button>
            </div>
          )}

          {kycOk && !profile?.payout_registered && (
            <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={14} className="text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">
                <strong>Payout account not set up.</strong>{" "}
                <button
                  onClick={() => router.push("/dashboard/verification")}
                  className="underline"
                >
                  Verification → Payout Setup →
                </button>
              </p>
            </div>
          )}

          {isFrozen && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <Lock size={14} className="text-red-400 shrink-0" />
              <p className="text-red-300 text-sm">
                Your withdrawals are currently frozen.
                {profile?.withdrawal_freeze_reason
                  ? ` Reason: ${profile.withdrawal_freeze_reason}.`
                  : ""}{" "}
                Contact support.
              </p>
            </div>
          )}

          {pendingWDs.length > 0 && (
            <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <Clock size={14} className="text-blue-400 shrink-0" />
              <p className="text-blue-300 text-sm">
                <strong>
                  {pendingWDs.length} withdrawal
                  {pendingWDs.length > 1 ? "s" : ""}
                </strong>{" "}
                currently being processed.
              </p>
            </div>
          )}

          {/* Balance Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox
              label="Available Balance"
              value={`$${effectiveAvail.toFixed(2)}`}
              color="text-emerald-400"
              icon={DollarSign}
              sub="Ready to withdraw"
            />
            <StatBox
              label="Total GPU Invested"
              value={`$${totalInvested.toFixed(2)}`}
              color="text-violet-400"
              icon={Cpu}
              sub={`${activeNodes.length} active`}
            />
            <StatBox
              label="Confirmed Deposits"
              value={`$${totalDeposited.toFixed(2)}`}
              color="text-cyan-400"
              icon={CreditCard}
              sub={`${confirmedDeposits.length} confirmed`}
            />
            <StatBox
              label="Active Licenses"
              value={activeLicenses.length}
              color="text-amber-400"
              icon={Shield}
              sub={activeLicenses.length > 0 ? "Licensed" : "No license"}
            />
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-3 md:flex gap-1 bg-slate-900/60 border border-slate-800 rounded-xl p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${tab === id ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300"}`}
              >
                <Icon size={11} /> {label}
                {id === "withdrawals" && pendingWDs.length > 0 && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400">
                    {pendingWDs.length}
                  </span>
                )}
                {id === "deposits" && pendingDeposits.length > 0 && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-400">
                    {pendingDeposits.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                <p className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                  <BarChart3 size={14} className="text-emerald-400" /> Financial
                  Snapshot
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    {
                      label: "Available Balance",
                      value: `$${effectiveAvail.toFixed(2)}`,
                      color: "text-emerald-400",
                    },
                    {
                      label: "Total Earned",
                      value: `$${effectiveTotalEarned.toFixed(2)}`,
                      color: "text-cyan-400",
                    },
                    {
                      label: "Total Withdrawn",
                      value: `$${totalWd.toFixed(2)}`,
                      color: "text-blue-400",
                    },
                    {
                      label: "GPU Node Earnings",
                      value: `$${totalNodeEarned.toFixed(4)}`,
                      color: "text-emerald-400",
                    },
                    {
                      label: "Total GPU Invested",
                      value: `$${totalInvested.toFixed(2)}`,
                      color: "text-violet-400",
                    },
                    {
                      label: "Referral Earned",
                      value: `$${(profile?.referral_earnings ?? 0).toFixed(2)}`,
                      color: "text-amber-400",
                    },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-800/40 rounded-xl p-3">
                      <p className="text-slate-500 text-[10px] uppercase tracking-wide">
                        {label}
                      </p>
                      <p className={`font-black text-sm mt-0.5 ${color}`}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div
                className="rounded-2xl p-4 flex items-center justify-between gap-4"
                style={{
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.2)",
                }}
              >
                <div className="min-w-0">
                  <p className="text-white font-black text-base">
                    Ready to Withdraw?
                  </p>
                  <p className="text-slate-400 text-sm mt-0.5">
                    <span className="text-emerald-400 font-bold">
                      ${effectiveAvail.toFixed(2)}
                    </span>{" "}
                    available.{" "}
                    {!kycOk
                      ? "Complete KYC to enable withdrawals."
                      : !profile?.payout_registered
                        ? "Set up your payout account first."
                        : !profile?.pin_set
                          ? "Set a security PIN in Settings first."
                          : effectiveAvail < 10
                            ? "You need at least $10 to withdraw."
                            : !isBizDay
                              ? `Today is not a business day — requests will queue for ${nextBusinessDayLabel()}.`
                              : "Submit a request for instant processing."}
                  </p>
                </div>
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={!canWithdraw}
                  className="shrink-0 px-5 py-2.5 rounded-xl text-sm font-black text-white flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: "linear-gradient(135deg,#10b981,#059669)",
                  }}
                >
                  <ArrowUpRight size={14} /> Withdraw
                </button>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                <p className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                  <Shield size={14} className="text-blue-400" /> Payout Account
                </p>
                {profile?.payout_registered ? (
                  <div className="bg-slate-800/40 rounded-xl p-3 space-y-1">
                    <p className="text-white font-bold">
                      {profile.payout_account_name}
                    </p>
                    {profile.payout_bank_name && (
                      <p className="text-slate-400 text-sm">
                        {profile.payout_bank_name}
                      </p>
                    )}
                    <p className="text-slate-500 text-xs font-mono">
                      {profile.payout_account_number}
                    </p>
                    <p className="text-blue-400 text-xs capitalize">
                      via {profile.payout_gateway}
                    </p>
                    {kycOk ? (
                      <p className="text-emerald-400 text-xs flex items-center gap-1">
                        <CheckCircle size={10} /> KYC verified
                      </p>
                    ) : (
                      <p className="text-amber-400 text-xs flex items-center gap-1">
                        <AlertTriangle size={10} /> KYC verification pending
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-amber-900/10 border border-amber-800/30 rounded-xl p-3">
                    <p className="text-amber-400 text-sm font-bold">
                      No payout account registered
                    </p>
                    <button
                      onClick={() => router.push("/dashboard/verification")}
                      className="mt-2 text-xs text-amber-400 hover:underline"
                    >
                      Set up payout account →
                    </button>
                  </div>
                )}
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                <p className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                  <Activity size={14} className="text-blue-400" /> Account Info
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    {
                      label: "KYC Status",
                      value: kycOk
                        ? "Verified ✓"
                        : (profile?.kyc_status ?? "Pending"),
                      color: kycOk ? "text-emerald-400" : "text-amber-400",
                    },
                    {
                      label: "Account Role",
                      value: profile?.role ?? "contributor",
                      color: "text-white",
                    },
                    {
                      label: "Last Login",
                      value: profile?.last_login
                        ? new Date(profile.last_login).toLocaleDateString()
                        : "—",
                      color: "text-slate-400",
                    },
                    {
                      label: "Referral Earned",
                      value: `$${(profile?.referral_earnings ?? 0).toFixed(2)}`,
                      color: "text-violet-400",
                    },
                    {
                      label: "Withdrawals",
                      value: isFrozen ? "Frozen ❄️" : "Open ✓",
                      color: isFrozen ? "text-red-400" : "text-emerald-400",
                    },
                    {
                      label: "PIN Set",
                      value: profile?.pin_set
                        ? "Yes ✓"
                        : "No — set in settings",
                      color: profile?.pin_set
                        ? "text-emerald-400"
                        : "text-amber-400",
                    },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-800/40 rounded-xl p-3">
                      <p className="text-slate-500 text-[10px] uppercase tracking-wide">
                        {label}
                      </p>
                      <p className={`font-black text-sm mt-0.5 ${color}`}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── DEPOSITS TAB ── */}
          {tab === "deposits" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-white font-bold">
                  {depositEntries.length} total deposits
                </p>
                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-400 font-bold">
                    ${totalDeposited.toFixed(2)} confirmed
                  </span>
                  {totalPendingDeposits > 0 && (
                    <span className="text-amber-400 font-bold">
                      ${totalPendingDeposits.toFixed(2)} pending
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-[10px] uppercase">
                    Confirmed
                  </p>
                  <p className="text-emerald-400 font-black text-base">
                    {confirmedDeposits.length}
                  </p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-[10px] uppercase">
                    Pending
                  </p>
                  <p className="text-amber-400 font-black text-base">
                    {pendingDeposits.length}
                  </p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-[10px] uppercase">
                    Total Value
                  </p>
                  <p className="text-white font-black text-base">
                    ${totalDeposited.toFixed(0)}
                  </p>
                </div>
              </div>

              {depositEntries.length === 0 ? (
                <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl text-slate-500">
                  <CreditCard size={28} className="mx-auto mb-2 opacity-30" />
                  <p>No deposits yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {depositEntries.map((dep) => {
                    const isOpen = expanded === dep.id;
                    const isGpu =
                      dep.type === "gpu_mining" || dep.type === "gpu_contract";
                    return (
                      <div
                        key={dep.id}
                        className="border border-slate-800 rounded-xl overflow-hidden"
                      >
                        <button
                          onClick={() => setExpanded(isOpen ? null : dep.id)}
                          className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-800/20 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-800 border border-slate-700">
                            {isGpu ? (
                              <Pickaxe size={13} className="text-emerald-400" />
                            ) : (
                              <CreditCard
                                size={13}
                                className="text-slate-400"
                              />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-white text-sm font-semibold">
                                {dep.label}
                              </p>
                              <GatewayBadge gateway={dep.gateway} />
                              <StatusBadge status={dep.status} />
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {dep.miningPeriod &&
                                dep.type !== "payment" &&
                                dep.type !== "license" && (
                                  <span className="text-[10px] text-emerald-400/70">
                                    {PERIOD_LABELS[dep.miningPeriod] ??
                                      dep.miningPeriod}{" "}
                                    session
                                  </span>
                                )}
                              <span className="text-slate-500 text-[10px]">
                                {new Date(dep.created_at).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 mr-2">
                            <p className="text-white font-black text-base">
                              ${dep.amount.toFixed(2)}
                            </p>
                            <p className="text-slate-600 text-[10px]">USD</p>
                          </div>
                          {isOpen ? (
                            <ChevronUp
                              size={13}
                              className="text-slate-600 shrink-0"
                            />
                          ) : (
                            <ChevronDown
                              size={13}
                              className="text-slate-600 shrink-0"
                            />
                          )}
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-slate-800 bg-slate-900/20">
                            <div className="bg-slate-800/40 rounded-xl p-3 space-y-1.5 text-xs mt-3">
                              {(
                                [
                                  ["Type", dep.type.replace(/_/g, " ")],
                                  ["Amount", `$${dep.amount.toFixed(2)} USD`],
                                  ["Status", dep.status],
                                  ["Gateway", dep.gateway],
                                  ...(dep.planName
                                    ? [["Plan", dep.planName]]
                                    : []),
                                  ...(dep.gpuModel
                                    ? [["GPU", dep.gpuModel]]
                                    : []),
                                  ...(dep.miningPeriod
                                    ? [
                                        [
                                          "Session Duration",
                                          PERIOD_LABELS[dep.miningPeriod] ??
                                            dep.miningPeriod,
                                        ],
                                      ]
                                    : []),
                                  ...(dep.reference
                                    ? [
                                        [
                                          "Reference ID",
                                          dep.reference.slice(0, 20) + "...",
                                        ],
                                      ]
                                    : []),
                                  [
                                    "Date",
                                    new Date(dep.created_at).toLocaleString(),
                                  ],
                                ] as [string, string][]
                              ).map(([l, v]) => (
                                <div
                                  key={l}
                                  className="flex justify-between gap-4"
                                >
                                  <span className="text-slate-500 shrink-0">
                                    {l}
                                  </span>
                                  <span className="text-slate-300 text-right break-all">
                                    {v}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── MINING PORTFOLIO TAB ── */}
          {tab === "investments" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-white font-bold">
                  {nodeAllocations.length} mining sessions
                </p>
                <p className="text-emerald-400 text-xs font-bold">
                  ${totalInvested.toFixed(2)} total committed
                </p>
              </div>
              {nodeAllocations.length === 0 ? (
                <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl text-slate-500">
                  <Cpu size={28} className="mx-auto mb-2 opacity-30" />
                  <p>No GPU mining sessions yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {nodeAllocations.map((node) => {
                    const plan = gpuPlans[node.plan_id];
                    const planName =
                      plan?.name ?? node.plan_id.slice(0, 8) + "...";
                    const gpuModel = plan?.gpu_model ?? "";
                    const isComplete =
                      node.mining_completed || node.status === "matured";
                    const endsAt = node.mining_ends_at
                      ? new Date(node.mining_ends_at)
                      : null;
                    const maturesAt = node.maturity_date
                      ? new Date(node.maturity_date)
                      : null;
                    const period = node.mining_period ?? "daily";
                    const isContract = node.payment_model === "contract";
                    const isOpen = expanded === `node-${node.id}`;

                    return (
                      <div
                        key={node.id}
                        className="border border-slate-800 rounded-2xl overflow-hidden"
                      >
                        <button
                          onClick={() =>
                            setExpanded(isOpen ? null : `node-${node.id}`)
                          }
                          className="w-full p-4 text-left hover:bg-slate-800/10 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                                {isContract ? (
                                  <Cpu size={14} className="text-violet-400" />
                                ) : (
                                  <Pickaxe
                                    size={14}
                                    className="text-emerald-400"
                                  />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-white font-black text-sm">
                                    {planName}
                                  </p>
                                  <StatusBadge
                                    status={
                                      isComplete ? "matured" : node.status
                                    }
                                  />
                                  {!isComplete && (
                                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{" "}
                                      LIVE
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-500 text-[10px] mt-0.5">
                                  {gpuModel} ·{" "}
                                  {isContract
                                    ? "Contract"
                                    : (PERIOD_LABELS[period] ?? period)}{" "}
                                  session ·{" "}
                                  {new Date(
                                    node.created_at,
                                  ).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-white font-black">
                                ${node.amount_invested.toFixed(2)}
                              </p>
                              <p className="text-emerald-400 text-xs">
                                +${(node.total_earned ?? 0).toFixed(4)}
                              </p>
                            </div>
                            {isOpen ? (
                              <ChevronUp
                                size={13}
                                className="text-slate-600 shrink-0"
                              />
                            ) : (
                              <ChevronDown
                                size={13}
                                className="text-slate-600 shrink-0"
                              />
                            )}
                          </div>
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-slate-800 bg-slate-900/20">
                            <div className="bg-slate-800/40 rounded-xl p-3 space-y-1.5 text-xs mt-3">
                              {(
                                [
                                  ["Plan", planName],
                                  ["GPU", gpuModel || "—"],
                                  [
                                    "Capital Staked",
                                    `$${node.amount_invested.toFixed(2)}`,
                                  ],
                                  [
                                    "Coins Mined",
                                    `$${(node.total_earned ?? 0).toFixed(6)}`,
                                  ],
                                  [
                                    "Payment Model",
                                    isContract
                                      ? `Contract — ${node.contract_label ?? ""}`
                                      : "Pay-As-You-Go",
                                  ],
                                  [
                                    "Session Duration",
                                    PERIOD_LABELS[period] ?? period,
                                  ],
                                  [
                                    "Status",
                                    isComplete ? "Complete ✓" : "Active ⛏️",
                                  ],
                                  ...(endsAt && !isContract
                                    ? [["Ends At", endsAt.toLocaleString()]]
                                    : []),
                                  ...(maturesAt && isContract
                                    ? [["Matures", maturesAt.toLocaleString()]]
                                    : []),
                                  [
                                    "Started",
                                    new Date(node.created_at).toLocaleString(),
                                  ],
                                  ...(node.final_profit != null
                                    ? [
                                        [
                                          "Final Profit",
                                          `$${node.final_profit.toFixed(6)}`,
                                        ],
                                      ]
                                    : []),
                                ] as [string, string][]
                              ).map(([l, v]) => (
                                <div
                                  key={l}
                                  className="flex justify-between gap-4"
                                >
                                  <span className="text-slate-500 shrink-0">
                                    {l}
                                  </span>
                                  <span className="text-slate-300 text-right">
                                    {v}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── WITHDRAWALS TAB ── */}
          {tab === "withdrawals" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-[10px] uppercase">
                    Total Withdrawn
                  </p>
                  <p className="text-white font-black text-base">
                    ${totalWd.toFixed(2)}
                  </p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-[10px] uppercase">
                    Pending
                  </p>
                  <p className="text-blue-400 font-black text-base">
                    {pendingWDs.length}
                  </p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-[10px] uppercase">Status</p>
                  <p
                    className={`font-black text-base ${isFrozen ? "text-red-400" : "text-emerald-400"}`}
                  >
                    {isFrozen ? "Frozen" : "Open"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowWithdrawModal(true)}
                disabled={!canWithdraw}
                className="w-full py-4 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg,#10b981,#059669)",
                }}
              >
                <ArrowUpRight size={15} />
                {isFrozen
                  ? "Withdrawals Frozen — Contact Support"
                  : !kycOk
                    ? "Complete KYC Verification First"
                    : !profile?.payout_registered
                      ? "Setup Payout Account First"
                      : !profile?.pin_set
                        ? "Set Security PIN in Settings First"
                        : effectiveAvail < 10
                          ? `Need $10 minimum (have $${effectiveAvail.toFixed(2)})`
                          : !isBizDay
                            ? `Queue Withdrawal — $${effectiveAvail.toFixed(2)} (processes ${nextBusinessDayLabel()})`
                            : `Request Withdrawal — $${effectiveAvail.toFixed(2)} Available`}
              </button>

              {withdrawals.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-800 rounded-2xl text-slate-500">
                  <ArrowUpRight size={28} className="mx-auto mb-2 opacity-30" />
                  <p>No withdrawal history yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {withdrawals.map((w) => (
                    <div
                      key={w.id}
                      className="bg-slate-900/60 border border-slate-800 rounded-xl p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <StatusBadge
                              status={w.tracking_status ?? w.status}
                            />
                            {w.auto_processed && (
                              <span className="text-[10px] text-emerald-400/70 flex items-center gap-0.5">
                                <CheckCircle size={9} /> Auto-processed
                              </span>
                            )}
                            {w.expected_date && w.status !== "paid" && (
                              <span className="text-[10px] text-slate-500">
                                Expected:{" "}
                                {new Date(w.expected_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-400 text-xs">
                            {w.payout_account_name ?? w.wallet_address}
                          </p>
                          {w.reference && (
                            <p className="text-slate-600 text-[10px] font-mono mt-0.5">
                              Ref: {w.reference}
                            </p>
                          )}
                          <p className="text-slate-600 text-[10px] mt-0.5">
                            {new Date(w.created_at).toLocaleString()}
                          </p>
                          {w.paid_at && (
                            <p className="text-emerald-500 text-[10px] mt-0.5">
                              ✅ Paid: {new Date(w.paid_at).toLocaleString()}
                            </p>
                          )}
                          {w.failure_reason && (
                            <p className="text-red-400 text-[10px] mt-1">
                              ❌ {w.failure_reason}
                            </p>
                          )}
                        </div>
                        <p className="text-white font-black text-xl shrink-0">
                          ${w.amount.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── LEDGER TAB ── */}
          {tab === "ledger" && (
            <div className="space-y-4">
              <p className="text-white font-bold">
                {ledgerTxs.length} ledger entries
              </p>
              {ledgerTxs.length === 0 ? (
                <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl text-slate-500">
                  <Receipt size={28} className="mx-auto mb-2 opacity-30" />
                  <p>No ledger transactions yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {ledgerTxs.map((tx) => {
                    const isDebit = tx.amount < 0;
                    return (
                      <div
                        key={tx.id}
                        className="border border-slate-800 rounded-xl p-4 flex items-center gap-3"
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isDebit ? "bg-red-900/20 border border-red-900/30" : "bg-emerald-900/20 border border-emerald-900/30"}`}
                        >
                          {isDebit ? (
                            <TrendingDown size={12} className="text-red-400" />
                          ) : (
                            <TrendingUp
                              size={12}
                              className="text-emerald-400"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">
                            {tx.description ?? tx.type}
                          </p>
                          <p className="text-slate-500 text-[10px] mt-0.5">
                            {tx.type?.replace(/_/g, " ")} ·{" "}
                            {new Date(tx.created_at).toLocaleString()}
                          </p>
                        </div>
                        <p
                          className={`font-black text-base ${isDebit ? "text-red-400" : "text-emerald-400"}`}
                        >
                          {isDebit ? "−" : "+"}${Math.abs(tx.amount).toFixed(4)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── LICENSES TAB ── */}
          {tab === "licenses" && (
            <div className="space-y-4">
              {licenses.length === 0 ? (
                <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl text-slate-500">
                  <Shield size={28} className="mx-auto mb-2 opacity-30" />
                  <p>No licenses purchased yet</p>
                </div>
              ) : (
                licenses.map((lic) => {
                  const expired =
                    lic.expires_at && new Date(lic.expires_at) < new Date();
                  return (
                    <div
                      key={lic.id}
                      className={`rounded-2xl border p-5 ${lic.status === "active" && !expired ? "bg-emerald-900/10 border-emerald-800/40" : "bg-slate-900/60 border-slate-800"}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-black">
                            {LICENSE_LABELS[lic.license_type] ??
                              lic.license_type}
                          </p>
                          <p className="text-slate-400 text-xs">
                            Purchased:{" "}
                            {lic.purchased_at
                              ? new Date(lic.purchased_at).toLocaleDateString()
                              : "—"}
                          </p>
                          {lic.expires_at && (
                            <p className="text-slate-500 text-xs">
                              Expires:{" "}
                              {new Date(lic.expires_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <StatusBadge
                          status={expired ? "expired" : lic.status}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
