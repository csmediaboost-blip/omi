"use client";
// app/dashboard/financials/page.tsx — v7
// Changes from v6:
//  1. Removed "Minimum withdrawal" display from WithdrawModal and Overview policy grid.
//  2. Withdrawal window time confirmed as 08:00 – 16:00 WAT throughout.

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DashboardNavigation from "@/components/dashboard-navigation";
import {
  isKYCApproved,
  logWithdrawalEvent,
  type UserSecurityProfile,
} from "@/lib/withdrawal-security";
import {
  getWithdrawalWindow,
  calcWithdrawalFee,
  getUserWithdrawalPolicy,
  TIER_WITHDRAWAL_POLICIES,
  type WithdrawalWindow,
  type TierWithdrawalPolicy,
} from "@/lib/withdrawal-policy";
import { getHolidaysSync } from "@/lib/holiday-calendar";
import {
  getCapitalReturnTier,
  getCapitalReturnAmount,
} from "@/lib/lock-policy";
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
  Send,
  X,
  Pickaxe,
  Cpu,
  BadgeDollarSign,
  Calendar,
  Percent,
  Gift,
  Info,
  Star,
} from "lucide-react";

// ─── PRESET WITHDRAWAL AMOUNTS ────────────────────────────────────────────────
const PRESET_AMOUNTS = [
  1, 5, 10, 20, 40, 70, 270, 500, 800, 1500, 4000, 7000, 10000,
];

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
  license_paid: boolean | null;
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
  tier_index: number | null;
  lock_unlock_at: string | null;
  is_first_deposit: boolean | null;
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
  amount_gross?: number;
  amount_fee?: number;
  amount_net?: number;
  fee_pct?: number;
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
  flagged?: boolean;
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

type PolicySnapshot = {
  window: {
    state: string;
    isOpen: boolean;
    nextWindowLabel: string;
    todayHoliday: { name: string } | null;
  };
  balance: number;
  policy: {
    tierName: string;
    tier: number;
    weeklyMaxUSD: number;
    weeklyWithdrawnUSD: number;
    weeklyRemainingUSD: number;
    quickAmounts: number[];
    minWithdrawal: number;
  };
  feeSchedule: Array<{ maxAmount: number | null; pct: number }>;
  eligibility: {
    kycVerified: boolean;
    payoutRegistered: boolean;
    pinSet: boolean;
    frozen: boolean;
    adminPaused: boolean;
  };
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
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

const PERIOD_LABELS: Record<string, string> = {
  hourly: "1 Hour",
  daily: "1 Day",
  weekly: "1 Week",
  monthly: "1 Month",
  contract: "Contract",
};
const LICENSE_LABELS: Record<string, string> = {
  thermal_optimization: "Thermal & Neural Operator",
  rlhf_validation: "RLHF Validation Operator",
  gpu_allocation: "GPU Allocation Operator",
  operator_license: "Certified AI Operator",
  all: "Full Operator License",
};

// ─── FIRST DEPOSIT BONUS CARD ─────────────────────────────────────────────────
function FirstDepositBonusCard({
  allocations,
  gpuPlans,
}: {
  allocations: NodeAllocation[];
  gpuPlans: Record<string, { name: string; gpu_model: string }>;
}) {
  const [open, setOpen] = useState(false);

  const firstDeposit = allocations.find((a) => a.is_first_deposit === true);
  if (!firstDeposit) return null;

  const tier = getCapitalReturnTier(firstDeposit.amount_invested);
  const bonusAmount = getCapitalReturnAmount(firstDeposit.amount_invested);
  const bonusPct = Math.round(tier.returnPct * 100);
  const planName =
    gpuPlans[firstDeposit.plan_id]?.name ?? "Mining Node";
  const period = firstDeposit.mining_period ?? "daily";
  const periodLabel = PERIOD_LABELS[period] ?? period;
  const isComplete =
    firstDeposit.mining_completed || firstDeposit.status === "matured";

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(16,185,129,0.06)",
        border: "1px solid rgba(16,185,129,0.25)",
      }}
    >
      {/* Header row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3"
        style={{ background: "rgba(16,185,129,0.08)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
            <Gift size={14} className="text-emerald-400" />
          </div>
          <div className="text-left">
            <p className="text-emerald-300 font-black text-sm flex items-center gap-1.5">
              <Star size={11} className="text-amber-400" /> First-Deposit Bonus
            </p>
            <p className="text-slate-500 text-[10px]">
              {bonusPct}% bonus · ${bonusAmount.toFixed(2)} extra on your first mine
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
              isComplete
                ? "bg-emerald-900/30 border-emerald-700/40 text-emerald-400"
                : "bg-amber-900/30 border-amber-700/40 text-amber-400"
            }`}
          >
            {isComplete ? "Credited ✓" : "Mining"}
          </span>
          {open ? (
            <ChevronUp size={13} className="text-slate-500" />
          ) : (
            <ChevronDown size={13} className="text-slate-500" />
          )}
        </div>
      </button>

      {/* Expanded breakdown */}
      {open && (
        <div className="px-4 pb-4 pt-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              {
                label: "You Staked",
                value: `$${firstDeposit.amount_invested.toFixed(2)}`,
                color: "text-white",
              },
              {
                label: "Bonus %",
                value: `+${bonusPct}%`,
                color: "text-emerald-400",
              },
              {
                label: "Bonus Amount",
                value: `+$${bonusAmount.toFixed(2)}`,
                color: "text-emerald-400",
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="rounded-xl p-3 text-center"
                style={{
                  background: "rgba(15,23,42,0.7)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">
                  {label}
                </p>
                <p className={`font-black text-sm ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <div
            className="rounded-xl p-3 space-y-2"
            style={{
              background: "rgba(15,23,42,0.6)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            {(
              [
                ["Node", planName],
                ["Mining Period", periodLabel],
                [
                  "Status",
                  isComplete ? "Completed — bonus credited to balance" : "Active — bonus paid at session end",
                ],
                [
                  "How it works",
                  `Your very first mining session earns an extra ${bonusPct}% on top of the standard ROI. This bonus ($${bonusAmount.toFixed(2)}) is added to your available balance when the session completes.`,
                ],
              ] as [string, string][]
            ).map(([l, v]) => (
              <div key={l} className="flex gap-3 text-xs">
                <span className="text-slate-500 shrink-0 w-24">{l}</span>
                <span className="text-slate-300 leading-relaxed">{v}</span>
              </div>
            ))}
          </div>

          <div
            className="rounded-xl px-3 py-2 flex items-start gap-2"
            style={{
              background: "rgba(59,130,246,0.06)",
              border: "1px solid rgba(59,130,246,0.2)",
            }}
          >
            <Info size={11} className="text-blue-400 shrink-0 mt-0.5" />
            <p className="text-blue-300 text-[11px] leading-relaxed">
              This bonus applies to your <strong>first mining session only</strong>.
              All subsequent deposits and re-mines earn the standard node ROI —
              no extra % is applied.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FEE CHIP ─────────────────────────────────────────────────────────────────
function FeeChip({ amount }: { amount: number }) {
  if (!amount || amount <= 0) return null;
  const fee = calcWithdrawalFee(amount);
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <Percent size={10} className="text-amber-400" />
      <span className="text-amber-400 font-bold">{fee.feePercent}% fee</span>
      <span className="text-slate-500">= ${fee.feeAmount.toFixed(2)} ·</span>
      <span className="text-emerald-400 font-bold">
        you receive ${fee.netAmount.toFixed(2)}
      </span>
    </div>
  );
}

// ─── STAT BOX ─────────────────────────────────────────────────────────────────
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
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
    under_review: "bg-orange-900/30 border-orange-700/40 text-orange-400",
    matured: "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
  };
  return (
    <span
      className={`text-[10px] font-black px-2 py-0.5 rounded-full border capitalize ${map[status] ?? "bg-slate-800 border-slate-700 text-slate-400"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function GatewayBadge({ gateway }: { gateway: string }) {
  const g = (gateway || "").toLowerCase();
  if (["crypto_wallet", "crypto", "usdt", "btc"].includes(g))
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-900/30 border border-violet-700/40 text-violet-400">
        ₿ Crypto
      </span>
    );
  if (["bank_transfer", "korapay", "bank"].includes(g))
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

// ─── WITHDRAW MODAL ───────────────────────────────────────────────────────────
function WithdrawModal({
  userId,
  policy,
  snapshot,
  onClose,
  onSuccess,
}: {
  userId: string;
  policy: TierWithdrawalPolicy;
  snapshot: PolicySnapshot;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [selectedAmt, setSelectedAmt] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const todayKey = `wd_pick_${userId}_${new Date().toISOString().slice(0, 10)}`;
  const [alreadyPicked] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(todayKey);
    return stored ? parseFloat(stored) : null;
  });

  useEffect(() => {
    if (alreadyPicked !== null) setSelectedAmt(alreadyPicked);
  }, [alreadyPicked]);

  const available = Math.max(0, snapshot.balance);
  const fee = selectedAmt ? calcWithdrawalFee(selectedAmt, snapshot.feeSchedule as any) : null;
  const windowSnap = snapshot.window;
  const { eligibility: elig } = snapshot;

  function getSubmitError(): string | null {
    if (!selectedAmt) return "Please select an amount above.";

    if (!elig.kycVerified)
      return "KYC verification is required before you can withdraw. Go to Verification to complete it.";
    if (!elig.payoutRegistered)
      return "You haven't set up a payout account yet. Go to Verification → Payout Setup.";
    if (!elig.pinSet)
      return "You need to set a security PIN before withdrawing. Go to Settings → Security.";
    if (elig.frozen)
      return "Your withdrawals are currently frozen. Please contact support.";
    if (elig.adminPaused)
      return "Withdrawals are temporarily paused by the platform. Please check back soon.";

    if (!windowSnap.isOpen) {
      if (windowSnap.state === "CLOSED_HOLIDAY")
        return `Today is a public holiday (${windowSnap.todayHoliday?.name}). Banks are closed. Withdrawals process every Monday — next window: ${windowSnap.nextWindowLabel}.`;
      if (windowSnap.state === "CLOSED_OUTSIDE_HOURS") {
        const before = (windowSnap as any).currentWATHour < 8;
        return before
          ? "The withdrawal window opens at 08:00 WAT today (Monday). Please come back after 08:00 WAT."
          : `Today's withdrawal window closed at 16:00 WAT. Withdrawals process every Monday — next window: ${windowSnap.nextWindowLabel}.`;
      }
      if (windowSnap.state === "PAUSED_ADMIN")
        return `Withdrawals are temporarily paused by the platform. Next window: ${windowSnap.nextWindowLabel}.`;
      return `Withdrawals are processed every Monday, 08:00–16:00 WAT. Today is not a withdrawal day. Next window: ${windowSnap.nextWindowLabel}.`;
    }

    if (selectedAmt > available)
      return `Insufficient funds. Your available balance is $${available.toFixed(2)} but you selected $${selectedAmt}.`;
    const weeklyLeft = snapshot.policy.weeklyRemainingUSD;
    if (selectedAmt > weeklyLeft)
      return `This amount exceeds your weekly withdrawal limit. You have $${weeklyLeft.toFixed(2)} remaining this week.`;

    if (pin.length < 4)
      return "Please enter your security PIN (4–6 digits).";

    return null;
  }

  const canSubmit = selectedAmt !== null && pin.length >= 4 && !loading;

  function handleSelect(amt: number) {
    if (alreadyPicked !== null && alreadyPicked !== amt) return;
    setSelectedAmt(amt);
    setError("");
  }

  async function handleSubmit() {
    setError("");
    const submitError = getSubmitError();
    if (submitError) {
      setError(submitError);
      return;
    }

    setLoading(true);
    try {
      const {
        data: { session },
      } = (await supabase.auth.getSession()) as {
        data: { session: { access_token: string } | null };
      };
      const res = await fetch("/api/withdrawal-policy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ amount: selectedAmt, pin }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Withdrawal failed. Please try again.");
        logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
          reason: data.error,
          amount: selectedAmt,
        }).catch(() => {});
        setLoading(false);
        return;
      }
      if (typeof window !== "undefined") {
        localStorage.setItem(todayKey, String(selectedAmt));
      }
      onSuccess(
        data.message ??
          `Withdrawal of $${fee?.netAmount.toFixed(2) ?? selectedAmt!.toFixed(2)} submitted.`,
      );
    } catch {
      setError("Network error. Please check your connection and try again.");
    }
    setLoading(false);
  }

  function handleActionClick(action: string) {
    if (action === "kyc" || action === "payout")
      router.push("/dashboard/verification");
    if (action === "pin") router.push("/dashboard/settings");
  }

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
              <p className="text-white font-black text-sm">Request Withdrawal</p>
              <p className="text-slate-500 text-xs">
                {policy.tierName} · Weekly max ${policy.weeklyMaxUSD}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Static info banner */}
          <div
            className="rounded-xl px-4 py-3 flex items-start gap-3"
            style={{
              background: "rgba(15,23,42,0.6)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <Calendar size={15} className="text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-slate-300 text-sm font-bold">
                Withdrawals process every Monday
              </p>
              <p className="text-slate-500 text-xs mt-0.5">
                Banking hours: 08:00 – 16:00 WAT. Select an amount and submit —
                we'll let you know if there's any issue.
              </p>
            </div>
          </div>

          {/* Available balance — minimum line removed */}
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
              ${available.toFixed(2)}
            </p>
          </div>

          {/* All 13 presets */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-300 text-sm font-bold">
                Select Amount (USD)
              </p>
              {alreadyPicked !== null && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-900/30 border border-amber-700/40 text-amber-400 flex items-center gap-1">
                  <Lock size={9} /> One pick per day
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {PRESET_AMOUNTS.map((amt) => {
                const isSelected = selectedAmt === amt;
                const pickedLock = alreadyPicked !== null && alreadyPicked !== amt;

                return (
                  <button
                    key={amt}
                    onClick={() => handleSelect(amt)}
                    disabled={pickedLock}
                    title={pickedLock ? "You already picked an amount today" : undefined}
                    className={`py-3 rounded-xl font-black text-sm transition-all border ${
                      isSelected
                        ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-300"
                        : pickedLock
                          ? "bg-slate-900/20 border-slate-800/40 text-slate-700 cursor-not-allowed opacity-40"
                          : "bg-slate-900/60 border-slate-700 text-slate-300 hover:border-emerald-500/50 hover:text-emerald-400"
                    }`}
                  >
                    ${amt >= 1000 ? `${amt / 1000}k` : amt}
                  </button>
                );
              })}
            </div>

            {selectedAmt && (
              <div className="mt-3">
                <FeeChip amount={selectedAmt} />
              </div>
            )}
          </div>

          {/* Settlement timeline */}
          {selectedAmt && (
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
                { label: "Queued", desc: "Request received", done: true },
                { label: "Monday 08:00 WAT", desc: "Processing on the next Monday window", done: false },
                { label: "Bank Transfer", desc: "Via your registered payout account", done: false },
                { label: "Paid", desc: `$${fee?.netAmount.toFixed(2) ?? "—"} net to you`, done: false },
              ].map((s) => (
                <div key={s.label} className="flex items-start gap-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${s.done ? "bg-emerald-500 border-emerald-500" : "border-slate-700"}`}
                  >
                    {s.done && <CheckCircle size={9} className="text-white" />}
                  </div>
                  <div>
                    <p className={`text-xs font-bold ${s.done ? "text-emerald-400" : "text-slate-600"}`}>
                      {s.label}
                    </p>
                    <p className="text-slate-600 text-[10px]">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

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
          </div>

          {/* Inline error */}
          {error && (
            <div
              className="rounded-xl p-3"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
              }}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-red-400 text-sm">{error}</p>
                  {error.includes("KYC") && (
                    <button onClick={() => handleActionClick("kyc")} className="text-blue-400 text-xs underline mt-1">
                      Go to Verification →
                    </button>
                  )}
                  {error.includes("payout account") && (
                    <button onClick={() => handleActionClick("payout")} className="text-blue-400 text-xs underline mt-1">
                      Set up payout account →
                    </button>
                  )}
                  {error.includes("PIN") && (
                    <button onClick={() => handleActionClick("pin")} className="text-blue-400 text-xs underline mt-1">
                      Set PIN in Settings →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {alreadyPicked !== null && (
            <div
              className="rounded-xl p-3 flex items-center gap-2"
              style={{
                background: "rgba(245,158,11,0.06)",
                border: "1px solid rgba(245,158,11,0.2)",
              }}
            >
              <Lock size={12} className="text-amber-400 shrink-0" />
              <p className="text-amber-400 text-xs">
                You selected <strong>${alreadyPicked}</strong> today. You can submit a new withdrawal next Monday.
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
          >
            {loading ? (
              <><RefreshCw size={15} className="animate-spin" /> Submitting…</>
            ) : !selectedAmt ? (
              <><Calendar size={15} /> Select an amount above</>
            ) : pin.length < 4 ? (
              <><Lock size={15} /> Enter PIN to continue</>
            ) : (
              <><Send size={15} /> Withdraw ${selectedAmt} · Receive ${fee?.netAmount.toFixed(2) ?? "—"}</>
            )}
          </button>

          <p className="text-slate-600 text-[11px] text-center pb-1">
            {fee && selectedAmt
              ? `${fee.feePercent}% platform fee ($${fee.feeAmount.toFixed(2)}) goes to reserve.`
              : "Fees: under $10 = 5% · $10–$100 = 2% · above $100 = 1%"}
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
  const [policySnapshot, setPolicySnapshot] = useState<PolicySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    "overview" | "deposits" | "investments" | "licenses" | "ledger" | "withdrawals"
  >("overview");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const holidays = getHolidaysSync();

  const [liveWindow, setLiveWindow] = useState<WithdrawalWindow>(() =>
    getWithdrawalWindow(false, holidays),
  );
  useEffect(() => {
    const iv = setInterval(() => {
      setLiveWindow(
        getWithdrawalWindow(
          policySnapshot?.eligibility.adminPaused ?? false,
          holidays,
        ),
      );
    }, 60_000);
    return () => clearInterval(iv);
  }, [policySnapshot, holidays]);

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

    fetch("/api/mining/claim-session", { method: "POST" }).catch(() => {});

    const [
      profRes,
      payRes,
      nodeRes,
      licRes,
      ledgerRes,
      wRes,
      plansRes,
      policyRes,
    ] = await Promise.allSettled([
      supabase
        .from("users")
        .select(
          "id,email,full_name,role,status,balance_available,wallet_balance,balance,total_earned,total_withdrawn,referral_earnings,kyc_verified,kyc_status,payout_registered,payout_account_name,payout_bank_name,payout_account_number,payout_gateway,payout_currency,payout_kyc_match,withdrawals_frozen,withdrawal_freeze_until,withdrawal_freeze_reason,last_login,pin_set,license_paid,created_at",
        )
        .eq("id", user.id)
        .single(),
      supabase
        .from("payment_transactions")
        .select(
          "id,user_id,node_key,amount,currency,gateway,gateway_reference,status,metadata,created_at,confirmed_at,verified_by_admin",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("node_allocations")
        .select(
          "id,user_id,plan_id,amount_invested,currency,payment_model,contract_months,contract_label,contract_min_pct,contract_max_pct,maturity_date,lock_in_label,status,total_earned,total_withdrawn,mining_period,mining_ends_at,mining_completed,final_profit,created_at,tier_index,lock_unlock_at,is_first_deposit",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("operator_licenses")
        .select(
          "id,user_id,license_type,status,expires_at,purchased_at,payment_id",
        )
        .eq("user_id", user.id)
        .order("purchased_at", { ascending: false })
        .limit(20),
      supabase
        .from("transaction_ledger")
        .select(
          "id,type,amount,balance_after,description,reference_id,created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("withdrawals")
        .select(
          "id,user_id,amount,amount_gross,amount_fee,amount_net,fee_pct,wallet_address,payout_method,payout_account_name,payout_bank_name,status,tracking_status,expected_date,created_at,paid_at,failure_reason,auto_processed,reference,flagged",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("gpu_plans").select("id,name,gpu_model"),
      (async () => {
        const {
          data: { session },
        } = (await supabase.auth.getSession()) as {
          data: { session: { access_token: string } | null };
        };
        if (!session?.access_token) return { data: null };
        try {
          const res = await fetch("/api/withdrawal-policy", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          return res.ok ? { data: await res.json() } : { data: null };
        } catch {
          return { data: null };
        }
      })(),
    ]);

    if (profRes.status === "fulfilled" && profRes.value.data)
      setProfile(profRes.value.data as UserProfile);
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
    if (policyRes.status === "fulfilled" && (policyRes.value as any).data) {
      const snap = (policyRes.value as any).data as PolicySnapshot;
      setPolicySnapshot(snap);
      setLiveWindow(
        getWithdrawalWindow(snap?.eligibility?.adminPaused ?? false, holidays),
      );
    }
    setLoading(false);
  }, [router, holidays]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`financials_rt_${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "payment_transactions", filter: `user_id=eq.${userId}` },
        () => loadData(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "payment_transactions", filter: `user_id=eq.${userId}` },
        () => loadData(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "node_allocations", filter: `user_id=eq.${userId}` },
        () => loadData(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "node_allocations", filter: `user_id=eq.${userId}` },
        (payload: { new: Record<string, unknown> }) => {
          if (payload.new?.mining_completed === true) setTimeout(() => loadData(), 600);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${userId}` },
        (payload: { new: Record<string, unknown> }) => {
          const u = payload.new;
          if (u?.balance_available !== undefined) {
            setProfile((prev) =>
              prev
                ? {
                    ...prev,
                    balance_available: u.balance_available as number,
                    total_earned: (u.total_earned as number) ?? prev.total_earned,
                    total_withdrawn: (u.total_withdrawn as number) ?? prev.total_withdrawn,
                  }
                : prev,
            );
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "withdrawal_settings" },
        () => loadData(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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
    policySnapshot?.balance ??
    profile?.balance_available ??
    profile?.wallet_balance ??
    profile?.balance ??
    0;
  const totalEarned = profile?.total_earned ?? 0;
  const totalWd = profile?.total_withdrawn ?? 0;
  const isFrozen = profile?.withdrawals_frozen ?? false;
  const kycOk = resolveKycOk(profile);

  const ACTIVE_LICENSE_STATUSES = ["active", "confirmed", "paid", "completed"];
  const activeLicensesFromTable = licenses.filter(
    (l) =>
      ACTIVE_LICENSE_STATUSES.includes(l.status) &&
      (!l.expires_at || new Date(l.expires_at) > new Date()),
  );
  const licensePaidOnProfile = profile?.license_paid === true;
  const activeLicenses =
    activeLicensesFromTable.length > 0
      ? activeLicensesFromTable
      : licensePaidOnProfile
        ? [{ id: "profile-license", user_id: userId ?? "", license_type: "operator_license", status: "active", expires_at: null, purchased_at: null, payment_id: null }]
        : [];

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
    (w) => w.status === "queued" || w.status === "processing" || w.status === "flagged",
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

  const policy = policySnapshot
    ? (policySnapshot.policy as unknown as TierWithdrawalPolicy)
    : getUserWithdrawalPolicy(nodeAllocations.map((n) => n.tier_index ?? 0));

  const canWithdraw =
    !isFrozen &&
    !!profile?.payout_registered &&
    kycOk &&
    !!profile?.pin_set &&
    policySnapshot !== null;

  function getWithdrawBlockReason(): string | null {
    if (isFrozen) return "Your withdrawals are currently frozen. Contact support.";
    if (!profile?.payout_registered) return "Set up a payout account first (Verification → Payout Setup).";
    if (!kycOk) return "KYC verification is required before withdrawing.";
    if (!profile?.pin_set) return "Set a security PIN in Settings before withdrawing.";
    if (policySnapshot === null) return "Couldn't load withdrawal settings. Please refresh and try again.";
    return null;
  }

  function handleWithdrawClick() {
    const reason = getWithdrawBlockReason();
    if (reason) {
      showToast(reason, false);
      return;
    }
    setShowWithdrawModal(true);
  }

  // ─── DEPOSIT ENTRIES ─────────────────────────────────────────────────────
  const depositEntries: DepositEntry[] = [];
  for (const pt of paymentTxs) {
    const meta = (() => {
      try { return pt.metadata ? JSON.parse(pt.metadata) : {}; } catch { return {}; }
    })();
    const isGpu =
      pt.gateway === "gpu_mining" ||
      ["gpu_plan", "gpu_contract", "gpu_mining"].includes(meta.purchaseType);
    const isLic = meta.purchaseType === "license";
    const resolvedStatus: "confirmed" | "pending" | "failed" = [
      "confirmed", "confmrmed", "completed",
    ].includes(pt.status)
      ? "confirmed"
      : ["failed", "declined", "rejected"].includes(pt.status)
        ? "failed"
        : "pending";
    depositEntries.push({
      id: `pt-${pt.id}`,
      type: isLic
        ? "license"
        : isGpu
          ? meta.purchaseType === "gpu_contract" ? "gpu_contract" : "gpu_mining"
          : "payment",
      label: isLic
        ? `Operator License${meta.licenseType ? ` — ${LICENSE_LABELS[meta.licenseType] ?? meta.licenseType}` : ""}`
        : isGpu
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
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const confirmedDeposits = depositEntries.filter((d) => d.status === "confirmed");
  const pendingDeposits = depositEntries.filter((d) => d.status === "pending");
  const totalDeposited = confirmedDeposits.reduce((s, d) => s + d.amount, 0);
  const totalPendingDeposits = pendingDeposits.reduce((s, d) => s + d.amount, 0);

  const TABS = [
    { id: "overview" as const, label: "Overview", icon: BarChart3 },
    { id: "deposits" as const, label: "Deposits", icon: CreditCard },
    { id: "investments" as const, label: "Mining", icon: Server },
    { id: "licenses" as const, label: "Licenses", icon: Shield },
    { id: "ledger" as const, label: "Ledger", icon: Receipt },
    { id: "withdrawals" as const, label: "Withdrawals", icon: ArrowUpRight },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <DashboardNavigation />

      {showWithdrawModal && userId && profile && policySnapshot && (
        <WithdrawModal
          userId={userId}
          policy={policy}
          snapshot={policySnapshot}
          onClose={() => setShowWithdrawModal(false)}
          onSuccess={(message) => {
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
              <p className="text-slate-500 text-xs mt-1">
                Withdrawals process every Monday · 08:00 – 16:00 WAT
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={loadData}
                className="flex items-center gap-1.5 text-slate-400 hover:text-white text-xs px-3 py-1.5 border border-slate-800 rounded-lg transition-all"
              >
                <RefreshCw size={12} /> Refresh
              </button>
              <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={!canWithdraw}
                  className="shrink-0 px-5 py-2.5 rounded-xl text-sm font-black text-white flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                >
                  <ArrowUpRight size={14} /> Withdraw
                </button>
            </div>
          </div>

          {/* First Deposit Bonus */}
          <FirstDepositBonusCard
            allocations={nodeAllocations}
            gpuPlans={gpuPlans}
          />

          {/* Alerts */}
          {!kycOk && (
            <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={14} className="text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">
                KYC verification required before withdrawals.{" "}
                <button onClick={() => router.push("/dashboard/verification")} className="underline font-bold">
                  Complete →
                </button>
              </p>
            </div>
          )}
          {profile && !profile.pin_set && kycOk && (
            <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <Lock size={14} className="text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">
                Security PIN not set — required for withdrawals.{" "}
                <button onClick={() => router.push("/dashboard/settings")} className="underline">
                  Set in Settings →
                </button>
              </p>
            </div>
          )}
          {unclaimedMatured.length > 0 && (
            <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Pickaxe size={14} className="text-emerald-400 shrink-0" />
                <p className="text-emerald-300 text-sm">
                  <strong>{unclaimedMatured.length} session{unclaimedMatured.length > 1 ? "s" : ""} completed</strong>{" "}
                  — ${unclaimedTotal.toFixed(2)} ready.
                </p>
              </div>
              <button
                onClick={async () => {
                  try { await fetch("/api/mining/claim-session", { method: "POST" }); } catch {}
                  await loadData();
                  showToast("✅ Earnings credited to your balance!");
                }}
                className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-black text-slate-950"
                style={{ background: "#10b981" }}
              >
                Claim Now
              </button>
            </div>
          )}
          {isFrozen && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <Lock size={14} className="text-red-400 shrink-0" />
              <p className="text-red-300 text-sm">
                Withdrawals are frozen.
                {profile?.withdrawal_freeze_reason ? ` Reason: ${profile.withdrawal_freeze_reason}.` : ""}{" "}
                Contact support.
              </p>
            </div>
          )}
          {pendingWDs.length > 0 && (
            <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <Clock size={14} className="text-blue-400 shrink-0" />
              <p className="text-blue-300 text-sm">
                <strong>{pendingWDs.length} withdrawal{pendingWDs.length > 1 ? "s" : ""}</strong> currently being processed.
              </p>
            </div>
          )}

          {/* Stat cards */}
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
              sub={activeLicenses.length > 0 ? "Licensed ✓" : "No license"}
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
                  <BarChart3 size={14} className="text-emerald-400" /> Financial Snapshot
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: "Available Balance", value: `$${effectiveAvail.toFixed(2)}`, color: "text-emerald-400" },
                    { label: "Total Earned", value: `$${effectiveTotalEarned.toFixed(2)}`, color: "text-cyan-400" },
                    { label: "Total Withdrawn", value: `$${totalWd.toFixed(2)}`, color: "text-blue-400" },
                    { label: "GPU Node Earnings", value: `$${totalNodeEarned.toFixed(4)}`, color: "text-emerald-400" },
                    { label: "Total GPU Invested", value: `$${totalInvested.toFixed(2)}`, color: "text-violet-400" },
                    { label: "Referral Earned", value: `$${(profile?.referral_earnings ?? 0).toFixed(2)}`, color: "text-amber-400" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-800/40 rounded-xl p-3">
                      <p className="text-slate-500 text-[10px] uppercase tracking-wide">{label}</p>
                      <p className={`font-black text-sm mt-0.5 ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Withdrawal policy — Min Withdrawal row removed */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                <p className="text-white font-bold text-sm flex items-center gap-2">
                  <BadgeDollarSign size={14} className="text-emerald-400" /> Withdrawal Policy
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { label: "Your Tier", value: policy.tierName, color: "text-white" },
                    { label: "Weekly Max", value: `$${policy.weeklyMaxUSD}`, color: "text-emerald-400" },
                    { label: "Weekly Remaining", value: `$${(policySnapshot?.policy.weeklyRemainingUSD ?? 0).toFixed(2)}`, color: "text-blue-400" },
                    { label: "Window", value: "Monday 08:00 – 16:00 WAT", color: "text-amber-400" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-800/40 rounded-xl p-3">
                      <p className="text-slate-500 text-[10px] uppercase tracking-wide">{label}</p>
                      <p className={`font-black text-sm mt-0.5 ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <div
                  className="rounded-xl p-3 space-y-1.5"
                  style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}
                >
                  <p className="text-blue-300 text-[11px] font-black uppercase tracking-wide flex items-center gap-1.5">
                    <Percent size={10} /> Fee Schedule
                  </p>
                  {[
                    { range: "Below $10", fee: "5% fee" },
                    { range: "$10 – $100", fee: "2% fee" },
                    { range: "Above $100", fee: "1% fee" },
                  ].map(({ range, fee }) => (
                    <div key={range} className="flex justify-between text-xs">
                      <span className="text-slate-400">{range}</span>
                      <span className="text-blue-300 font-bold">{fee} → treasury reserve</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Withdraw CTA */}
              <div
                className="rounded-2xl p-4 flex items-center justify-between gap-4"
                style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }}
              >
                <div className="min-w-0">
                  <p className="text-white font-black text-base">Ready to Withdraw?</p>
                  <p className="text-slate-400 text-sm mt-0.5">
                    <span className="text-emerald-400 font-bold">${effectiveAvail.toFixed(2)}</span> available.{" "}
                    Processed every Monday 08:00 – 16:00 WAT.
                  </p>
                </div>
                <button
                  onClick={handleWithdrawClick}
                  className="shrink-0 px-5 py-2.5 rounded-xl text-sm font-black text-white flex items-center gap-2 transition-all"
                  style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                >
                  <ArrowUpRight size={14} /> Withdraw
                </button>
              </div>
            </div>
          )}

          {/* ── DEPOSITS TAB ── */}
          {tab === "deposits" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-white font-bold">{depositEntries.length} total deposits</p>
                <div className="flex gap-3 text-xs">
                  <span className="text-emerald-400 font-bold">${totalDeposited.toFixed(2)} confirmed</span>
                  {totalPendingDeposits > 0 && (
                    <span className="text-amber-400 font-bold">${totalPendingDeposits.toFixed(2)} pending</span>
                  )}
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
                    const isOpen2 = expanded === dep.id;
                    const isGpu = dep.type === "gpu_mining" || dep.type === "gpu_contract";
                    return (
                      <div key={dep.id} className="border border-slate-800 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setExpanded(isOpen2 ? null : dep.id)}
                          className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-800/20 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-800 border border-slate-700">
                            {isGpu ? <Pickaxe size={13} className="text-emerald-400" /> : <CreditCard size={13} className="text-slate-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-white text-sm font-semibold">{dep.label}</p>
                              <GatewayBadge gateway={dep.gateway} />
                              <StatusBadge status={dep.status} />
                            </div>
                            <p className="text-slate-500 text-[10px] mt-0.5">{new Date(dep.created_at).toLocaleString()}</p>
                          </div>
                          <div className="text-right shrink-0 mr-2">
                            <p className="text-white font-black text-base">${dep.amount.toFixed(2)}</p>
                          </div>
                          {isOpen2 ? <ChevronUp size={13} className="text-slate-600 shrink-0" /> : <ChevronDown size={13} className="text-slate-600 shrink-0" />}
                        </button>
                        {isOpen2 && (
                          <div className="px-4 pb-4 border-t border-slate-800 bg-slate-900/20">
                            <div className="bg-slate-800/40 rounded-xl p-3 space-y-1.5 text-xs mt-3">
                              {([
                                ["Type", dep.type.replace(/_/g, " ")],
                                ["Amount", `$${dep.amount.toFixed(2)} USD`],
                                ["Status", dep.status],
                                ["Gateway", dep.gateway],
                                ...(dep.planName ? [["Plan", dep.planName]] : []),
                                ...(dep.miningPeriod && dep.type !== "payment" && dep.type !== "license"
                                  ? [["Session", PERIOD_LABELS[dep.miningPeriod] ?? dep.miningPeriod]]
                                  : []),
                                ["Date", new Date(dep.created_at).toLocaleString()],
                              ] as [string, string][]).map(([l, v]) => (
                                <div key={l} className="flex justify-between gap-4">
                                  <span className="text-slate-500 shrink-0">{l}</span>
                                  <span className="text-slate-300 text-right break-all">{v}</span>
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

          {/* ── MINING PORTFOLIO ── */}
          {tab === "investments" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-white font-bold">{nodeAllocations.length} mining sessions</p>
                <p className="text-emerald-400 text-xs font-bold">${totalInvested.toFixed(2)} committed</p>
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
                    const planName = plan?.name ?? node.plan_id.slice(0, 8) + "...";
                    const isComplete = node.mining_completed || node.status === "matured";
                    const endsAt = node.mining_ends_at ? new Date(node.mining_ends_at) : null;
                    const isOpen2 = expanded === `node-${node.id}`;
                    const isFirstDep = node.is_first_deposit === true;
                    const bonusPct = isFirstDep
                      ? Math.round(getCapitalReturnTier(node.amount_invested).returnPct * 100)
                      : 0;
                    return (
                      <div key={node.id} className="border border-slate-800 rounded-2xl overflow-hidden">
                        <button
                          onClick={() => setExpanded(isOpen2 ? null : `node-${node.id}`)}
                          className="w-full p-4 text-left hover:bg-slate-800/10 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                                <Pickaxe size={14} className="text-emerald-400" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-white font-black text-sm">{planName}</p>
                                  <StatusBadge status={isComplete ? "matured" : node.status} />
                                  {isFirstDep && (
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-amber-900/30 border-amber-700/40 text-amber-400 flex items-center gap-1">
                                      <Gift size={9} /> +{bonusPct}% bonus
                                    </span>
                                  )}
                                  {!isComplete && (
                                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-500 text-[10px] mt-0.5">
                                  {plan?.gpu_model ?? ""} · {new Date(node.created_at).toLocaleDateString()}
                                  {isFirstDep && " · First deposit"}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-white font-black">${node.amount_invested.toFixed(2)}</p>
                              <p className="text-emerald-400 text-xs">+${(node.total_earned ?? 0).toFixed(4)}</p>
                            </div>
                            {isOpen2 ? <ChevronUp size={13} className="text-slate-600 shrink-0" /> : <ChevronDown size={13} className="text-slate-600 shrink-0" />}
                          </div>
                        </button>
                        {isOpen2 && (
                          <div className="px-4 pb-4 border-t border-slate-800 bg-slate-900/20">
                            <div className="bg-slate-800/40 rounded-xl p-3 space-y-1.5 text-xs mt-3">
                              {([
                                ["Plan", planName],
                                ["GPU", plan?.gpu_model ?? "—"],
                                ["Capital Staked", `$${node.amount_invested.toFixed(2)}`],
                                ["Coins Mined", `$${(node.total_earned ?? 0).toFixed(6)}`],
                                ["First Deposit", isFirstDep ? `Yes — +${bonusPct}% bonus applied` : "No — standard ROI"],
                                ["Status", isComplete ? "Complete ✓" : "Active ⛏️"],
                                ...(endsAt && !isComplete ? [["Ends At", endsAt.toLocaleString()]] : []),
                                ["Started", new Date(node.created_at).toLocaleString()],
                              ] as [string, string][]).map(([l, v]) => (
                                <div key={l} className="flex justify-between gap-4">
                                  <span className="text-slate-500 shrink-0">{l}</span>
                                  <span className="text-slate-300 text-right">{v}</span>
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
                {[
                  { label: "Total Withdrawn", value: `$${totalWd.toFixed(2)}`, color: "text-white" },
                  { label: "Pending", value: String(pendingWDs.length), color: "text-blue-400" },
                  { label: "Status", value: isFrozen ? "Frozen" : "Open", color: isFrozen ? "text-red-400" : "text-emerald-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                    <p className="text-slate-500 text-[10px] uppercase">{label}</p>
                    <p className={`font-black text-base ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={handleWithdrawClick}
                className="w-full py-4 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 transition-all"
                style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
              >
                <ArrowUpRight size={15} />
                Request Withdrawal — ${effectiveAvail.toFixed(2)} Available
              </button>
              {withdrawals.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-800 rounded-2xl text-slate-500">
                  <ArrowUpRight size={28} className="mx-auto mb-2 opacity-30" />
                  <p>No withdrawal history yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {withdrawals.map((w) => (
                    <div key={w.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <StatusBadge status={w.tracking_status ?? w.status} />
                            {w.flagged && (
                              <span className="text-[10px] font-bold text-orange-400 flex items-center gap-0.5">
                                ⚠ Under Review
                              </span>
                            )}
                            {w.expected_date && w.status !== "paid" && (
                              <span className="text-[10px] text-slate-500">
                                Est: {new Date(w.expected_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-400 text-xs">{w.payout_account_name ?? w.wallet_address}</p>
                          {w.amount_gross && w.amount_fee != null && (
                            <p className="text-slate-600 text-[10px] mt-0.5">
                              ${w.amount_gross.toFixed(2)} gross · ${w.amount_fee.toFixed(2)} fee ({w.fee_pct}%) ·{" "}
                              <span className="text-emerald-500">${w.amount_net?.toFixed(2)} net</span>
                            </p>
                          )}
                          <p className="text-slate-600 text-[10px] mt-0.5">{new Date(w.created_at).toLocaleString()}</p>
                          {w.paid_at && (
                            <p className="text-emerald-500 text-[10px] mt-0.5">✅ Paid: {new Date(w.paid_at).toLocaleString()}</p>
                          )}
                          {w.failure_reason && (
                            <p className="text-red-400 text-[10px] mt-1">❌ {w.failure_reason}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-white font-black text-xl">${w.amount.toFixed(2)}</p>
                          <p className="text-slate-600 text-[10px]">net received</p>
                        </div>
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
              <p className="text-white font-bold">{ledgerTxs.length} ledger entries</p>
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
                      <div key={tx.id} className="border border-slate-800 rounded-xl p-4 flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isDebit ? "bg-red-900/20 border border-red-900/30" : "bg-emerald-900/20 border border-emerald-900/30"}`}>
                          {isDebit ? <TrendingDown size={12} className="text-red-400" /> : <TrendingUp size={12} className="text-emerald-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">{tx.description ?? tx.type}</p>
                          <p className="text-slate-500 text-[10px] mt-0.5">
                            {tx.type?.replace(/_/g, " ")} · {new Date(tx.created_at).toLocaleString()}
                          </p>
                        </div>
                        <p className={`font-black text-base ${isDebit ? "text-red-400" : "text-emerald-400"}`}>
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
              {activeLicenses.length === 0 && licenses.length === 0 ? (
                <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl text-slate-500">
                  <Shield size={28} className="mx-auto mb-2 opacity-30" />
                  <p>No licenses purchased yet</p>
                </div>
              ) : (
                (licenses.length > 0 ? licenses : activeLicenses).map((lic) => {
                  const expired = lic.expires_at && new Date(lic.expires_at) < new Date();
                  const isActive = ACTIVE_LICENSE_STATUSES.includes(lic.status) && !expired;
                  return (
                    <div
                      key={lic.id}
                      className={`rounded-2xl border p-5 ${isActive ? "bg-emerald-900/10 border-emerald-800/40" : "bg-slate-900/60 border-slate-800"}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-black">
                            {LICENSE_LABELS[lic.license_type] ?? lic.license_type}
                          </p>
                          <p className="text-slate-400 text-xs">
                            Purchased:{" "}
                            {lic.purchased_at
                              ? new Date(lic.purchased_at).toLocaleDateString()
                              : "—"}
                          </p>
                          {lic.expires_at && (
                            <p className="text-slate-500 text-xs">
                              Expires: {new Date(lic.expires_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <StatusBadge status={expired ? "expired" : lic.status} />
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