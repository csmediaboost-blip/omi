"use client";
// app/dashboard/financials/page.tsx — FINAL FIXED VERSION
// ─────────────────────────────────────────────────────────────────────────────
// BUG #3 FIX: GPU mining deposits now visible in Finance — queries node_allocations
//             AND payment_transactions, merged into a unified deposits view
// BUG #4 FIX: Profile query now fetches ALL payout fields — WithdrawModal
//             no longer shows "No payout account" incorrectly
// BUG #5 FIX: Mining Portfolio tab joins gpu_plans to show plan names not UUIDs
// BUG #6 FIX: payment_transactions with gateway="gpu_mining" shown as confirmed
// BUG #9 FIX: Per-second display hidden for amounts < $1 minimum (shows $0.00/s
//             label instead of confusing micro-amounts)
// BUG #10 FIX: Withdraw button and alerts use clearer language
// SYNTAX FIX: Missing `if (loading) return (` before loading spinner JSX
// CRYPTO FIX: gateway="crypto" with purchaseType="gpu_plan" now treated as GPU deposit
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getBusinessDayMessage, isBusinessDay } from "@/lib/business-days";
import DashboardNavigation from "@/components/dashboard-navigation";
import {
  isKYCApproved,
  runWithdrawalSecurityChecks,
  atomicDeductBalance,
  refundBalance,
  logWithdrawalEvent,
  recordWithdrawalLedger,
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
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────
type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  tier: string;
  role: string;
  balance_available: number;
  balance_pending: number;
  balance_locked: number;
  wallet_balance: number;
  pending_balance: number;
  total_earned: number;
  earnings: number;
  earning_withrawn: number;
  total_withrawn: number;
  weekly_withdrawn: number;
  last_withhrawal_at: string | null;
  kyc_verified: boolean;
  kyc_status: string;
  payout_registered: boolean;
  payout_account_name: string | null;
  payout_bank_name: string | null;
  payout_account_number: string | null;
  payout_gateway: string | null;
  payout_currency: string | null;
  payout_kyc_match: boolean;
  payout_locked: boolean;
  account_flagged: boolean;
  withdwals_fronzen: boolean;
  earnings_locked_until: string | null;
  referral_earnings: number;
  total_task_completed: number;
  approved_count: number;
  rejected_countb: number;
  qaulity_score: number;
  streak_count: number;
  last_active_at: string | null;
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
  plan_name?: string;
  gpu_model?: string;
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
  metadata: Record<string, any>;
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
};

type DepositEntry = {
  id: string;
  type: "payment" | "gpu_mining" | "gpu_contract";
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

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    confirmed: "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
    confmrmed: "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
    active: "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
    queued: "bg-blue-900/30 border-blue-700/40 text-blue-400",
    processing: "bg-violet-900/30 border-violet-700/40 text-violet-400",
    paid: "bg-emerald-900/30 border-emerald-700/40 text-emerald-400",
    pending: "bg-amber-900/30 border-amber-700/40 text-amber-400",
    failed: "bg-red-900/30 border-red-700/40 text-red-400",
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
  if (gateway === "crypto_wallet" || gateway === "crypto")
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-900/30 border border-violet-700/40 text-violet-400">
        ₿ Crypto
      </span>
    );
  if (gateway === "bank_transfer")
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-700/40 text-blue-400">
        🏦 Bank Transfer
      </span>
    );
  if (gateway === "gpu_mining")
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
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const MIN = 10;
  const amt = parseFloat(amount) || 0;
  const available = Math.max(0, availableBalance);
  const expDays = amt < 500 ? 1 : amt < 5000 ? 2 : amt < 50000 ? 5 : 7;
  const expDate = new Date(Date.now() + expDays * 86400000);
  const bizMsg = getBusinessDayMessage();
  const isBizDay = isBusinessDay();

  const payoutGateway = profile.payout_gateway ?? "unknown";
  const payoutName = profile.payout_account_name ?? "—";
  const payoutBank = profile.payout_bank_name ?? "";
  const payoutAcct = profile.payout_account_number ?? "—";
  const hasPayout = !!(
    profile.payout_registered && profile.payout_account_number
  );
  const kycOk = isKYCApproved(profile);

  async function handleSubmit() {
    setError("");
    if (!pin || pin.length < 4) {
      setError("Please enter your PIN (4–6 digits)");
      return;
    }

    async function hashPin(v: string): Promise<string> {
      const enc = new TextEncoder();
      const buf = await crypto.subtle.digest("SHA-256", enc.encode(v + userId));
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    const pinHash = await hashPin(pin);
    const { data: ud } = await supabase
      .from("users")
      .select("pin_hash")
      .eq("id", userId)
      .single();
    if (!ud?.pin_hash || pinHash !== ud.pin_hash) {
      setError("Invalid PIN. Withdrawal cannot be processed.");
      logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
        reason: "Invalid PIN",
        amount: amt,
      }).catch(() => {});
      return;
    }

    const check = await runWithdrawalSecurityChecks(
      supabase,
      userId,
      amt,
      profile as UserSecurityProfile,
    );
    if (!check.pass) {
      setError(check.reason);
      logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
        reason: check.reason,
        amount: amt,
      }).catch(() => {});
      return;
    }

    setLoading(true);
    try {
      const deduct = await atomicDeductBalance(supabase, userId, amt);
      if (!deduct.success) {
        setError(deduct.error ?? "Balance deduction failed");
        logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
          reason: "Balance deduction failed",
          amount: amt,
        }).catch(() => {});
        setLoading(false);
        return;
      }

      const { error: wErr } = await supabase.from("withdrawals").insert({
        user_id: userId,
        amount: amt,
        wallet_address: payoutAcct,
        payout_method: payoutGateway,
        payout_account_name: payoutName,
        payout_bank_name: payoutBank || null,
        status: "queued",
        tracking_status: "queued",
        expected_date: expDate.toISOString(),
        created_at: new Date().toISOString(),
      });

      if (wErr) {
        console.error("[withdrawal] Insert failed, refunding:", wErr.message);
        await refundBalance(supabase, userId, amt);
        logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
          reason: wErr.message,
          amount: amt,
        }).catch(() => {});
        throw wErr;
      }

      await recordWithdrawalLedger(
        supabase,
        userId,
        amt,
        payoutAcct,
        payoutGateway,
      );
      logWithdrawalEvent(supabase, userId, "withdrawal_requested", {
        amount: amt,
        payout_method: payoutGateway,
        payout_account: payoutAcct.slice(0, 12) + "...",
        expected_date: expDate.toISOString(),
      }).catch(() => {});

      onSuccess();
    } catch (e: any) {
      setError(e.message || "Withdrawal failed. Please try again.");
      logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
        reason: e.message ?? "Unknown",
        amount: amt,
      }).catch(() => {});
    }
    setLoading(false);
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
          maxHeight: "90vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
                Admin processes to your registered account
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!kycOk && (
            <div
              className="rounded-xl p-3"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
              }}
            >
              <p className="text-red-400 text-sm font-bold flex items-center gap-2">
                <AlertTriangle size={13} /> KYC verification required
              </p>
              <p className="text-red-400/70 text-xs mt-1">
                Complete identity verification in the Verification section.
                Mining continues unaffected.
              </p>
            </div>
          )}

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
                <p className="text-slate-500 text-xs font-mono">{payoutAcct}</p>
                <p className="text-blue-400 text-[10px] capitalize">
                  via {payoutGateway}
                </p>
                {kycOk && (
                  <p className="text-emerald-400 text-[10px] flex items-center gap-1">
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

          {!hasPayout && (
            <div
              className="rounded-xl p-3"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
              }}
            >
              <p className="text-red-400 text-sm font-bold flex items-center gap-2">
                <Lock size={13} /> Cannot withdraw without a registered payout
                account
              </p>
            </div>
          )}

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

          <div
            className="rounded-xl p-3"
            style={{
              background: isBizDay
                ? "rgba(16,185,129,0.08)"
                : "rgba(239,68,68,0.08)",
              border: isBizDay
                ? "1px solid rgba(16,185,129,0.2)"
                : "1px solid rgba(239,68,68,0.25)",
            }}
          >
            <p
              className={`text-sm font-bold flex items-center gap-2 ${isBizDay ? "text-emerald-400" : "text-amber-400"}`}
            >
              <Clock size={13} />
              {bizMsg}
            </p>
            {!isBizDay && (
              <p className="text-amber-400/70 text-xs mt-1">
                Withdrawals only processed on business days (Mon–Fri).
              </p>
            )}
          </div>

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
                  label: "Processing",
                  desc: "Admin verifying",
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

          {error && (
            <div
              className="rounded-xl p-3 flex items-center gap-2"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
              }}
            >
              <AlertTriangle size={13} className="text-red-400 shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={
              loading ||
              isFrozen ||
              !amount ||
              !hasPayout ||
              !kycOk ||
              pin.length < 4 ||
              !isBizDay
            }
            className="w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
          >
            {loading ? (
              <>
                <RefreshCw size={15} className="animate-spin" /> Submitting…
              </>
            ) : !isBizDay ? (
              <>
                <Clock size={15} /> Available Mon–Fri only
              </>
            ) : pin.length < 4 ? (
              <>
                <Lock size={15} /> Enter PIN to continue
              </>
            ) : (
              <>
                <Send size={15} /> Request Withdrawal of ${amount || "0.00"}
              </>
            )}
          </button>
          <p className="text-slate-600 text-[11px] text-center pb-1">
            Funds sent to your registered payout account.
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
    setTimeout(() => setToast(null), 5000);
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
            "id, email, full_name, tier, role, " +
              "balance_available, balance_pending, balance_locked, wallet_balance, " +
              "pending_balance, total_earned, earnings, earning_withrawn, total_withrawn, " +
              "weekly_withdrawn, last_withhrawal_at, " +
              "kyc_verified, kyc_status, " +
              "payout_registered, payout_account_name, payout_bank_name, " +
              "payout_account_number, payout_gateway, payout_currency, " +
              "payout_kyc_match, payout_locked, " +
              "account_flagged, withdwals_fronzen, earnings_locked_until, " +
              "referral_earnings, total_task_completed, approved_count, " +
              "rejected_countb, qaulity_score, streak_count, last_active_at, created_at",
          )
          .eq("id", user.id)
          .single(),

        supabase
          .from("payment_transactions")
          .select(
            "id, user_id, node_key, amount, currency, gateway, " +
              "gateway_reference, status, metadata, created_at, confirmed_at, verified_by_admin",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),

        supabase
          .from("node_allocations")
          .select(
            "id, user_id, plan_id, amount_invested, currency, payment_model, " +
              "contract_months, contract_label, contract_min_pct, contract_max_pct, " +
              "maturity_date, lock_in_label, status, total_earned, total_withdrawn, " +
              "mining_period, mining_ends_at, mining_completed, final_profit, created_at",
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
            "id, user_id, amount, wallet_address, payout_method, payout_account_name, " +
              "payout_bank_name, status, tracking_status, expected_date, " +
              "created_at, paid_at, failure_reason",
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),

        supabase.from("gpu_plans").select("id, name, gpu_model"),
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

    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!userId) return;

    const financeChannel = supabase
      .channel("finance_realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "payment_transactions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          loadData();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "payment_transactions",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          loadData();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "node_allocations",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          loadData();
        },
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
            setProfile((prev: any) =>
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
      supabase.removeChannel(financeChannel);
    };
  }, [userId, loadData]);

  // ── SYNTAX FIX: `if (loading) return (` was missing — caused parse error at line 589 ──
  if (loading)
    return (
      <div className="flex min-h-screen bg-slate-950">
        <DashboardNavigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      </div>
    );

  const avail = profile?.balance_available ?? profile?.wallet_balance ?? 0;
  const pending = profile?.balance_pending ?? profile?.pending_balance ?? 0;
  const locked = profile?.balance_locked ?? 0;
  const totalEarned = profile?.total_earned ?? profile?.earnings ?? 0;
  const totalWd = profile?.total_withrawn ?? profile?.earning_withrawn ?? 0;
  const isFrozen = profile?.withdwals_fronzen ?? false;
  const kycOk = profile ? isKYCApproved(profile) : false;

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
  const unclaimedCapital = unclaimedMatured.reduce(
    (s, n) => s + (n.amount_invested ?? 0),
    0,
  );
  const unclaimedEarnings = unclaimedMatured.reduce(
    (s, n) => s + (n.total_earned ?? 0),
    0,
  );
  const unclaimedTotal = unclaimedCapital + unclaimedEarnings;
  const effectiveAvail = avail + unclaimedTotal;
  const effectiveTotalEarned = Math.max(totalEarned, totalNodeEarned);

  // ── CRYPTO FIX: explicit GPU payment detection covering gateway="crypto" ──
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
      pt.gateway === "crypto_wallet" ||
      meta.purchaseType === "gpu_plan" ||
      meta.purchaseType === "gpu_contract" ||
      meta.purchaseType === "gpu_mining" ||
      (pt.gateway === "crypto" &&
        (meta.purchaseType === "gpu_plan" ||
          meta.purchaseType === "gpu_contract" ||
          meta.purchaseType === "gpu_mining"));

    depositEntries.push({
      id: `pt-${pt.id}`,
      type: isGpuPayment
        ? meta.purchaseType === "gpu_contract"
          ? "gpu_contract"
          : "gpu_mining"
        : "payment",
      label: isGpuPayment
        ? `GPU Mining Deposit${meta.planName ? ` — ${meta.planName}` : ""}`
        : meta.purchaseType === "license"
          ? "Operator License"
          : "Payment",
      amount: pt.amount,
      status:
        isGpuPayment && pt.status !== "failed"
          ? "confirmed"
          : pt.status === "confirmed" || pt.status === "confmrmed"
            ? "confirmed"
            : pt.status === "failed"
              ? "failed"
              : "pending",
      gateway: pt.gateway,
      planName: meta.planName,
      miningPeriod: meta.miningPeriod,
      reference: pt.gateway_reference ?? String(pt.id),
      created_at: pt.created_at,
    });
  }

  const ptReferences = new Set(
    paymentTxs.map((pt) => pt.gateway_reference).filter(Boolean),
  );
  for (const alloc of nodeAllocations) {
    if (ptReferences.has(alloc.id)) continue;

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
  const totalDeposited = confirmedDeposits.reduce((s, d) => s + d.amount, 0);
  const canWithdraw =
    !isFrozen && effectiveAvail >= 10 && !!profile?.payout_registered && kycOk;

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
          onSuccess={() => {
            setShowWithdrawModal(false);
            showToast(
              "Withdrawal request submitted! Admin will process it shortly.",
            );
            loadData();
            setTab("withdrawals");
          }}
        />
      )}

      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-semibold shadow-xl max-w-sm flex items-center gap-2 ${toast.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
        >
          {toast.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}{" "}
          {toast.text}
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
              <button
                onClick={() => setShowWithdrawModal(true)}
                disabled={!canWithdraw}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg,#10b981,#059669)",
                }}
              >
                <ArrowUpRight size={14} />
                {isFrozen
                  ? "Frozen"
                  : !profile?.payout_registered
                    ? "Setup Payout First"
                    : !kycOk
                      ? "KYC Required"
                      : avail < 10
                        ? "Need $10 min"
                        : `Withdraw $${effectiveAvail.toFixed(2)}`}
              </button>
            </div>
          </div>

          {/* Alerts */}
          {!kycOk && (
            <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={14} className="text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">
                KYC verification required for withdrawals. Mining continues
                normally.{" "}
                <button
                  onClick={() => router.push("/dashboard/verification")}
                  className="underline font-bold"
                >
                  Complete verification →
                </button>
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
                  — ${unclaimedTotal.toFixed(2)} (capital + earnings) pending
                  credit to your wallet.
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
                Your withdrawals are currently frozen. Contact support.
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
              label="Total Deposited"
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
                      label: "Pending Balance",
                      value: `$${pending.toFixed(2)}`,
                      color: "text-violet-400",
                    },
                    {
                      label: "Locked Balance",
                      value: `$${locked.toFixed(2)}`,
                      color: "text-amber-400",
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
                      ? "Complete KYC to enable withdrawals (mining is unaffected)."
                      : !profile?.payout_registered
                        ? "Set up your payout account first."
                        : avail < 10
                          ? "You need at least $10 to withdraw."
                          : "Submit a request and admin will process it."}
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
                    <p className="text-slate-500 text-xs mt-1">
                      Register a payout account to enable withdrawals.
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
                  <Activity size={14} className="text-blue-400" /> Performance
                  Stats
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    {
                      label: "Tasks Completed",
                      value: profile?.total_task_completed ?? 0,
                      color: "text-white",
                    },
                    {
                      label: "Approved",
                      value: profile?.approved_count ?? 0,
                      color: "text-emerald-400",
                    },
                    {
                      label: "Rejected",
                      value: profile?.rejected_countb ?? 0,
                      color: "text-red-400",
                    },
                    {
                      label: "Quality Score",
                      value: `${((profile?.qaulity_score ?? 0) * 100).toFixed(0)}%`,
                      color:
                        (profile?.qaulity_score ?? 0) >= 0.8
                          ? "text-emerald-400"
                          : "text-amber-400",
                    },
                    {
                      label: "Streak",
                      value: `${profile?.streak_count ?? 0} days`,
                      color: "text-amber-400",
                    },
                    {
                      label: "Referral Earned",
                      value: `$${(profile?.referral_earnings ?? 0).toFixed(2)}`,
                      color: "text-violet-400",
                    },
                    {
                      label: "KYC Status",
                      value: kycOk
                        ? "Verified ✓"
                        : (profile?.kyc_status ?? "Pending"),
                      color: kycOk ? "text-emerald-400" : "text-amber-400",
                    },
                    {
                      label: "Last Active",
                      value: profile?.last_active_at
                        ? new Date(profile.last_active_at).toLocaleDateString()
                        : "—",
                      color: "text-slate-400",
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
              <div className="flex items-center justify-between">
                <p className="text-white font-bold">
                  {depositEntries.length} total deposits
                </p>
                <p className="text-emerald-400 text-xs font-bold">
                  ${totalDeposited.toFixed(2)} confirmed
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-[10px] uppercase">
                    GPU Mining
                  </p>
                  <p className="text-emerald-400 font-black text-base">
                    {
                      depositEntries.filter(
                        (d) =>
                          d.type === "gpu_mining" || d.type === "gpu_contract",
                      ).length
                    }
                  </p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-[10px] uppercase">Other</p>
                  <p className="text-cyan-400 font-black text-base">
                    {depositEntries.filter((d) => d.type === "payment").length}
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
                              {dep.miningPeriod && dep.type !== "payment" && (
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
                              {[
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
                              ].map(([l, v]) => (
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
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
                              {[
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
                              ].map(([l, v]) => (
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
                  ? "Withdrawals Frozen"
                  : !kycOk
                    ? "KYC Verification Required (Mining still active)"
                    : !profile?.payout_registered
                      ? "Setup Payout Account First"
                      : avail < 10
                        ? `Need $10 min (have $${effectiveAvail.toFixed(2)})`
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
