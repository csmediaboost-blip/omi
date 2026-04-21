"use client";
// app/dashboard/gpu-plans/page.tsx
// KEY CHANGE: Users can invest (fund account) WITHOUT KYC.
// KYC is only enforced at the withdrawal stage.
// The KYC gate modal only appears when user tries to WITHDRAW, not when they invest.

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getBusinessDayMessage, isBusinessDay } from "@/lib/business-days";
import DashboardNavigation from "@/components/dashboard-navigation";
import {
  ArrowRight,
  ChevronDown,
  Cpu,
  Zap,
  Shield,
  TrendingUp,
  AlertTriangle,
  Lock,
  Clock,
  CheckCircle,
  Star,
  Globe,
  Activity,
  Layers,
  DollarSign,
  Bell,
  X,
  MessageSquare,
  Gauge,
  Thermometer,
  Server,
  HardDrive,
  ChevronRight,
  BookOpen,
  Award,
  Wallet,
  ArrowUpRight,
  BarChart2,
  Timer,
  Banknote,
  Package,
  FileCheck,
  UserCheck,
  Info,
  RefreshCw,
  Send,
  ChevronUp,
  TrendingDown,
} from "lucide-react";
import { useKycStatus, KYCStatus } from "@/lib/useKycStatus";
import {
  isKYCApproved,
  logWithdrawalEvent,
  recordWithdrawalLedger,
  type UserSecurityProfile,
} from "@/lib/withdrawal-security";

// ─── TYPES ────────────────────────────────────────────────────
type Plan = {
  id: string;
  name: string;
  short_name: string;
  subtitle: string;
  gpu_model: string;
  vram: string;
  tdp: string;
  architecture: string;
  tflops: number;
  price_min: number;
  price_max: number;
  hourly_pct: number;
  daily_pct: number;
  referral_pct: number;
  tier_color: string;
  payment_model: "flexible" | "contract" | "both";
  contract_returns: {
    "6m": { min_pct: number; max_pct: number };
    "12m": { min_pct: number; max_pct: number };
    "24m": { min_pct: number; max_pct: number };
  };
  is_waitlist: boolean;
  is_invite_only: boolean;
  is_admin_locked: boolean;
  instance_type: string;
  use_cases: string[];
  sort_order: number;
};

type Allocation = {
  id: string;
  plan_id: string;
  amount_invested: number;
  status: string;
  created_at: string;
  updated_at?: string;
  payment_model: "flexible" | "contract";
  contract_months?: number;
  contract_label?: string;
  contract_min_pct?: number;
  contract_max_pct?: number;
  maturity_date?: string;
  lock_in_months?: number;
  lock_in_label?: string;
  lock_in_multiplier?: number;
  total_earned?: number;
  total_withdrawn?: number;
  instance_type?: string;
};

type DemandEvent = {
  id: string;
  plan_id: string;
  event_type: string;
  title: string;
  description: string;
  multiplier: number;
  maintenance_fee: number | null;
  ends_at: string | null;
  is_active: boolean;
};

type WaitlistEntry = { plan_id: string; status: string };
type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

const CONTRACT_TERMS = [
  {
    months: 6,
    label: "6 Months",
    key: "6m" as const,
    desc: "Capital locked 6 months. Earnings accrue daily, withdrawable at maturity.",
  },
  {
    months: 12,
    label: "12 Months",
    key: "12m" as const,
    desc: "Capital locked 12 months. Higher estimated yield over a full annual cycle.",
  },
  {
    months: 24,
    label: "2 Years",
    key: "24m" as const,
    desc: "Capital locked 24 months. Maximum projected yield range.",
  },
];

const PERIODS = [
  { key: "hourly", label: "Per Hour", pct: 0.0001, display: "0.01%/hr" },
  { key: "daily", label: "Per Day", pct: 0.0013, display: "0.13%/day" },
  { key: "weekly", label: "Per Week", pct: 0.0013, display: "0.91%/wk" },
  { key: "monthly", label: "Per Month", pct: 0.0013, display: "3.9%/mo" },
];

const CS: Record<
  string,
  { accent: string; bg: string; border: string; glow: string; hex: string }
> = {
  slate: {
    accent: "text-slate-300",
    bg: "rgba(100,116,139,0.08)",
    border: "rgba(100,116,139,0.25)",
    glow: "rgba(100,116,139,0.15)",
    hex: "#94a3b8",
  },
  emerald: {
    accent: "text-emerald-400",
    bg: "rgba(16,185,129,0.07)",
    border: "rgba(16,185,129,0.3)",
    glow: "rgba(16,185,129,0.12)",
    hex: "#10b981",
  },
  blue: {
    accent: "text-blue-400",
    bg: "rgba(59,130,246,0.07)",
    border: "rgba(59,130,246,0.3)",
    glow: "rgba(59,130,246,0.12)",
    hex: "#3b82f6",
  },
  violet: {
    accent: "text-violet-400",
    bg: "rgba(139,92,246,0.07)",
    border: "rgba(139,92,246,0.3)",
    glow: "rgba(139,92,246,0.12)",
    hex: "#8b5cf6",
  },
  amber: {
    accent: "text-amber-400",
    bg: "rgba(245,158,11,0.07)",
    border: "rgba(245,158,11,0.3)",
    glow: "rgba(245,158,11,0.12)",
    hex: "#f59e0b",
  },
  rose: {
    accent: "text-rose-400",
    bg: "rgba(244,63,94,0.07)",
    border: "rgba(244,63,94,0.3)",
    glow: "rgba(244,63,94,0.12)",
    hex: "#f43f5e",
  },
};

const MARKET_STATS = [
  { label: "Global AI Compute Market", value: "$91.2B", icon: Globe },
  { label: "GPU Cloud Revenue 2025", value: "$14.8B", icon: Server },
  { label: "LLM Training Demand", value: "↑ 340%", icon: Activity },
  { label: "Average Node Uptime", value: "99.7%", icon: Gauge },
];

const TESTIMONIALS = [
  {
    name: "Marcus T.",
    role: "Independent Investor",
    country: "🇬🇧",
    text: "I started with the Foundation Node at $200. Within 60 days I had recovered enough to upgrade.",
    earnings: "$4,210",
    period: "6 months",
  },
  {
    name: "Aisha M.",
    role: "Tech Entrepreneur",
    country: "🇳🇬",
    text: "The A100 nodes deliver exactly what they promise. Transparent earnings breakdowns unlike anything I've seen.",
    earnings: "$28,900",
    period: "8 months",
  },
  {
    name: "David K.",
    role: "Quantitative Analyst",
    country: "🇩🇪",
    text: "The H100 PCIe tier has outperformed my expectations. The 2-year contract gave me long-term confidence.",
    earnings: "$142,000",
    period: "11 months",
  },
];

const UC_DESC: Record<string, string> = {
  "AI Fine-tuning": "Adapt foundational AI models to domain-specific tasks.",
  "Image Generation":
    "Generative AI models require massive parallel GPU throughput.",
  "LLM Training":
    "Training large language models — most GPU-intensive workload in existence.",
  "Scientific HPC": "Physics simulations, genomics, climate modelling.",
  "AI Inference": "Serving live AI model predictions at scale.",
  "3D Rendering": "Studio-grade VFX with predictable job durations.",
  "Medical AI":
    "HIPAA-compliant isolated GPU environments commanding premium rates.",
  "GPT-Class Training":
    "Frontier AI model training — H100/H200 cluster infrastructure.",
};

// ─── HOOKS ────────────────────────────────────────────────────
function useLiveNetworkEarnings() {
  const [v, setV] = useState(12_450.32);
  useEffect(() => {
    const t = setInterval(() => setV((p) => p + Math.random() * 4.2), 1000);
    return () => clearInterval(t);
  }, []);
  return v.toFixed(2);
}

function useLiveNodeEarnings(alloc: Allocation, dailyPct: number) {
  const HOURLY_RATE = dailyPct / 24;
  const PER_SECOND = (alloc.amount_invested * HOURLY_RATE) / 3600;
  const base = alloc.total_earned || 0;
  const elapsed =
    (Date.now() - new Date(alloc.updated_at || alloc.created_at).getTime()) /
    1000;
  const [live, setLive] = useState(base + PER_SECOND * elapsed);

  useEffect(() => {
    setLive(base + PER_SECOND * elapsed);
  }, [base]);
  useEffect(() => {
    const iv = setInterval(() => setLive((p) => p + PER_SECOND), 1000);
    return () => clearInterval(iv);
  }, [PER_SECOND]);

  useEffect(() => {
    const syncInterval = setInterval(async () => {
      try {
        if (live > (alloc.total_earned || 0)) {
          await supabase
            .from("node_allocations")
            .update({
              total_earned: Math.round(live * 100) / 100,
              updated_at: new Date().toISOString(),
            })
            .eq("id", alloc.id);
        }
      } catch (err) {
        console.error("[gpu-plans] earnings sync error:", err);
      }
    }, 60000);
    return () => clearInterval(syncInterval);
  }, [live, alloc.id]);

  return live;
}

function useCapacity(seed: number) {
  const [v, setV] = useState(() => 75 + ((seed * 17) % 22));
  useEffect(() => {
    const t = setInterval(
      () => setV(Math.floor(Math.random() * 20) + 78),
      90_000,
    );
    return () => clearInterval(t);
  }, []);
  return v;
}

// ─── HELPERS ──────────────────────────────────────────────────
function Pill({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${className}`}
    >
      {children}
    </span>
  );
}

function Disclaimer() {
  return (
    <div
      className="flex items-start gap-2 p-3 rounded-xl"
      style={{
        background: "rgba(245,158,11,0.06)",
        border: "1px solid rgba(245,158,11,0.18)",
      }}
    >
      <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
      <p className="text-amber-400/80 text-[11px] leading-relaxed">
        <strong className="text-amber-300">Risk Disclosure:</strong> Returns are
        not guaranteed. Projected figures are estimates based on historical GPU
        rental demand. Past performance is not indicative of future results.
      </p>
    </div>
  );
}

// ─── WITHDRAW MODAL (KYC enforced HERE, not at investment) ────
type PayoutInfo = {
  payout_registered: boolean;
  payout_account_name: string | null;
  payout_account_number: string | null;
  payout_bank_name: string | null;
  payout_gateway: string | null;
  kyc_verified: boolean;
  kyc_status: string | null;
};

function WithdrawModal({
  alloc,
  plan,
  liveEarned,
  userId,
  onClose,
  onSuccess,
  onGoVerify,
}: {
  alloc: Allocation;
  plan: Plan | undefined;
  liveEarned: number;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
  onGoVerify: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payoutInfo, setPayoutInfo] = useState<PayoutInfo | null>(null);
  const [loadingPayout, setLoadingPayout] = useState(true);

  const available = Math.max(0, liveEarned - (alloc.total_withdrawn || 0));
  const isContract = alloc.payment_model === "contract";
  const maturityDate = alloc.maturity_date
    ? new Date(alloc.maturity_date)
    : null;
  const contractMatured = maturityDate
    ? Date.now() >= maturityDate.getTime()
    : false;
  const canWithdraw = !isContract || contractMatured;
  const daysRemaining = maturityDate
    ? Math.max(0, Math.ceil((maturityDate.getTime() - Date.now()) / 86400000))
    : 0;
  const minWithdraw = 10;
  const amt = parseFloat(amount) || 0;
  const expectedDays = amt < 500 ? 1 : amt < 5000 ? 2 : amt < 50000 ? 5 : 7;
  const expectedDate = new Date(Date.now() + expectedDays * 86400000);
  const businessDayMessage = getBusinessDayMessage();
  const isBusinessDayNow = isBusinessDay();

  useEffect(() => {
    setLoadingPayout(true);
    supabase
      .from("users")
      .select(
        "payout_registered,payout_account_name,payout_account_number,payout_bank_name,payout_gateway,kyc_verified,kyc_status",
      )
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data) setPayoutInfo(data as PayoutInfo);
        setLoadingPayout(false);
      });
  }, [userId]);

  const kycOk = payoutInfo
    ? payoutInfo.kyc_verified === true || payoutInfo.kyc_status === "approved"
    : false;
  const hasPayoutAccount = !!(
    payoutInfo?.payout_registered && payoutInfo?.payout_account_number
  );

  async function handleWithdraw() {
    setError("");
    // ── KYC check ONLY at withdrawal ──────────────────────────
    if (!kycOk) {
      setError(
        "KYC verification is required before withdrawing. Please complete your identity verification first.",
      );
      return;
    }
    if (!hasPayoutAccount) {
      setError(
        "No payout account registered. Go to Verification → Payout Setup.",
      );
      return;
    }
    if (!isBusinessDayNow) {
      setError("Withdrawals are only available on business days (Mon–Fri).");
      return;
    }
    if (!pin || pin.length < 4) {
      setError("Please enter your PIN (4–6 digits)");
      return;
    }
    if (!amt || amt < minWithdraw) {
      setError(`Minimum withdrawal is $${minWithdraw}`);
      return;
    }
    if (amt > available) {
      setError(`Amount exceeds available earnings ($${available.toFixed(2)}).`);
      return;
    }

    // Verify PIN
    async function hashPin(v: string): Promise<string> {
      const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(v + userId),
      );
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    const providedHash = await hashPin(pin);
    const { data: userData } = await supabase
      .from("users")
      .select("pin_hash")
      .eq("id", userId)
      .single();
    if (!userData?.pin_hash || providedHash !== userData.pin_hash) {
      setError("Invalid PIN. Withdrawal cannot be processed.");
      return;
    }

    // Contract lock
    if (isContract && !contractMatured) {
      setError(
        `Contract is locked until ${maturityDate?.toLocaleDateString()}. ${daysRemaining} days remaining.`,
      );
      return;
    }

    // Balance check
    const { data: userBal } = await supabase
      .from("users")
      .select("balance_available")
      .eq("id", userId)
      .single();
    const userBalance = (userBal as any)?.balance_available ?? 0;
    if (amt > userBalance) {
      setError(
        `Amount exceeds your available balance ($${userBalance.toFixed(2)}).`,
      );
      return;
    }

    setLoading(true);
    try {
      const now = new Date().toISOString();
      const payoutAccount = payoutInfo!.payout_account_number!;
      const payoutGateway = payoutInfo!.payout_gateway || "manual";
      const payoutName = payoutInfo!.payout_account_name || "";
      const payoutBank = payoutInfo!.payout_bank_name || null;

      const { error: insertError } = await supabase.from("withdrawals").insert({
        user_id: userId,
        amount: amt,
        status: "queued",
        wallet_address: payoutAccount,
        payout_method: payoutGateway,
        payout_account_name: payoutName,
        payout_bank_name: payoutBank,
        tracking_status: "queued",
        node_allocation_id: alloc.id,
        expected_date: expectedDate.toISOString(),
        created_at: now,
      });
      if (insertError) throw new Error(insertError.message);

      await supabase
        .from("node_allocations")
        .update({
          total_withdrawn: (alloc.total_withdrawn || 0) + amt,
          updated_at: now,
        })
        .eq("id", alloc.id);

      const { data: u } = await supabase
        .from("users")
        .select("balance_available,wallet_balance,total_withdrawn")
        .eq("id", userId)
        .single();
      const curAvail = (u as any)?.balance_available ?? 0;
      const curWallet = (u as any)?.wallet_balance ?? 0;
      const curWithdrawn = (u as any)?.total_withdrawn ?? 0;
      await supabase
        .from("users")
        .update({
          balance_available: Math.max(0, curAvail - amt),
          wallet_balance: Math.max(0, curWallet - amt),
          total_withdrawn: curWithdrawn + amt,
          last_withdrawal_at: now,
        })
        .eq("id", userId);

      try {
        await recordWithdrawalLedger(
          supabase,
          userId,
          amt,
          payoutAccount,
          payoutGateway,
        );
      } catch {
        /* non-blocking */
      }
      try {
        await logWithdrawalEvent(supabase, userId, "withdrawal_requested", {
          amount: amt,
          payout_method: payoutGateway,
        });
      } catch {
        /* non-blocking */
      }
      onSuccess();
    } catch (e: any) {
      setError(e.message || "Withdrawal failed. Please try again.");
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
              <p className="text-white font-black">Withdraw Earnings</p>
              <p className="text-slate-500 text-xs">
                {plan?.name || alloc.plan_id} ·{" "}
                {isContract ? "Contract" : "Flexible"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {!canWithdraw ? (
            <div
              className="rounded-2xl p-5 text-center"
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.25)",
              }}
            >
              <Lock size={28} className="text-amber-400 mx-auto mb-3" />
              <p className="text-amber-300 font-black text-base">
                Capital Locked Until Maturity
              </p>
              <p className="text-amber-400/70 text-sm mt-2">
                Your contract matures on {maturityDate?.toLocaleDateString()}.
              </p>
              <p className="text-amber-300 text-xs mt-2 font-bold">
                {daysRemaining} days remaining · Earnings accruing daily
              </p>
            </div>
          ) : (
            <>
              {/* KYC gate inside withdrawal only */}
              {!loadingPayout && !kycOk && (
                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{
                    background: "rgba(245,158,11,0.08)",
                    border: "1px solid rgba(245,158,11,0.3)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <Shield
                      size={20}
                      className="text-amber-400 shrink-0 mt-0.5"
                    />
                    <div>
                      <p className="text-amber-300 font-black text-sm">
                        KYC Verification Required to Withdraw
                      </p>
                      <p className="text-amber-400/70 text-xs mt-1 leading-relaxed">
                        Your earnings are accruing normally. To withdraw funds,
                        you must first complete identity verification. This
                        protects your account and ensures funds reach you
                        safely.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onGoVerify}
                    className="w-full py-3 rounded-xl font-black text-sm text-white flex items-center justify-center gap-2"
                    style={{
                      background: "linear-gradient(135deg,#f59e0b,#d97706)",
                    }}
                  >
                    <FileCheck size={14} /> Complete KYC Verification{" "}
                    <ArrowRight size={13} />
                  </button>
                  <p className="text-slate-600 text-[10px] text-center">
                    Your invested funds and earnings are safe — verification
                    takes less than 5 minutes
                  </p>
                </div>
              )}

              {/* Payout account */}
              {!loadingPayout && kycOk && (
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(59,130,246,0.06)",
                    border: "1px solid rgba(59,130,246,0.2)",
                  }}
                >
                  <p className="text-slate-400 text-[10px] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <Shield size={10} className="text-blue-400" /> Registered
                    Payout Account
                  </p>
                  {hasPayoutAccount ? (
                    <div className="space-y-0.5">
                      <p className="text-white font-bold text-sm">
                        {payoutInfo!.payout_account_name || "—"}
                      </p>
                      {payoutInfo!.payout_bank_name && (
                        <p className="text-slate-400 text-xs">
                          {payoutInfo!.payout_bank_name}
                        </p>
                      )}
                      <p className="text-slate-500 text-xs font-mono">
                        {payoutInfo!.payout_account_number}
                      </p>
                      <p className="text-emerald-400 text-[10px] flex items-center gap-1 mt-1">
                        <CheckCircle size={9} /> KYC verified
                      </p>
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
              )}

              {/* Balances */}
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(16,185,129,0.08)",
                    border: "1px solid rgba(16,185,129,0.2)",
                  }}
                >
                  <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">
                    Total Earned
                  </p>
                  <p className="text-emerald-400 font-black text-xl tabular-nums">
                    ${liveEarned.toFixed(4)}
                  </p>
                </div>
                <div
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">
                    Available Now
                  </p>
                  <p className="text-white font-black text-xl">
                    ${available.toFixed(4)}
                  </p>
                </div>
              </div>

              {/* Amount + PIN — only show if KYC ok */}
              {kycOk && hasPayoutAccount && (
                <>
                  <div>
                    <label className="text-slate-300 text-sm font-bold block mb-2">
                      Amount to Withdraw (min ${minWithdraw})
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">
                        $
                      </span>
                      <input
                        type="number"
                        min={minWithdraw}
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

                  <div
                    className="rounded-xl p-4"
                    style={{
                      background: isBusinessDayNow
                        ? "rgba(16,185,129,0.08)"
                        : "rgba(239,68,68,0.08)",
                      border: isBusinessDayNow
                        ? "1px solid rgba(16,185,129,0.2)"
                        : "1px solid rgba(239,68,68,0.25)",
                    }}
                  >
                    <p
                      className={`text-sm font-bold flex items-center gap-2 ${isBusinessDayNow ? "text-emerald-400" : "text-red-400"}`}
                    >
                      <Clock size={14} />
                      {businessDayMessage}
                    </p>
                  </div>

                  <div>
                    <label className="text-slate-300 text-sm font-bold block mb-2">
                      Security PIN <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="password"
                      maxLength={6}
                      value={pin}
                      onChange={(e) =>
                        setPin(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="Enter your 4–6 digit PIN"
                      className="w-full px-4 py-3 rounded-xl text-lg font-bold text-center tracking-widest text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  {amt >= minWithdraw && amt <= available && (
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
                            desc: "Request received",
                            done: true,
                            active: false,
                          },
                          {
                            label: "Processing",
                            desc: "Under review by our team",
                            done: false,
                            active: true,
                          },
                          {
                            label: "In Transit",
                            desc:
                              amt < 500
                                ? "Same day dispatch"
                                : "Batch processed",
                            done: false,
                            active: false,
                          },
                          {
                            label: "Settled",
                            desc: `Expected ${expectedDate.toLocaleDateString()}`,
                            done: false,
                            active: false,
                          },
                        ].map((step) => (
                          <div
                            key={step.label}
                            className="flex items-start gap-3"
                          >
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
                              <p className="text-slate-600 text-[10px]">
                                {step.desc}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {error && (
                <div
                  className="rounded-xl p-3 flex items-start gap-2"
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.25)",
                  }}
                >
                  <AlertTriangle
                    size={14}
                    className="text-red-400 shrink-0 mt-0.5"
                  />
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {kycOk && (
                <button
                  onClick={handleWithdraw}
                  disabled={
                    loading ||
                    !amount ||
                    !hasPayoutAccount ||
                    loadingPayout ||
                    !pin ||
                    pin.length < 4 ||
                    !isBusinessDayNow
                  }
                  className="w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: "linear-gradient(135deg,#10b981,#059669)",
                  }}
                >
                  {loading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />{" "}
                      Processing...
                    </>
                  ) : (
                    <>
                      <Send size={16} /> Withdraw ${amount || "0.00"}
                    </>
                  )}
                </button>
              )}

              <p className="text-slate-600 text-[11px] text-center pb-2">
                Funds will be sent to your registered payout account.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PORTFOLIO CARD ───────────────────────────────────────────
function PortfolioCard({
  alloc,
  plan,
  userId,
  onWithdrawSuccess,
  onGoVerify,
}: {
  alloc: Allocation;
  plan: Plan | undefined;
  userId: string;
  onWithdrawSuccess: () => void;
  onGoVerify: () => void;
}) {
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dailyPct = plan?.daily_pct || 0.0013;
  const liveEarned = useLiveNodeEarnings(alloc, dailyPct);
  const cs = plan ? CS[plan.tier_color] || CS.slate : CS.slate;
  const isContract = alloc.payment_model === "contract";
  const now = new Date();
  const startDate = new Date(alloc.created_at);
  const maturityDate = alloc.maturity_date
    ? new Date(alloc.maturity_date)
    : null;
  const isMatured = maturityDate ? now >= maturityDate : false;
  const daysElapsed = Math.floor(
    (now.getTime() - startDate.getTime()) / 86400000,
  );
  const totalDays = maturityDate
    ? Math.ceil((maturityDate.getTime() - startDate.getTime()) / 86400000)
    : 0;
  const progressPct = maturityDate
    ? Math.min(100, (daysElapsed / totalDays) * 100)
    : 0;
  const daysRemaining = maturityDate
    ? Math.max(
        0,
        Math.ceil((maturityDate.getTime() - now.getTime()) / 86400000),
      )
    : 0;
  const totalWithdrawn = alloc.total_withdrawn || 0;
  const available = Math.max(0, liveEarned - totalWithdrawn);
  const canWithdraw = !isContract || isMatured;
  const HOURLY_RATE = dailyPct / 24;
  const perSecond = (alloc.amount_invested * HOURLY_RATE) / 3600;
  const perHour = alloc.amount_invested * HOURLY_RATE;
  const perDay = alloc.amount_invested * dailyPct;

  return (
    <>
      {showWithdraw && (
        <WithdrawModal
          alloc={alloc}
          plan={plan}
          liveEarned={liveEarned}
          userId={userId}
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => {
            setShowWithdraw(false);
            onWithdrawSuccess();
          }}
          onGoVerify={() => {
            setShowWithdraw(false);
            onGoVerify();
          }}
        />
      )}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "rgba(10,16,28,0.9)",
          border: `1px solid ${cs.border}`,
          boxShadow: `0 0 30px ${cs.glow}`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ background: cs.bg, borderBottom: `1px solid ${cs.border}` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                background: "rgba(0,0,0,0.3)",
                border: `1px solid ${cs.border}`,
              }}
            >
              <Cpu size={16} className={cs.accent} />
            </div>
            <div>
              <p className="text-white font-black text-sm">
                {plan?.name || alloc.plan_id}
              </p>
              <p className="text-slate-500 text-[10px]">
                {plan?.gpu_model || alloc.instance_type || ""} · Started{" "}
                {startDate.toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <span
              className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${isContract ? "bg-violet-900/20 border-violet-800/40 text-violet-400" : "bg-emerald-900/20 border-emerald-800/40 text-emerald-400"}`}
            >
              {isContract ? "📋 Contract" : "⚡ Flexible"}
            </span>
            {isMatured && (
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full border bg-emerald-900/30 border-emerald-700/50 text-emerald-400">
                Matured ✓
              </span>
            )}
            <span className="text-[10px] font-black px-2.5 py-1 rounded-full border bg-emerald-900/20 border-emerald-800/40 text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{" "}
              LIVE
            </span>
          </div>
        </div>

        {/* Live earnings */}
        <div
          className="px-5 py-4"
          style={{
            background:
              "linear-gradient(135deg,rgba(16,185,129,0.06),rgba(0,0,0,0))",
            borderBottom: `1px solid ${cs.border}`,
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                Total Accrued (Live)
              </p>
              <p className="text-emerald-400 font-black text-3xl tabular-nums">
                ${liveEarned.toFixed(6)}
              </p>
              <p className="text-emerald-500/60 text-[10px] mt-1">
                +${perSecond.toFixed(8)}/sec · +${perHour.toFixed(6)}/hr · +$
                {perDay.toFixed(4)}/day
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                Available
              </p>
              <p className="text-white font-black text-xl">
                ${available.toFixed(4)}
              </p>
              <p className="text-slate-600 text-[10px]">
                after ${totalWithdrawn.toFixed(2)} withdrawn
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: "Capital Invested",
                value: `$${alloc.amount_invested.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                icon: Wallet,
                color: "text-white",
              },
              {
                label: "Accrued Earnings",
                value: `$${liveEarned.toFixed(4)}`,
                icon: TrendingUp,
                color: "text-emerald-400",
              },
              {
                label: "Withdrawn",
                value: `$${totalWithdrawn.toFixed(2)}`,
                icon: ArrowUpRight,
                color: "text-blue-400",
              },
              {
                label: isContract ? "Locked Until" : "Available Now",
                value:
                  isContract && maturityDate
                    ? maturityDate.toLocaleDateString()
                    : `$${available.toFixed(4)}`,
                icon: isContract ? Lock : Banknote,
                color: "text-amber-400",
              },
            ].map(({ label, value, icon: Icon, color }) => (
              <div
                key={label}
                className="rounded-xl p-3"
                style={{
                  background: "rgba(15,23,42,0.8)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Icon size={11} className="text-slate-600" />
                  <p className="text-slate-500 text-[10px]">{label}</p>
                </div>
                <p className={`font-black text-sm ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          <div
            className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{
              background: "rgba(16,185,129,0.06)",
              border: "1px solid rgba(16,185,129,0.15)",
            }}
          >
            <div className="flex items-center gap-2">
              <Zap size={13} className="text-emerald-400" />
              <span className="text-slate-400 text-xs">
                Daily Accrual (est. 0.13%)
              </span>
            </div>
            <span className="text-emerald-400 font-black text-sm">
              +${perDay.toFixed(4)}{" "}
              <span className="text-slate-600 text-[10px] font-normal">
                / day
              </span>
            </span>
          </div>

          {isContract && maturityDate && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <Timer size={12} className="text-slate-500" />
                  <span className="text-slate-400 text-xs font-semibold">
                    Contract Progress
                  </span>
                </div>
                <span className="text-slate-400 text-xs">
                  {isMatured ? (
                    <span className="text-emerald-400 font-bold">
                      Fully Matured
                    </span>
                  ) : (
                    `${daysRemaining} days remaining`
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-800/80 overflow-hidden">
                <div
                  className="h-2 rounded-full transition-all duration-700"
                  style={{
                    width: `${progressPct}%`,
                    background: isMatured
                      ? "linear-gradient(90deg,#10b981,#34d399)"
                      : `linear-gradient(90deg,${cs.border},rgba(16,185,129,0.5))`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-600">
                <span>Started {startDate.toLocaleDateString()}</span>
                <span>{progressPct.toFixed(1)}% complete</span>
                <span>Matures {maturityDate.toLocaleDateString()}</span>
              </div>
            </div>
          )}

          {isContract && !isMatured && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-2.5 bg-amber-900/10 border border-amber-800/20">
              <Lock size={13} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-amber-400 text-xs">
                Capital and earnings locked until maturity on{" "}
                {maturityDate?.toLocaleDateString()}. Earnings are accruing
                daily in real time.
              </p>
            </div>
          )}
          {!isContract && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-2.5 bg-emerald-900/15 border border-emerald-800/30">
              <CheckCircle
                size={13}
                className="text-emerald-400 mt-0.5 shrink-0"
              />
              <p className="text-emerald-300 text-xs">
                Earnings accrue continuously at est. 0.13%/day. Withdraw anytime
                (min $10, KYC required).
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setShowWithdraw(true)}
              disabled={!canWithdraw || available < 10}
              className="flex-1 py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background:
                  canWithdraw && available >= 10
                    ? "linear-gradient(135deg,#10b981,#059669)"
                    : "rgba(100,116,139,0.2)",
                color: "white",
              }}
            >
              <ArrowUpRight size={15} />
              {!canWithdraw
                ? `Locked · ${daysRemaining}d left`
                : available < 10
                  ? "Min $10 to withdraw"
                  : `Withdraw $${available.toFixed(2)}`}
            </button>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="px-4 py-3.5 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-sm font-bold transition-all flex items-center gap-1"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{" "}
              Details
            </button>
          </div>

          {expanded && (
            <div
              className="rounded-xl p-4 space-y-1.5"
              style={{
                background: "rgba(15,23,42,0.6)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-3">
                Full Investment Details
              </p>
              {[
                ["Plan", plan?.name || alloc.plan_id],
                ["GPU", plan?.gpu_model || alloc.instance_type || "—"],
                ["Capital Invested", `$${alloc.amount_invested.toFixed(2)}`],
                [
                  "Payment Model",
                  isContract
                    ? `Contract — ${alloc.contract_label}`
                    : "Pay-as-you-go (Flexible)",
                ],
                ["Per Second", `$${perSecond.toFixed(8)}`],
                ["Per Day", `$${perDay.toFixed(4)}`],
                ["Status", alloc.status],
                ["Started", startDate.toLocaleString()],
                ...(isContract && maturityDate
                  ? [
                      ["Maturity Date", maturityDate.toLocaleString()],
                      [
                        "Est. Return Range",
                        `${alloc.contract_min_pct}%–${alloc.contract_max_pct}%`,
                      ],
                    ]
                  : []),
                ["Total Earned (Live)", `$${liveEarned.toFixed(6)}`],
                ["Total Withdrawn", `$${totalWithdrawn.toFixed(2)}`],
                ["Available to Withdraw", `$${available.toFixed(6)}`],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between items-start gap-4">
                  <span className="text-slate-600 text-xs shrink-0">{l}</span>
                  <span className="text-slate-300 text-xs text-right">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── PLAN CARD ────────────────────────────────────────────────
// KEY CHANGE: No KYC gate at investment time. Users can invest freely.
// KYC is only enforced inside WithdrawModal.
function PlanCard({
  plan,
  index,
  event,
  userAlloc,
  onWaitlist,
  onInvest,
  waitlisted,
}: {
  plan: Plan;
  index: number;
  event: DemandEvent | null;
  userAlloc: Allocation | null;
  onWaitlist: () => void;
  onInvest: (
    amount: number,
    itype: string,
    paymentModel: "flexible" | "contract",
    contractTerm?: (typeof CONTRACT_TERMS)[0],
  ) => void;
  waitlisted: boolean;
}) {
  const cs = CS[plan.tier_color] || CS.slate;
  const cap = useCapacity(index);
  const [amountStr, setAmountStr] = useState(String(plan.price_min));
  const amount = parseFloat(amountStr) || 0;
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const showFlexible =
    plan.payment_model === "flexible" || plan.payment_model === "both";
  const showContract =
    plan.payment_model === "contract" || plan.payment_model === "both";
  const [selectedTab, setSelectedTab] = useState<"flexible" | "contract">(
    showFlexible ? "flexible" : "contract",
  );
  const [selectedTerm, setSelectedTerm] = useState(CONTRACT_TERMS[0]);
  const [selectedPeriod, setSelectedPeriod] = useState(PERIODS[1]);
  const isSurge = event?.event_type === "surge" && event.is_active;
  const locked = plan.is_admin_locked;
  const waitlistOnly = plan.is_waitlist || plan.is_invite_only;

  const amountError =
    !amount || amount < plan.price_min
      ? `Minimum investment is $${plan.price_min.toLocaleString()}`
      : amount > plan.price_max
        ? `Maximum is $${(plan.price_max / 1_000_000).toFixed(0)}M`
        : null;

  const DAILY_PCT = plan.daily_pct;
  const HOURLY_PCT = plan.hourly_pct;
  const periodEarning =
    selectedPeriod.key === "hourly"
      ? amount * HOURLY_PCT
      : selectedPeriod.key === "daily"
        ? amount * DAILY_PCT
        : selectedPeriod.key === "weekly"
          ? amount * DAILY_PCT * 7
          : amount * DAILY_PCT * 30;

  const allPeriodEarnings = [
    {
      label: "Per Hour",
      value: amount * HOURLY_PCT,
      pct: "0.01%",
      highlight: selectedPeriod.key === "hourly",
    },
    {
      label: "Per Day",
      value: amount * DAILY_PCT,
      pct: "0.13%",
      highlight: selectedPeriod.key === "daily",
    },
    {
      label: "Per Week",
      value: amount * DAILY_PCT * 7,
      pct: "0.91%",
      highlight: selectedPeriod.key === "weekly",
    },
    {
      label: "Per Month",
      value: amount * DAILY_PCT * 30,
      pct: "3.9%",
      highlight: selectedPeriod.key === "monthly",
    },
  ];

  const termReturns = plan.contract_returns?.[selectedTerm.key] || {
    min_pct: 52,
    max_pct: 93,
  };
  const contractEarnMin = (amount * termReturns.min_pct) / 100;
  const contractEarnMax = (amount * termReturns.max_pct) / 100;

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        background: open ? cs.bg : "rgba(10,16,28,0.7)",
        border: `1px solid ${open ? cs.border : "rgba(255,255,255,0.07)"}`,
        boxShadow: open ? `0 0 40px ${cs.glow}` : "none",
      }}
    >
      {isSurge && (
        <div
          className="flex items-center gap-2.5 px-5 py-2.5 text-xs font-bold"
          style={{
            background: "rgba(16,185,129,0.12)",
            borderBottom: "1px solid rgba(16,185,129,0.2)",
          }}
        >
          <Zap size={12} className="text-emerald-400 animate-pulse" />
          <span className="text-emerald-300">
            ⚡ {event!.title} — Earnings boosted {event!.multiplier}× this
            period
          </span>
        </div>
      )}

      <div
        className="flex items-start gap-4 p-5 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: cs.bg, border: `1px solid ${cs.border}` }}
        >
          <Cpu size={18} className={cs.accent} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="text-white font-black text-base tracking-tight">
              {plan.name}
            </h3>
            {locked && (
              <Pill className="border-rose-700/50 text-rose-400 bg-rose-900/20">
                Institutional
              </Pill>
            )}
            {waitlistOnly && !locked && (
              <Pill className="border-amber-700/50 text-amber-400 bg-amber-900/20">
                Waitlist
              </Pill>
            )}
            {userAlloc && (
              <Pill className="border-emerald-700/50 text-emerald-400 bg-emerald-900/20">
                ● Active
              </Pill>
            )}
            {showFlexible && (
              <Pill className="border-blue-700/50 text-blue-400 bg-blue-900/20">
                Pay-as-you-go
              </Pill>
            )}
            {showContract && (
              <Pill className="border-violet-700/50 text-violet-400 bg-violet-900/20">
                Contract
              </Pill>
            )}
          </div>
          <p className="text-slate-500 text-xs">
            {plan.subtitle} · {plan.gpu_model}
          </p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className={`text-sm font-black ${cs.accent}`}>
              est. 0.13% / day
            </span>
            <span className="text-slate-500 text-xs">·</span>
            <span className="text-slate-400 text-xs">
              Min ${plan.price_min.toLocaleString()}
            </span>
            <span className="text-slate-600 text-xs">{plan.vram} VRAM</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-white font-black text-sm">
              ${plan.price_min.toLocaleString()}
            </p>
            <p className="text-slate-600 text-[10px]">minimum</p>
          </div>
          <div
            className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all ${open ? "rotate-180" : ""}`}
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <ChevronDown size={14} className="text-slate-400" />
          </div>
        </div>
      </div>

      <div className="px-5 pb-4">
        <div className="flex justify-between text-[10px] text-slate-600 mb-1">
          <span>Cluster Utilisation</span>
          <span>{cap}%</span>
        </div>
        <div className="h-1 rounded-full bg-slate-800/80 overflow-hidden">
          <div
            className="h-1 rounded-full transition-all duration-1000"
            style={{
              width: `${cap}%`,
              background: `linear-gradient(90deg,${cs.border},${cs.glow})`,
            }}
          />
        </div>
      </div>

      {open && (
        <div
          className="border-t px-5 py-5 space-y-5"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          {/* Investment notice — no KYC required to invest */}
          <div
            className="rounded-xl px-4 py-3 flex items-start gap-2.5"
            style={{
              background: "rgba(16,185,129,0.06)",
              border: "1px solid rgba(16,185,129,0.15)",
            }}
          >
            <CheckCircle
              size={13}
              className="text-emerald-400 mt-0.5 shrink-0"
            />
            <p className="text-emerald-300 text-xs leading-relaxed">
              <strong>Invest now, verify later.</strong> You can fund your GPU
              node immediately. KYC identity verification is only required when
              you want to withdraw your earnings.
            </p>
          </div>

          {showFlexible && showContract && (
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedTab("flexible")}
                className={`flex-1 py-2.5 rounded-xl text-sm font-black border transition-all ${selectedTab === "flexible" ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300" : "border-slate-800 text-slate-500 hover:border-slate-600"}`}
              >
                ⚡ Pay-as-you-go
              </button>
              <button
                onClick={() => setSelectedTab("contract")}
                className={`flex-1 py-2.5 rounded-xl text-sm font-black border transition-all ${selectedTab === "contract" ? "bg-violet-500/10 border-violet-500/40 text-violet-300" : "border-slate-800 text-slate-500 hover:border-slate-600"}`}
              >
                📋 Contract
              </button>
            </div>
          )}

          {(selectedTab === "flexible" || !showContract) && showFlexible && (
            <div
              className="rounded-xl p-4 space-y-5"
              style={{
                background: "rgba(16,185,129,0.04)",
                border: "1px solid rgba(16,185,129,0.15)",
              }}
            >
              <div>
                <p className="text-emerald-300 font-black text-sm mb-1">
                  ⚡ Pay-as-you-go (Flexible)
                </p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Rent GPU compute on your own terms. Earnings accrue
                  continuously. No lock-in. KYC required only to withdraw.
                </p>
              </div>
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-2">
                  Investment Amount
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">
                    $
                  </span>
                  <input
                    type="number"
                    min={plan.price_min}
                    max={plan.price_max}
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    onBlur={(e) => {
                      if (
                        !e.target.value ||
                        parseFloat(e.target.value) < plan.price_min
                      )
                        setAmountStr(String(plan.price_min));
                    }}
                    placeholder={`Min $${plan.price_min}`}
                    className="w-full pl-9 pr-4 py-4 rounded-xl text-xl font-black text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
                    style={{ appearance: "textfield" }}
                  />
                </div>
                {amountError && amount > 0 && (
                  <p className="text-red-400 text-xs mt-1.5">{amountError}</p>
                )}
                {!amountError && amount > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {[100, 500, 1000, 5000]
                      .filter((v) => v >= plan.price_min && v <= plan.price_max)
                      .map((v) => (
                        <button
                          key={v}
                          onClick={() => setAmountStr(String(v))}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-700 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-400 transition-all"
                        >
                          ${v.toLocaleString()}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              {!amountError && amount > 0 && (
                <>
                  <div>
                    <label className="text-slate-400 text-xs font-bold block mb-2">
                      View earnings by period
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {PERIODS.map((p) => (
                        <button
                          key={p.key}
                          onClick={() => setSelectedPeriod(p)}
                          className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${selectedPeriod.key === p.key ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300" : "border-slate-800 text-slate-500 hover:border-slate-600"}`}
                        >
                          {p.label.split(" ").pop()}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div
                    className="rounded-2xl p-5 text-center"
                    style={{
                      background: "rgba(16,185,129,0.08)",
                      border: "1px solid rgba(16,185,129,0.25)",
                    }}
                  >
                    <p className="text-slate-400 text-xs mb-1">
                      {selectedPeriod.label}
                    </p>
                    <p className="text-emerald-400 font-black text-4xl">
                      ${periodEarning.toFixed(periodEarning < 0.01 ? 5 : 2)}
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      at {selectedPeriod.pct} rate on ${amount.toLocaleString()}
                    </p>
                    <p className="text-amber-400/60 text-[10px] mt-2">
                      Estimate based on current demand — not guaranteed
                    </p>
                  </div>
                  <Disclaimer />
                </>
              )}
            </div>
          )}

          {(selectedTab === "contract" || !showFlexible) && showContract && (
            <div
              className="rounded-xl p-4 space-y-5"
              style={{
                background: "rgba(139,92,246,0.04)",
                border: "1px solid rgba(139,92,246,0.15)",
              }}
            >
              <div>
                <p className="text-violet-300 font-black text-sm mb-1">
                  📋 Contract-Based (Fixed Term)
                </p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Commit your capital for a fixed period. Higher estimated
                  returns for longer commitments.{" "}
                  <strong className="text-slate-300">
                    KYC required only to withdraw at maturity.
                  </strong>
                </p>
              </div>
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-2">
                  Select Contract Term
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CONTRACT_TERMS.map((term) => {
                    const ret = plan.contract_returns?.[term.key] || {
                      min_pct: 52,
                      max_pct: 93,
                    };
                    return (
                      <button
                        key={term.key}
                        onClick={() => setSelectedTerm(term)}
                        className={`p-3 rounded-xl border text-left transition-all ${selectedTerm.key === term.key ? "bg-violet-500/10 border-violet-500/40" : "bg-slate-900/40 border-slate-800/60 hover:border-slate-700"}`}
                      >
                        <p
                          className={`text-sm font-black ${selectedTerm.key === term.key ? "text-violet-300" : "text-slate-300"}`}
                        >
                          {term.label}
                        </p>
                        <p className="text-[10px] text-emerald-400 mt-0.5">
                          {ret.min_pct}%–{ret.max_pct}% est.
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-2">
                  Investment Amount
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">
                    $
                  </span>
                  <input
                    type="number"
                    min={plan.price_min}
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    onBlur={(e) => {
                      if (
                        !e.target.value ||
                        parseFloat(e.target.value) < plan.price_min
                      )
                        setAmountStr(String(plan.price_min));
                    }}
                    placeholder={`Min $${plan.price_min}`}
                    className="w-full pl-9 pr-4 py-4 rounded-xl text-xl font-black text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-violet-500 transition-colors"
                    style={{ appearance: "textfield" }}
                  />
                </div>
              </div>
              {!amountError && amount > 0 && (
                <>
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{ border: "1px solid rgba(139,92,246,0.3)" }}
                  >
                    <div
                      className="px-4 py-3"
                      style={{
                        background: "rgba(139,92,246,0.1)",
                        borderBottom: "1px solid rgba(139,92,246,0.2)",
                      }}
                    >
                      <p className="text-violet-300 text-sm font-black">
                        Estimated returns at {selectedTerm.label} maturity
                      </p>
                    </div>
                    <div style={{ background: "rgba(8,13,24,0.8)" }}>
                      <div className="px-4 py-4 grid grid-cols-2 gap-3">
                        <div
                          className="rounded-xl p-3 text-center"
                          style={{
                            background: "rgba(16,185,129,0.06)",
                            border: "1px solid rgba(16,185,129,0.15)",
                          }}
                        >
                          <p className="text-slate-400 text-[10px] mb-1">
                            Min Est. Return
                          </p>
                          <p className="text-emerald-400 font-black text-2xl">
                            ${contractEarnMin.toFixed(2)}
                          </p>
                          <p className="text-slate-500 text-[10px] mt-0.5">
                            {termReturns.min_pct}% of ${amount.toLocaleString()}
                          </p>
                        </div>
                        <div
                          className="rounded-xl p-3 text-center"
                          style={{
                            background: "rgba(16,185,129,0.1)",
                            border: "1px solid rgba(16,185,129,0.25)",
                          }}
                        >
                          <p className="text-slate-400 text-[10px] mb-1">
                            Max Est. Return
                          </p>
                          <p className="text-emerald-300 font-black text-2xl">
                            ${contractEarnMax.toFixed(2)}
                          </p>
                          <p className="text-slate-500 text-[10px] mt-0.5">
                            {termReturns.max_pct}% of ${amount.toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Disclaimer />
                </>
              )}
            </div>
          )}

          <div className="flex gap-1.5 flex-wrap">
            {[
              ["specs", "GPU Specs", Server],
              ["usecases", "Use Cases", Layers],
              ["risk", "Risk", AlertTriangle],
              ["legal", "Legal", BookOpen],
            ].map(([id, lbl, Icon]: any) => (
              <button
                key={id}
                onClick={() => setSection(section === id ? null : id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${section === id ? "text-white border-slate-600 bg-slate-700/60" : "text-slate-500 border-slate-800/50 hover:border-slate-600 hover:text-slate-300"}`}
              >
                <Icon size={10} />
                {lbl}
              </button>
            ))}
          </div>

          {section && (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div
                className="p-4 space-y-3"
                style={{ background: "rgba(8,13,24,0.85)" }}
              >
                {section === "specs" && (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["Model", plan.gpu_model, Cpu],
                      ["VRAM", plan.vram, HardDrive],
                      ["TDP", plan.tdp, Thermometer],
                      ["Architecture", plan.architecture, Layers],
                      ["TFLOPS", `${plan.tflops} TF`, Gauge],
                      ["Base Rate", "est. 0.13% / day", Zap],
                    ].map(([lbl, val, Icon]: any) => (
                      <div
                        key={lbl}
                        className="rounded-lg p-2.5 space-y-1"
                        style={{
                          background: "rgba(15,23,42,0.9)",
                          border: "1px solid rgba(255,255,255,0.05)",
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <Icon size={10} className="text-slate-600" />
                          <span className="text-slate-600 text-[9px] uppercase tracking-wider">
                            {lbl}
                          </span>
                        </div>
                        <p
                          className={`text-xs font-bold leading-tight ${cs.accent}`}
                        >
                          {val}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {section === "usecases" && (
                  <div className="space-y-2">
                    {plan.use_cases.map((uc) => (
                      <div
                        key={uc}
                        className="flex items-start gap-3 p-3 rounded-lg"
                        style={{
                          background: "rgba(15,23,42,0.7)",
                          border: "1px solid rgba(255,255,255,0.05)",
                        }}
                      >
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            background: cs.bg,
                            border: `1px solid ${cs.border}`,
                          }}
                        >
                          <Zap size={12} className={cs.accent} />
                        </div>
                        <div>
                          <p className="text-white text-xs font-bold">{uc}</p>
                          <p className="text-slate-500 text-[11px] mt-0.5">
                            {UC_DESC[uc] ||
                              "High-performance GPU compute allocation."}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {section === "risk" && (
                  <div className="space-y-3">
                    <Disclaimer />
                    <p className="text-slate-400 text-xs leading-relaxed">
                      GPU compute demand is variable. Estimated returns are
                      based on historical data only and are not guaranteed.
                    </p>
                  </div>
                )}
                {section === "legal" && (
                  <div className="space-y-2">
                    {[
                      [
                        "Not a Security",
                        "Node allocations are not classified as securities under applicable regulations.",
                      ],
                      [
                        "No Guaranteed Returns",
                        "All projected return figures are estimates. We make no guarantee of minimum returns.",
                      ],
                      [
                        "KYC at Withdrawal",
                        "Identity verification is required before withdrawing funds, not before investing.",
                      ],
                    ].map(([t, d]: any) => (
                      <div
                        key={t}
                        className="flex gap-2.5 p-3 rounded-lg"
                        style={{
                          background: "rgba(15,23,42,0.7)",
                          border: "1px solid rgba(255,255,255,0.05)",
                        }}
                      >
                        <BookOpen
                          size={11}
                          className="text-slate-500 mt-0.5 shrink-0"
                        />
                        <div>
                          <p className="text-white text-xs font-bold">{t}</p>
                          <p className="text-slate-400 text-[11px] mt-0.5">
                            {d}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div
            className="pt-2 border-t"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            {locked ? (
              <button
                disabled
                className="w-full py-3 rounded-xl text-sm font-black bg-slate-800/60 text-slate-600 flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <Lock size={14} /> Institutional Access Only
              </button>
            ) : waitlistOnly && !userAlloc ? (
              waitlisted ? (
                <div className="text-center py-3 rounded-xl text-sm font-bold text-amber-400 bg-amber-900/10 border border-amber-800/20">
                  ✓ You're on the waitlist — we'll notify you when a spot opens
                </div>
              ) : (
                <button
                  onClick={onWaitlist}
                  className="w-full py-3 rounded-xl text-sm font-black bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center justify-center gap-2 transition-all"
                >
                  <Clock size={14} /> Join Waitlist
                </button>
              )
            ) : (
              // NO KYC CHECK HERE — anyone can invest
              <button
                disabled={!!amountError || !amount}
                onClick={() => {
                  if (amountError || !amount) return;
                  const isFlexible =
                    selectedTab === "flexible" || !showContract;
                  onInvest(
                    amount,
                    plan.instance_type,
                    isFlexible ? "flexible" : "contract",
                    isFlexible ? undefined : selectedTerm,
                  );
                }}
                className="w-full py-4 rounded-xl text-base font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background:
                    amountError || !amount
                      ? undefined
                      : selectedTab === "contract"
                        ? "linear-gradient(135deg,rgba(139,92,246,0.9),rgba(99,102,241,0.7))"
                        : `linear-gradient(135deg,${cs.hex},rgba(16,185,129,0.7))`,
                }}
              >
                {selectedTab === "contract" ? "📋" : "⚡"} Invest $
                {amount > 0 ? amount.toLocaleString() : "—"}{" "}
                {selectedTab === "contract"
                  ? `· ${selectedTerm.label} Contract`
                  : ""}{" "}
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────
export default function GPUPlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [events, setEvents] = useState<DemandEvent[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [activeNotif, setActiveNotif] = useState<Notification | null>(null);
  const [activeTab, setActiveTab] = useState<"plans" | "portfolio">("plans");
  const networkEarnings = useLiveNetworkEarnings();
  const { kycStatus } = useKycStatus(userId);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function goToVerification() {
    if (typeof window !== "undefined")
      sessionStorage.setItem("kyc_redirect", "/dashboard/gpu-plans");
    router.push("/dashboard/verification");
  }

  const loadAll = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
      router.push("/auth/signin");
      return;
    }
    const user = session.user;
    setUserId(user.id);
    setUserEmail(user.email || "");

    const [
      { data: p },
      { data: ev },
      { data: al },
      { data: wl },
      { data: notifs },
    ] = await Promise.all([
      supabase
        .from("gpu_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
      supabase.from("demand_events").select("*").eq("is_active", true),
      supabase
        .from("node_allocations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("gpu_waitlist")
        .select("plan_id,status")
        .eq("user_id", user.id),
      supabase
        .from("user_notifications")
        .select("*")
        .eq("user_id", user.id)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    setPlans(p || []);
    setEvents(ev || []);
    setAllocations(al || []);
    setWaitlist(wl || []);
    if (notifs && notifs.length > 0) setActiveNotif(notifs[0]);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Realtime: new allocations appear instantly
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("node_allocs_rt")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "node_allocations",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setAllocations((prev) => [payload.new as Allocation, ...prev]);
          showToast("New GPU node investment activated! 🚀");
          setActiveTab("portfolio");
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "node_allocations",
          filter: `user_id=eq.${userId}`,
        },
        (payload) =>
          setAllocations((prev) =>
            prev.map((a) =>
              a.id === (payload.new as Allocation).id
                ? (payload.new as Allocation)
                : a,
            ),
          ),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  // Earnings sync every 60s
  useEffect(() => {
    if (!userId || allocations.length === 0 || plans.length === 0) return;
    const iv = setInterval(async () => {
      for (const alloc of allocations.filter((a) => a.status === "active")) {
        const plan = plans.find((p) => p.id === alloc.plan_id);
        const dailyPct = plan?.daily_pct || 0.0013;
        const PER_SECOND = (alloc.amount_invested * (dailyPct / 24)) / 3600;
        const base = alloc.total_earned || 0;
        const elapsed =
          (Date.now() -
            new Date(alloc.updated_at || alloc.created_at).getTime()) /
          1000;
        await supabase
          .from("node_allocations")
          .update({
            total_earned: base + PER_SECOND * elapsed,
            updated_at: new Date().toISOString(),
          })
          .eq("id", alloc.id);
      }
      const totalEarned = allocations
        .filter((a) => a.status === "active")
        .reduce((sum, alloc) => {
          const plan = plans.find((p) => p.id === alloc.plan_id);
          const dailyPct = plan?.daily_pct || 0.0013;
          const PER_SECOND = (alloc.amount_invested * (dailyPct / 24)) / 3600;
          const base = alloc.total_earned || 0;
          const elapsed =
            (Date.now() -
              new Date(alloc.updated_at || alloc.created_at).getTime()) /
            1000;
          return sum + base + PER_SECOND * elapsed;
        }, 0);
      const totalWithdrawn = allocations.reduce(
        (s, a) => s + (a.total_withdrawn || 0),
        0,
      );
      await supabase
        .from("users")
        .update({
          balance_available: Math.max(0, totalEarned - totalWithdrawn),
          total_earned: totalEarned,
        })
        .eq("id", userId);
    }, 60000);
    return () => clearInterval(iv);
  }, [userId, allocations, plans]);

  async function joinWaitlist(planId: string) {
    if (!userId) return;
    const { error } = await supabase
      .from("gpu_waitlist")
      .upsert(
        {
          user_id: userId,
          plan_id: planId,
          email: userEmail,
          status: "pending",
        },
        { onConflict: "user_id,plan_id" },
      );
    if (!error) {
      showToast("You're on the waitlist!");
      loadAll();
    } else showToast("Could not join waitlist.", false);
  }

  function invest(
    planId: string,
    amount: number,
    itype: string,
    paymentModel: "flexible" | "contract",
    contractTerm?: (typeof CONTRACT_TERMS)[0],
  ) {
    // No KYC check here — users invest freely
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const termKey = contractTerm?.key || "6m";
    const termReturns = plan.contract_returns?.[
      termKey as keyof typeof plan.contract_returns
    ] || { min_pct: 52, max_pct: 93 };
    const params = new URLSearchParams({
      node: planId,
      name: plan.name,
      price: amount.toString(),
      daily: (amount * plan.daily_pct).toFixed(6),
      itype,
      gpu: plan.gpu_model,
      vram: plan.vram,
      paymentModel,
      ...(paymentModel === "contract" && contractTerm
        ? {
            contractMonths: contractTerm.months.toString(),
            contractLabel: contractTerm.label,
            contractMinPct: termReturns.min_pct.toString(),
            contractMaxPct: termReturns.max_pct.toString(),
            lockInMonths: contractTerm.months.toString(),
            lockInLabel: contractTerm.label,
            lockInMultiplier: "1",
          }
        : {
            lockInMonths: "0",
            lockInLabel: "Flexible",
            lockInMultiplier: "1",
          }),
    });
    if (typeof window !== "undefined")
      sessionStorage.setItem("checkout_redirect", "/dashboard/gpu-plans");
    router.push(`/dashboard/checkout?${params.toString()}`);
  }

  if (loading)
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#06080f" }}
      >
        <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );

  const eventByPlan = (id: string) =>
    events.find((e) => e.plan_id === id && e.is_active) || null;
  const allocByPlan = (id: string) =>
    allocations.find((a) => a.plan_id === id) || null;
  const isOnWaitlist = (id: string) => waitlist.some((w) => w.plan_id === id);
  const activeAllocs = allocations.filter(
    (a) => a.status === "active" || a.status === "matured",
  );
  const isKycApproved = kycStatus === "approved";

  return (
    <div
      className="flex min-h-screen text-white"
      style={{ background: "#06080f" }}
    >
      <DashboardNavigation />

      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-2xl flex items-center gap-2 max-w-sm ${toast.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
        >
          {toast.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}{" "}
          {toast.msg}
        </div>
      )}

      {activeNotif && (
        <div
          className="fixed bottom-24 md:bottom-6 right-4 z-50 max-w-sm w-full rounded-2xl p-4 shadow-2xl"
          style={{
            background: "rgb(10,16,28)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Bell size={14} className="text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold">
                {activeNotif.title}
              </p>
              {activeNotif.body && (
                <p className="text-slate-400 text-xs mt-0.5">
                  {activeNotif.body}
                </p>
              )}
            </div>
            <button
              onClick={async () => {
                await supabase
                  .from("user_notifications")
                  .update({ read_at: new Date().toISOString() })
                  .eq("id", activeNotif.id);
                setActiveNotif(null);
              }}
              className="text-slate-600 hover:text-white shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 md:px-8 pt-6 pb-36 md:pb-16 space-y-10">
          {/* HERO */}
          <div className="relative pt-4">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{" "}
                Live Network
              </span>
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 bg-slate-800/60 border border-slate-700/40 px-3 py-1 rounded-full">
                24h: ${networkEarnings}
              </span>
              {/* KYC status shown as info, not a blocker */}
              <span
                className={`text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full flex items-center gap-1.5 ${isKycApproved ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20" : "text-slate-400 bg-slate-800/60 border border-slate-700/40"}`}
              >
                <Shield size={9} />
                {isKycApproved
                  ? "KYC Verified — Withdrawals Enabled"
                  : kycStatus === "pending"
                    ? "KYC Under Review"
                    : "KYC Needed for Withdrawals"}
              </span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
              GPU Cloud Mining
              <br />
              <span className="text-emerald-400">Infrastructure</span>
            </h1>
            <p className="text-slate-400 mt-4 max-w-2xl leading-relaxed text-sm md:text-base">
              Invest now — no verification needed to start. Your GPU node begins
              earning the moment your payment is confirmed. Complete KYC only
              when you're ready to withdraw.
            </p>
            <div className="flex flex-wrap gap-3 mt-6">
              {MARKET_STATS.map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-2.5 bg-slate-900/60 border border-slate-800/60 rounded-xl px-3.5 py-2.5"
                >
                  <Icon size={13} className="text-emerald-400" />
                  <div>
                    <p className="text-white font-black text-sm">{value}</p>
                    <p className="text-slate-600 text-[10px]">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* KYC info banner — informational only, not a blocker */}
          {!isKycApproved && (
            <div
              className="rounded-2xl p-5 flex items-start gap-5"
              style={{
                background: "rgba(59,130,246,0.06)",
                border: "1px solid rgba(59,130,246,0.2)",
              }}
            >
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: "rgba(59,130,246,0.12)",
                  border: "1px solid rgba(59,130,246,0.3)",
                }}
              >
                <Info size={22} className="text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="font-black text-base text-blue-300">
                  Invest Now — Verify When You're Ready to Withdraw
                </p>
                <p className="text-slate-400 text-sm mt-1.5 leading-relaxed">
                  {kycStatus === "pending"
                    ? "Your KYC verification is under review (24–48 hrs). You can invest and earn right now — withdrawals unlock automatically once approved."
                    : "You can invest in any GPU node plan immediately without identity verification. KYC is only required when you want to withdraw your earnings — protecting you while keeping the investing process frictionless."}
                </p>
                {kycStatus !== "pending" && (
                  <button
                    onClick={goToVerification}
                    className="mt-3 text-xs font-bold text-blue-400 hover:text-blue-300 underline underline-offset-2"
                  >
                    Complete KYC now to enable withdrawals →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TABS */}
          <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-1.5 w-fit">
            <button
              onClick={() => setActiveTab("plans")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "plans" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
            >
              <Server size={14} /> GPU Node Plans
            </button>
            <button
              onClick={() => setActiveTab("portfolio")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "portfolio" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
            >
              <BarChart2 size={14} /> My Portfolio
              {activeAllocs.length > 0 && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                  {activeAllocs.length}
                </span>
              )}
            </button>
          </div>

          {/* PORTFOLIO TAB */}
          {activeTab === "portfolio" && (
            <section>
              <div className="mb-8">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                  My Portfolio
                </span>
                <h2 className="text-white font-black text-2xl md:text-3xl mt-3">
                  Active Node Investments
                </h2>
                <p className="text-slate-500 text-sm mt-1.5">
                  Real-time earnings tracking — KYC required only when
                  withdrawing
                </p>
              </div>
              {activeAllocs.length === 0 ? (
                <div
                  className="rounded-2xl p-10 text-center"
                  style={{
                    background: "rgba(15,23,42,0.5)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <Package size={32} className="text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 font-semibold text-sm">
                    No active investments yet
                  </p>
                  <p className="text-slate-600 text-xs mt-1">
                    Select a GPU node plan below to get started
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      {
                        label: "Total Invested",
                        value: `$${activeAllocs.reduce((s, a) => s + a.amount_invested, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                        icon: Wallet,
                        color: "text-white",
                      },
                      {
                        label: "Daily Accrual",
                        value: `$${activeAllocs
                          .reduce((s, a) => {
                            const plan = plans.find((p) => p.id === a.plan_id);
                            return (
                              s +
                              (plan
                                ? a.amount_invested * plan.daily_pct
                                : a.amount_invested * 0.0013)
                            );
                          }, 0)
                          .toFixed(4)}`,
                        icon: Zap,
                        color: "text-emerald-400",
                      },
                      {
                        label: "Active Nodes",
                        value: `${activeAllocs.length}`,
                        icon: Server,
                        color: "text-blue-400",
                      },
                      {
                        label: "Contracts",
                        value: `${activeAllocs.filter((a) => a.payment_model === "contract").length}`,
                        icon: Lock,
                        color: "text-violet-400",
                      },
                    ].map(({ label, value, icon: Icon, color }) => (
                      <div
                        key={label}
                        className="rounded-xl p-4"
                        style={{
                          background: "rgba(15,23,42,0.8)",
                          border: "1px solid rgba(255,255,255,0.07)",
                        }}
                      >
                        <div className="flex items-center gap-1.5 mb-2.5">
                          <Icon size={12} className="text-slate-600" />
                          <p className="text-slate-500 text-[10px] uppercase tracking-wide">
                            {label}
                          </p>
                        </div>
                        <p
                          className={`font-black text-lg leading-none ${color}`}
                        >
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  {activeAllocs.map((alloc) => (
                    <PortfolioCard
                      key={alloc.id}
                      alloc={alloc}
                      plan={plans.find((p) => p.id === alloc.plan_id)}
                      userId={userId || ""}
                      onWithdrawSuccess={() => {
                        showToast(
                          "Withdrawal queued! Track it in Financials → Withdrawals.",
                        );
                        loadAll();
                      }}
                      onGoVerify={goToVerification}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* PLANS TAB */}
          {activeTab === "plans" && (
            <>
              <section>
                <div className="mb-8">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                    How It Works
                  </span>
                  <h2 className="text-white font-black text-2xl md:text-3xl mt-3">
                    Two Ways to Earn
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    className="rounded-2xl p-5"
                    style={{
                      background: "rgba(16,185,129,0.04)",
                      border: "1px solid rgba(16,185,129,0.15)",
                    }}
                  >
                    <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mb-4">
                      <Zap size={18} className="text-emerald-400" />
                    </div>
                    <h3 className="text-white font-black text-base mb-2">
                      ⚡ Pay-as-you-go
                    </h3>
                    <p className="text-slate-400 text-xs leading-relaxed mb-3">
                      Earn at{" "}
                      <strong className="text-emerald-300">
                        est. 0.13%/day
                      </strong>
                      . No lock-in. KYC only needed to withdraw.
                    </p>
                    <div className="space-y-1.5 text-xs">
                      {[
                        "Invest immediately — no KYC required",
                        "Withdraw earnings anytime (min $10, KYC required)",
                        "No penalties, no commitment",
                        "Earnings start the moment node activates",
                      ].map((f) => (
                        <div key={f} className="flex items-center gap-2">
                          <CheckCircle
                            size={10}
                            className="text-emerald-400 shrink-0"
                          />
                          <span className="text-slate-300">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div
                    className="rounded-2xl p-5"
                    style={{
                      background: "rgba(139,92,246,0.04)",
                      border: "1px solid rgba(139,92,246,0.15)",
                    }}
                  >
                    <div className="w-10 h-10 bg-violet-500/10 border border-violet-500/20 rounded-xl flex items-center justify-center mb-4">
                      <Lock size={18} className="text-violet-400" />
                    </div>
                    <h3 className="text-white font-black text-base mb-2">
                      📋 Fixed-Term Contract
                    </h3>
                    <p className="text-slate-400 text-xs leading-relaxed mb-3">
                      Commit 6–24 months for higher estimated returns.{" "}
                      <strong className="text-slate-300">
                        KYC required at maturity to withdraw.
                      </strong>
                    </p>
                    <div className="space-y-1.5 text-xs">
                      {[
                        "6 months: est. 52%–93%",
                        "12 months: est. 130%–250%",
                        "24 months: est. 800%–1200%",
                        "Capital + earnings released at maturity (KYC required to withdraw)",
                      ].map((f) => (
                        <div key={f} className="flex items-center gap-2">
                          <CheckCircle
                            size={10}
                            className="text-violet-400 shrink-0"
                          />
                          <span className="text-slate-300">{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <Disclaimer />
                </div>
              </section>

              <section>
                <div className="mb-8">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                    GPU Node Tiers
                  </span>
                  <h2 className="text-white font-black text-2xl md:text-3xl mt-3">
                    Select Your Node
                  </h2>
                  <p className="text-slate-500 text-sm mt-1.5">
                    No KYC required to invest. Verify your identity only when
                    you're ready to withdraw.
                  </p>
                </div>
                <div className="space-y-3">
                  {plans.map((plan, i) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      index={i}
                      event={eventByPlan(plan.id)}
                      userAlloc={allocByPlan(plan.id)}
                      waitlisted={isOnWaitlist(plan.id)}
                      onWaitlist={() => joinWaitlist(plan.id)}
                      onInvest={(amount, itype, paymentModel, contractTerm) =>
                        invest(
                          plan.id,
                          amount,
                          itype,
                          paymentModel,
                          contractTerm,
                        )
                      }
                    />
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-8">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                    Investor Stories
                  </span>
                  <h2 className="text-white font-black text-2xl md:text-3xl mt-3">
                    Results from the Community
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {TESTIMONIALS.map((t) => (
                    <div
                      key={t.name}
                      className="rounded-2xl p-5 flex flex-col justify-between"
                      style={{
                        background: "rgba(15,23,42,0.7)",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      <div>
                        <div className="flex text-amber-400 gap-0.5 mb-3">
                          {Array(5)
                            .fill(0)
                            .map((_, i) => (
                              <Star key={i} size={12} fill="currentColor" />
                            ))}
                        </div>
                        <p className="text-slate-300 text-xs leading-relaxed">
                          "{t.text}"
                        </p>
                      </div>
                      <div className="mt-4 pt-4 border-t border-slate-800/60 flex items-center justify-between">
                        <div>
                          <p className="text-white font-bold text-sm">
                            {t.name} {t.country}
                          </p>
                          <p className="text-slate-500 text-[11px]">{t.role}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-emerald-400 font-black">
                            {t.earnings}
                          </p>
                          <p className="text-slate-600 text-[10px]">
                            {t.period}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
