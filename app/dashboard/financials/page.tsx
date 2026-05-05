"use client";
// app/dashboard/financials/page.tsx — v2 FIXES:
// OPTIMIZED: Uses caching for instant loads, lazy loading for non-critical data
// 1. KYC check: checks kyc_status === "approved" OR kyc_verified === true (not both required)
// 2. WithdrawModal is scrollable (overflow-y-auto on content, max-h on container)
// 3. GPU plans WithdrawModal: removed gateway column, uses payout account from DB

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cacheService } from "@/lib/cache-service";
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
  type WithdrawalFraudCheck,
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
} from "lucide-react";

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
  has_opertor_license: boolean;
  license_expires_at: string | null;
  total_task_completed: number;
  approved_count: number;
  rejected_countb: number;
  qaulity_score: number;
  streak_count: number;
  consecutive_inactive_days: number;
  account_flagged: boolean;
  withdwals_fronzen: boolean;
  earnings_locked_until: string | null;
  referral_earnings: number;
  last_active_at: string | null;
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
  created_at: string;
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

// ─── Helpers ──────────────────────────────────────────────────
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
  };
  return (
    <span
      className={`text-[10px] font-black px-2 py-0.5 rounded-full border capitalize ${map[status] || "bg-slate-800 border-slate-700 text-slate-400"}`}
    >
      {status}
    </span>
  );
}

function StatBox({ label, value, color, icon: Icon, sub }: any) {
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
  if (gateway === "crypto_wallet")
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-900/30 border border-violet-700/40 text-violet-400">
        ₿ Crypto
      </span>
    );
  if (gateway === "bank_transfer")
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-700/40 text-blue-400">
        🏦 Local Transfer
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

// ─── USE SECURITY MODULE — All fraud/KYC checks centralized ──────────────────
// The security module contains: KYC, account flags, payout, balance, rate limits, etc.

// ─── FRAUD CHECKS — Fixed KYC logic ──────────────────────────
async function runWithdrawalFraudChecks(
  userId: string,
  amt: number,
  profile: UserProfile,
): Promise<{ pass: boolean; reason: string }> {
  if (profile.account_flagged)
    return { pass: false, reason: "Account is flagged. Contact support." };
  if (profile.withdwals_fronzen)
    return { pass: false, reason: "Withdrawals are frozen on your account." };

  // ── FIXED: kyc_verified OR kyc_status === "approved" — either one is enough ──
  if (!isKYCApproved(profile)) {
    return {
      pass: false,
      reason: "KYC verification required before withdrawing.",
    };
  }

  if (!profile.payout_registered)
    return {
      pass: false,
      reason:
        "No payout account registered. Go to Verification → Payout Setup.",
    };
  if (profile.payout_locked)
    return {
      pass: false,
      reason: "Your payout account is locked. Contact support.",
    };
  if (
    profile.earnings_locked_until &&
    new Date(profile.earnings_locked_until) > new Date()
  ) {
    return {
      pass: false,
      reason: `Earnings locked until ${new Date(profile.earnings_locked_until).toLocaleDateString()}.`,
    };
  }
  if (amt < 10) return { pass: false, reason: "Minimum withdrawal is $10." };

  // Re-verify balance from DB
  const { data: fresh } = await supabase
    .from("users")
    .select("balance_available, wallet_balance")
    .eq("id", userId)
    .single();
  const freshBalance =
    (fresh as any)?.balance_available ?? (fresh as any)?.wallet_balance ?? 0;
  if (amt > freshBalance)
    return {
      pass: false,
      reason: `Insufficient balance. Available: $${freshBalance.toFixed(2)}`,
    };

  // 24h rate limit
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  const { data: recentWDs } = await supabase
    .from("withdrawals")
    .select("amount")
    .eq("user_id", userId)
    .in("status", ["queued", "processing", "paid"])
    .gte("created_at", oneDayAgo);
  const last24hTotal = (recentWDs || []).reduce(
    (s: number, w: any) => s + (w.amount || 0),
    0,
  );
  if (last24hTotal + amt > 50000)
    return {
      pass: false,
      reason: "24-hour withdrawal limit exceeded ($50,000).",
    };

  // Max 3 pending
  const { data: pendingWDs } = await supabase
    .from("withdrawals")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["queued", "processing"]);
  if ((pendingWDs || []).length >= 3)
    return {
      pass: false,
      reason:
        "You have too many pending withdrawals. Wait for them to process.",
    };

  return { pass: true, reason: "" };
}

// ─── WITHDRAW MODAL — Fixed: scrollable + KYC fix + no gateway column ─────────
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
  const expectedDays = amt < 500 ? 1 : amt < 5000 ? 2 : amt < 50000 ? 5 : 7;
  const expectedDate = new Date(Date.now() + expectedDays * 86400000);
  const businessDayMessage = getBusinessDayMessage();
  const isBusinessDayNow = isBusinessDay();

  const payoutGateway = profile.payout_gateway || "unknown";
  const payoutName = profile.payout_account_name || "—";
  const payoutBank = profile.payout_bank_name || "";
  const payoutAccount = profile.payout_account_number || "—";
  const hasPayoutAccount =
    profile.payout_registered && !!profile.payout_account_number;

  // KYC check uses fixed helper
  const kycOk = isKYCApproved(profile);

  async function handleSubmit() {
    setError("");

    // ─── PIN VERIFICATION ─────────────────────────────────────────────────────
    if (!pin || pin.length < 4) {
      setError("Please enter your PIN (4-6 digits)");
      return;
    }

    // Hash PIN for verification
    async function hashPin(pinValue: string): Promise<string> {
      const encoder = new TextEncoder();
      const data = encoder.encode(pinValue + userId);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    const providedPinHash = await hashPin(pin);
    
    // Get user's stored PIN hash
    const { data: userData } = await supabase
      .from("users")
      .select("pin_hash")
      .eq("id", userId)
      .single();

    if (!userData?.pin_hash || providedPinHash !== userData.pin_hash) {
      setError("Invalid PIN. Withdrawal cannot be processed.");
      logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
        reason: "Invalid PIN",
        amount: amt,
      }).catch(() => {});
      return;
    }

    // ─── COMPREHENSIVE FRAUD & KYC CHECK ───────────────────────────────────
    const securityCheck = await runWithdrawalSecurityChecks(
      supabase,
      userId,
      amt,
      profile as UserSecurityProfile,
    );

    if (!securityCheck.pass) {
      setError(securityCheck.reason);
      // Attempt to log but don't fail (async, fire-and-forget)
      logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
        reason: securityCheck.reason,
        amount: amt,
      }).catch(() => {
        // Log failed silently
      });
      return;
    }

    setLoading(true);
    try {
      // ─── ATOMIC BALANCE DEDUCTION ─────────────────────────────────────────
      const deductResult = await atomicDeductBalance(supabase, userId, amt);

      if (!deductResult.success) {
        setError(deductResult.error || "Balance deduction failed");
        // Attempt to log but don't fail (async, fire-and-forget)
        logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
          reason: "Balance deduction failed",
          amount: amt,
          error: deductResult.error,
        }).catch(() => {
          // Log failed silently
        });
        return;
      }

      // ─── INSERT WITHDRAWAL RECORD ─────────────────────────────────────────
      const { error: wErr } = await supabase.from("withdrawals").insert({
        user_id: userId,
        amount: amt,
        wallet_address: payoutAccount,
        payout_method: payoutGateway,
        payout_account_name: payoutName,
        payout_bank_name: payoutBank || null,
        status: "queued",
        tracking_status: "queued",
        expected_date: expectedDate.toISOString(),
        created_at: new Date().toISOString(),
      });

      if (wErr) {
        // Refund balance if insertion fails
        console.error(
          "[WITHDRAWAL] Insert failed, refunding balance:",
          wErr.message,
        );
        await refundBalance(supabase, userId, amt);
        // Attempt to log but don't fail (async, fire-and-forget)
        logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
          reason: "Withdrawal record creation failed",
          amount: amt,
          error: wErr.message,
        }).catch(() => {
          // Log failed silently
        });
        throw wErr;
      }

      // ─── RECORD IN TRANSACTION LEDGER ─────────────────────────────────────
      await recordWithdrawalLedger(
        supabase,
        userId,
        amt,
        payoutAccount,
        payoutGateway,
      );

      // ─── LOG SUCCESS FOR AUDIT TRAIL (async, fire-and-forget) ──────────────
      logWithdrawalEvent(supabase, userId, "withdrawal_requested", {
        amount: amt,
        payout_method: payoutGateway,
        payout_account: payoutAccount.slice(0, 12) + "...",
        expected_date: expectedDate.toISOString(),
      }).catch(() => {
        // Log failed silently
      });

      onSuccess();
    } catch (e: any) {
      setError(e.message || "Withdrawal failed. Please try again.");
      // Attempt to log but don't fail (async, fire-and-forget)
      logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
        reason: e.message || "Unknown error",
        amount: amt,
      }).catch(() => {
        // Log failed silently
      });
    }
    setLoading(false);
  }

  return (
    // ── FIXED: scrollable overlay — overflowY on inner container ──
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col"
        style={{
          background: "rgb(10,16,28)",
          border: "1px solid rgba(16,185,129,0.3)",
          maxHeight: "90vh", // ← prevents overflow off screen
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — fixed, doesn't scroll */}
        <div
          className="px-6 py-5 flex items-center justify-between flex-shrink-0"
          style={{
            background: "rgba(16,185,129,0.08)",
            borderBottom: "1px solid rgba(16,185,129,0.2)",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <ArrowUpRight size={18} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-black">Request Withdrawal</p>
              <p className="text-slate-500 text-xs">
                Admin will process and pay to your registered account
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── SCROLLABLE BODY ── */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* KYC warning — only show if actually not verified */}
          {!kycOk && (
            <div
              className="rounded-xl p-3"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
              }}
            >
              <p className="text-red-400 text-sm font-bold flex items-center gap-2">
                <AlertTriangle size={14} /> KYC verification required
              </p>
              <p className="text-red-400/70 text-xs mt-1">
                Complete identity verification in the Verification section.
              </p>
            </div>
          )}

          {/* Payout account (read-only from verification) */}
          <div
            className="rounded-xl p-4"
            style={{
              background: "rgba(59,130,246,0.06)",
              border: "1px solid rgba(59,130,246,0.2)",
            }}
          >
            <p className="text-slate-400 text-[10px] uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Shield size={10} className="text-blue-400" /> Registered Payout
              Account
            </p>
            {hasPayoutAccount ? (
              <div className="space-y-1">
                <p className="text-white font-bold text-sm">{payoutName}</p>
                {payoutBank && (
                  <p className="text-slate-400 text-xs">{payoutBank}</p>
                )}
                <p className="text-slate-500 text-xs font-mono">
                  {payoutAccount}
                </p>
                <p className="text-blue-400 text-[10px] capitalize">
                  via {payoutGateway}
                </p>
                {kycOk && (
                  <p className="text-emerald-400 text-[10px] flex items-center gap-1 mt-1">
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

          {!hasPayoutAccount && (
            <div
              className="rounded-xl p-3"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
              }}
            >
              <p className="text-red-400 text-sm font-bold flex items-center gap-2">
                <Lock size={14} /> Cannot withdraw without a registered payout
                account
              </p>
            </div>
          )}

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
                className="w-full pl-9 pr-4 py-4 rounded-xl text-xl font-black text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <div className="flex gap-2 mt-2">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  onClick={() =>
                    setAmount(((available * pct) / 100).toFixed(2))
                  }
                  className="flex-1 text-[11px] font-bold py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-400 transition-all"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Business Day Message */}
          <div
            className="rounded-xl p-4"
            style={{
              background: isBusinessDayNow ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
              border: isBusinessDayNow ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(239,68,68,0.25)",
            }}
          >
            <p className={`text-sm font-bold flex items-center gap-2 ${isBusinessDayNow ? "text-emerald-400" : "text-yellow-400"}`}>
              <Clock size={14} />
              {businessDayMessage}
            </p>
            {!isBusinessDayNow && (
              <p className="text-yellow-400/70 text-xs mt-1">
                Withdrawals are only processed on business days (Monday to Friday).
              </p>
            )}
          </div>

          {/* PIN Input - Required for withdrawal */}
          <div>
            <label className="text-slate-300 text-sm font-bold block mb-2">
              Security PIN <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="Enter your 4-6 digit PIN"
              className="w-full px-4 py-3 rounded-xl text-lg font-bold text-center tracking-widest text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <p className="text-slate-500 text-xs mt-1">
              Your PIN is required to complete the withdrawal for security.
            </p>
          </div>

          {/* Settlement timeline */}
          {amt >= MIN && amt <= available && (
            <div
              className="rounded-xl p-4 space-y-3"
              style={{
                background: "rgba(59,130,246,0.06)",
                border: "1px solid rgba(59,130,246,0.2)",
              }}
            >
              <p className="text-blue-300 text-xs font-black uppercase tracking-wider">
                Settlement Timeline
              </p>
              <div className="space-y-2">
                {[
                  {
                    label: "Queued",
                    desc: "Request received by admin",
                    done: true,
                    active: false,
                  },
                  {
                    label: "Processing",
                    desc: "Admin verifying and processing",
                    done: false,
                    active: true,
                  },
                  {
                    label: "In Transit",
                    desc: amt < 500 ? "Same day dispatch" : "Batch processed",
                    done: false,
                    active: false,
                  },
                  {
                    label: "Paid",
                    desc: `Expected ${expectedDate.toLocaleDateString()}`,
                    done: false,
                    active: false,
                  },
                ].map((step) => (
                  <div key={step.label} className="flex items-start gap-3">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${step.done ? "bg-emerald-500 border-emerald-500" : step.active ? "border-blue-400 animate-pulse" : "border-slate-700"}`}
                    >
                      {step.done && (
                        <CheckCircle size={10} className="text-white" />
                      )}
                    </div>
                    <div>
                      <p
                        className={`text-xs font-bold ${step.done ? "text-emerald-400" : step.active ? "text-blue-300" : "text-slate-600"}`}
                      >
                        {step.label}
                      </p>
                      <p className="text-slate-600 text-[10px]">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-slate-500 text-[10px]">
                {amt < 500
                  ? "Small withdrawals settle within 24 hours"
                  : amt < 5000
                    ? "Medium withdrawals settle in 24–48 hours"
                    : "Large withdrawals: 3–7 business days"}
              </p>
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
              <AlertTriangle size={14} className="text-red-400 shrink-0" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={
              loading || isFrozen || !amount || !hasPayoutAccount || !kycOk || !pin || pin.length < 4 || !isBusinessDayNow
            }
            className="w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
            title={!isBusinessDayNow ? "Withdrawals only available on business days (Mon-Fri)" : !pin || pin.length < 4 ? "Enter valid PIN" : ""}
          >
            {loading ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            {loading
              ? "Submitting..."
              : !isBusinessDayNow
                ? "Only available on business days"
                : !pin || pin.length < 4
                  ? "Enter PIN to continue"
                  : `Request Withdrawal of $${amount || "0.00"}`}
          </button>

          <p className="text-slate-600 text-[11px] text-center pb-2">
            Funds will be sent to your registered payout account.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────
export default function FinancialsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [paymentTxs, setPaymentTxs] = useState<PaymentTx[]>([]);
  const [nodeAllocations, setNodeAllocations] = useState<NodeAllocation[]>([]);
  const [licenses, setLicenses] = useState<OperatorLicense[]>([]);
  const [ledgerTxs, setLedgerTxs] = useState<LedgerTx[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    | "overview"
    | "payments"
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

    const [profRes, payRes, nodeRes, licRes, ledgerRes, wRes] =
      await Promise.allSettled([
        supabase
          .from("users")
          .select(
            "id, balance_available, balance_pending, balance_locked, wallet_balance, pending_balance, total_earned, total_withrawn, earnings, earning_withrawn, withdwals_fronzen, payout_registered, kyc_status, kyc_verified"
          )
          .eq("id", user.id)
          .single(),
        supabase
          .from("payment_transactions")
          .select("id, user_id, amount, status, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("node_allocations")
          .select("id, user_id, status, amount_invested, total_earned, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("operator_licenses")
          .select("id, user_id, status, purchased_at")
          .eq("user_id", user.id)
          .order("purchased_at", { ascending: false })
          .limit(10),
        supabase
          .from("transaction_ledger")
          .select("id, user_id, type, amount, created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("withdrawals")
          .select(
            "id, user_id, amount, wallet_address, payout_method, payout_account_name, payout_bank_name, status, tracking_status, expected_date, created_at, paid_at, failure_reason"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

    if (profRes.status === "fulfilled" && profRes.value.data)
      setProfile(profRes.value.data);
    if (payRes.status === "fulfilled") setPaymentTxs(payRes.value.data || []);
    if (nodeRes.status === "fulfilled")
      setNodeAllocations(nodeRes.value.data || []);
    if (licRes.status === "fulfilled") setLicenses(licRes.value.data || []);
    if (ledgerRes.status === "fulfilled")
      setLedgerTxs(ledgerRes.value.data || []);
    if (wRes.status === "fulfilled") setWithdrawals(wRes.value.data || []);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
  const totalWithdrawn =
    profile?.total_withrawn ?? profile?.earning_withrawn ?? 0;
  const isFrozen = profile?.withdwals_fronzen ?? false;

  // ── FIXED: use helper for KYC check everywhere ──
  const userKycOk = profile ? isKYCApproved(profile) : false;

  const activeLicenses = licenses.filter((l) => l.status === "active");
  const activeNodes = nodeAllocations.filter((n) => n.status === "active");
  const totalInvested = nodeAllocations.reduce(
    (s, n) => s + (n.amount_invested || 0),
    0,
  );
  const totalNodeEarned = nodeAllocations.reduce(
    (s, n) => s + (n.total_earned || 0),
    0,
  );
  const confirmedPayments = paymentTxs.filter(
    (p) => p.status === "confirmed" || p.status === "confmrmed",
  );
  const pendingPayments = paymentTxs.filter((p) => p.status === "pending");
  const totalPaid = confirmedPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const pendingWithdrawals = withdrawals.filter(
    (w) => w.status === "queued" || w.status === "processing",
  );

  // ── FIXED canWithdraw: uses correct KYC check ──
  const canWithdraw =
    !isFrozen && avail >= 10 && !!profile?.payout_registered && userKycOk;

  const TABS = [
    { id: "overview" as const, label: "Overview", icon: BarChart3 },
    { id: "payments" as const, label: "Payments", icon: CreditCard },
    { id: "investments" as const, label: "Mining Portfolio", icon: Server },
    { id: "licenses" as const, label: "Licenses", icon: Shield },
    { id: "ledger" as const, label: "Ledger", icon: Receipt },
    { id: "withdrawals" as const, label: "Withdrawals", icon: ArrowUpRight },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <DashboardNavigation />

      {showWithdrawModal && userId && profile && (
        <WithdrawModal
          userId={userId}
          availableBalance={avail}
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
        <div className="max-w-5xl mx-auto p-4 md:p-6 pb-24 md:pb-6 space-y-6">
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
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg,#10b981,#059669)",
                }}
              >
                <ArrowUpRight size={14} />
                {isFrozen
                  ? "Frozen"
                  : !profile?.payout_registered
                    ? "Setup Payout First"
                    : !userKycOk
                      ? "KYC Required"
                      : avail < 10
                        ? "Need $10 min"
                        : `Withdraw $${avail.toFixed(2)}`}
              </button>
            </div>
          </div>

          {/* Alerts */}
          {!userKycOk && (
            <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={14} className="text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">
                KYC verification required.{" "}
                <button
                  onClick={() => router.push("/dashboard/verification")}
                  className="underline"
                >
                  Complete verification →
                </button>
              </p>
            </div>
          )}
          {userKycOk && !profile?.payout_registered && (
            <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={14} className="text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">
                <strong>Payout account not set up.</strong>{" "}
                <button
                  onClick={() => router.push("/dashboard/verification")}
                  className="underline"
                >
                  Go to Verification → Payout Setup →
                </button>
              </p>
            </div>
          )}
          {isFrozen && (
            <div className="bg-red-900/20 border border-red-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <Lock size={14} className="text-red-400 shrink-0" />
              <p className="text-red-300 text-sm">
                Your withdrawals are currently frozen by admin. Contact support.
              </p>
            </div>
          )}
          {pendingPayments.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <Clock size={14} className="text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">
                <strong>
                  {pendingPayments.length} payment
                  {pendingPayments.length > 1 ? "s" : ""}
                </strong>{" "}
                pending admin confirmation.
              </p>
            </div>
          )}
          {pendingWithdrawals.length > 0 && (
            <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl px-4 py-3 flex items-center gap-3">
              <Clock size={14} className="text-blue-400 shrink-0" />
              <p className="text-blue-300 text-sm">
                <strong>
                  {pendingWithdrawals.length} withdrawal
                  {pendingWithdrawals.length > 1 ? "s" : ""}
                </strong>{" "}
                currently being processed.
              </p>
            </div>
          )}

          {/* Balance Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBox
              label="Available Balance"
              value={`$${avail.toFixed(2)}`}
              color="text-emerald-400"
              icon={DollarSign}
              sub="Ready to withdraw"
            />
            <StatBox
              label="Total Committed"
              value={`$${totalInvested.toFixed(2)}`}
              color="text-violet-400"
              icon={Server}
              sub={`${activeNodes.length} active node${activeNodes.length !== 1 ? "s" : ""}`}
            />
            <StatBox
              label="Total Paid In"
              value={`$${totalPaid.toFixed(2)}`}
              color="text-cyan-400"
              icon={CreditCard}
              sub={`${confirmedPayments.length} confirmed`}
            />
            <StatBox
              label="Active Licenses"
              value={activeLicenses.length}
              color="text-amber-400"
              icon={Shield}
              sub={
                activeLicenses.length > 0
                  ? "Licensed operator"
                  : "No active license"
              }
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-slate-900/60 border border-slate-800 rounded-xl p-1 flex-wrap">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${tab === id ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300"}`}
              >
                <Icon size={12} /> {label}
                {id === "withdrawals" && pendingWithdrawals.length > 0 && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-400">
                    {pendingWithdrawals.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <div className="space-y-5">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                <p className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                  <BarChart3 size={14} className="text-emerald-400" /> Financial
                  Snapshot
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    {
                      label: "Available Balance",
                      value: `$${avail.toFixed(2)}`,
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
                      label: "Total Earned (All Time)",
                      value: `$${totalEarned.toFixed(2)}`,
                      color: "text-cyan-400",
                    },
                    {
                      label: "Total Withdrawn",
                      value: `$${totalWithdrawn.toFixed(2)}`,
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

              {/* Quick Withdraw CTA */}
              <div
                className="rounded-2xl p-5 flex items-center justify-between gap-4"
                style={{
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.2)",
                }}
              >
                <div>
                  <p className="text-white font-black text-base">
                    Ready to Withdraw?
                  </p>
                  <p className="text-slate-400 text-sm mt-0.5">
                    You have{" "}
                    <span className="text-emerald-400 font-bold">
                      ${avail.toFixed(2)}
                    </span>{" "}
                    available.
                    {!userKycOk
                      ? " Complete KYC verification first."
                      : !profile?.payout_registered
                        ? " Set up your payout account first."
                        : avail < 10
                          ? " You need at least $10 to withdraw."
                          : " Submit a request and admin will process it."}
                  </p>
                </div>
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={!canWithdraw}
                  className="shrink-0 px-6 py-3 rounded-xl text-sm font-black text-white flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: "linear-gradient(135deg,#10b981,#059669)",
                  }}
                >
                  <ArrowUpRight size={15} /> Withdraw Now
                </button>
              </div>

              {/* Payout account card */}
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
                    {userKycOk ? (
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

              {/* Performance */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                <p className="text-white font-bold text-sm mb-4 flex items-center gap-2">
                  <Activity size={14} className="text-blue-400" /> Performance
                  Stats
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    {
                      label: "Tasks Completed",
                      value: profile?.total_task_completed || 0,
                      color: "text-white",
                    },
                    {
                      label: "Approved",
                      value: profile?.approved_count || 0,
                      color: "text-emerald-400",
                    },
                    {
                      label: "Rejected",
                      value: profile?.rejected_countb || 0,
                      color: "text-red-400",
                    },
                    {
                      label: "Quality Score",
                      value: `${((profile?.qaulity_score || 0) * 100).toFixed(0)}%`,
                      color:
                        (profile?.qaulity_score || 0) >= 0.8
                          ? "text-emerald-400"
                          : "text-amber-400",
                    },
                    {
                      label: "Streak",
                      value: `${profile?.streak_count || 0} days`,
                      color: "text-amber-400",
                    },
                    {
                      label: "Referral Earnings",
                      value: `$${(profile?.referral_earnings || 0).toFixed(2)}`,
                      color: "text-violet-400",
                    },
                    {
                      label: "KYC Status",
                      value: userKycOk
                        ? "Verified ✓"
                        : profile?.kyc_status || "Pending",
                      color: userKycOk ? "text-emerald-400" : "text-amber-400",
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

          {/* ── WITHDRAWALS TAB ── */}
          {tab === "withdrawals" && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-[10px] uppercase">
                    Total Withdrawn
                  </p>
                  <p className="text-white font-black text-lg">
                    ${totalWithdrawn.toFixed(2)}
                  </p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-[10px] uppercase">
                    Pending
                  </p>
                  <p className="text-blue-400 font-black text-lg">
                    {pendingWithdrawals.length}
                  </p>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-slate-500 text-[10px] uppercase">Status</p>
                  <p
                    className={`font-black text-lg ${isFrozen ? "text-red-400" : "text-emerald-400"}`}
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
                <ArrowUpRight size={16} />
                {isFrozen
                  ? "Withdrawals Frozen"
                  : !userKycOk
                    ? "KYC Verification Required"
                    : !profile?.payout_registered
                      ? "Setup Payout Account First"
                      : avail < 10
                        ? `Balance too low (need $10, have $${avail.toFixed(2)})`
                        : `Request Withdrawal — $${avail.toFixed(2)} Available`}
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
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <StatusBadge
                              status={w.tracking_status || w.status}
                            />
                            {w.expected_date && w.status !== "paid" && (
                              <span className="text-[10px] text-slate-500">
                                Expected:{" "}
                                {new Date(w.expected_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-400 text-xs">
                            {w.payout_account_name || w.wallet_address}
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

          {/* ── PAYMENTS TAB ── */}
          {tab === "payments" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-white font-bold">
                  {paymentTxs.length} payments
                </p>
                <p className="text-emerald-400 text-xs font-bold">
                  ${totalPaid.toFixed(2)} confirmed
                </p>
              </div>
              {paymentTxs.length === 0 ? (
                <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl text-slate-500">
                  <CreditCard size={28} className="mx-auto mb-2 opacity-30" />
                  <p>No payment history yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentTxs.map((p) => {
                    const meta = (() => {
                      try {
                        return p.metadata ? JSON.parse(p.metadata) : {};
                      } catch {
                        return {};
                      }
                    })();
                    const isOpen = expanded === `pay-${p.id}`;
                    return (
                      <div
                        key={p.id}
                        className="border border-slate-800 rounded-xl overflow-hidden"
                      >
                        <button
                          onClick={() =>
                            setExpanded(isOpen ? null : `pay-${p.id}`)
                          }
                          className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-800/20 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-slate-800 border border-slate-700">
                            <CreditCard size={14} className="text-slate-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-white text-sm font-semibold">
                                {p.node_key || "Payment"}
                              </p>
                              <GatewayBadge gateway={p.gateway} />
                              <StatusBadge status={p.status} />
                            </div>
                            <p className="text-slate-500 text-[10px] mt-0.5">
                              {meta.purchaseType === "license"
                                ? "Operator License"
                                : "GPU Node"}{" "}
                              · {new Date(p.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right shrink-0 mr-2">
                            <p className="text-white font-black text-base">
                              ${(p.amount || 0).toFixed(2)}
                            </p>
                            <p className="text-slate-600 text-[10px]">
                              {p.currency}
                            </p>
                          </div>
                          {isOpen ? (
                            <ChevronUp
                              size={14}
                              className="text-slate-600 shrink-0"
                            />
                          ) : (
                            <ChevronDown
                              size={14}
                              className="text-slate-600 shrink-0"
                            />
                          )}
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4 border-t border-slate-800 bg-slate-900/20">
                            <div className="bg-slate-800/40 rounded-xl p-3 space-y-1.5 text-xs mt-3">
                              {[
                                ["Payment ID", String(p.id)],
                                ["Gateway Ref", p.gateway_reference || "—"],
                                [
                                  "Amount",
                                  `$${(p.amount || 0).toFixed(2)} ${p.currency}`,
                                ],
                                ["Gateway", p.gateway],
                                ["Status", p.status],
                                [
                                  "Submitted",
                                  new Date(p.created_at).toLocaleString(),
                                ],
                                ...(p.confirmed_at
                                  ? [
                                      [
                                        "Confirmed",
                                        new Date(
                                          p.confirmed_at,
                                        ).toLocaleString(),
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
                            <TrendingDown size={13} className="text-red-400" />
                          ) : (
                            <TrendingUp
                              size={13}
                              className="text-emerald-400"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-semibold truncate">
                            {tx.description || tx.type}
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

          {/* ── MINING PORTFOLIO TAB ── */}
          {tab === "investments" && (
            <div className="space-y-4">
              {nodeAllocations.length === 0 ? (
                <p>No GPU mining sessions yet</p>
              ) : (
                nodeAllocations.map((node) => (
                  <div
                    key={node.id}
                    className="border border-slate-800 rounded-2xl p-5"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-black">{node.plan_id}</p>
                        <p className="text-slate-500 text-xs">
                          {node.payment_model} ·{" "}
                          {new Date(node.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-emerald-400 font-black">
                          ${node.amount_invested.toFixed(2)}
                        </p>
                        <p className="text-slate-500 text-[10px]">
                          Earned: ${(node.total_earned || 0).toFixed(4)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
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
                            {LICENSE_LABELS[lic.license_type] ||
                              lic.license_type}
                          </p>
                          <p className="text-slate-400 text-xs">
                            Purchased:{" "}
                            {lic.purchased_at
                              ? new Date(lic.purchased_at).toLocaleDateString()
                              : "—"}
                          </p>
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
