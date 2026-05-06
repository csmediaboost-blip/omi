"use client";
// app/dashboard/gpu-plans/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// UPDATED: Mining-based system (Pay-As-You-Go flexible plans)
// Changes from previous version:
//  1. Profit = random $0.29–$0.40/day (Foundation), scaled by tier & period
//  2. Users can start mining WITHOUT KYC — KYC only required at withdrawal
//  3. Mining has a period (hourly/daily/weekly/monthly); stops when done
//  4. No expected % ROI shown — live $ earnings shown during mining
//  5. Per-node ROI tiers: Foundation 1.0× → H100 PCIe 1.4×
//  6. Language: "Invest" → "Mine", buttons → "Start Mining"
//  7. DB: see gpu-plans-migration.sql
//  8. Internal rate rotation — users never see %
//  9. More investors → lower rate; fewer → higher (background only)
// 11. Contracts preserved as-is
// 12. Nothing else removed
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cacheService } from "@/lib/cache-service";
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
  Bell,
  Thermometer,
  Server,
  HardDrive,
  BookOpen,
  Wallet,
  ArrowUpRight,
  BarChart2,
  Timer,
  FileCheck,
  UserCheck,
  Info,
  RefreshCw,
  Send,
  ChevronUp,
  Pickaxe,
  Coins,
  PlayCircle,
  RotateCcw,
} from "lucide-react";
import { useKycStatus, KYCStatus } from "@/lib/useKycStatus";
import {
  isKYCApproved as checkKYCApproved,
  runWithdrawalSecurityChecks,
  atomicDeductBalance,
  refundBalance,
  logWithdrawalEvent,
  recordWithdrawalLedger,
  type UserSecurityProfile,
  type WithdrawalFraudCheck,
} from "@/lib/withdrawal-security";
import {
  MINING_PERIODS,
  PERIOD_DURATIONS_MS,
  BASE_DAILY_MIN,
  BASE_DAILY_MAX,
  TIER_MULTIPLIERS,
  getDisplayProfitRange,
  computePerSecondEarnings,
  type MiningPeriodInfo,
} from "@/lib/mining-service";

// ─── TYPES ────────────────────────────────────────────────────────────────────
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
  // Legacy % fields (still used for CONTRACT plans)
  hourly_pct: number;
  daily_pct: number;
  referral_pct: number;
  // New mining fields
  base_daily_profit_min: number; // e.g. 0.29
  base_daily_profit_max: number; // e.g. 0.40
  roi_tier_multiplier: number; // 1.00 → 1.40
  tier_index: number;
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

type WithdrawalPenalty = {
  has_penalty: boolean;
  penalty_multiplier: number;
  penalty_expires_at?: Date;
};

type Allocation = {
  id: string;
  plan_id: string;
  amount_invested: number;
  status: string;
  withdrawal_penalty?: WithdrawalPenalty;
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
  // New mining fields
  mining_period?: string;
  mining_ends_at?: string;
  final_profit?: number;
  mining_completed?: boolean;
  rate_factor_used?: number;
  capital_returned?: boolean;
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

// ─── CONTRACT TERMS (preserved) ───────────────────────────────────────────────
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

// ─── COLOR SCHEME MAP ─────────────────────────────────────────────────────────
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
    text: "I started with the Foundation Node at $200. Within 60 days I had enough to upgrade to a higher tier.",
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

// ─── HOOKS ────────────────────────────────────────────────────────────────────
function useLiveNetworkEarnings() {
  const [v, setV] = useState(12_450.32);
  useEffect(() => {
    const t = setInterval(() => setV((p) => p + Math.random() * 4.2), 1000);
    return () => clearInterval(t);
  }, []);
  return v.toFixed(2);
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

// ─── LIVE MINING EARNINGS HOOK ────────────────────────────────────────────────
// For FLEXIBLE plans: ticks per-second based on total period profit
// Shows $ earned — no % rate visible to user
function useLiveMiningEarnings(alloc: Allocation, plan: Plan | undefined) {
  const isFlexible = alloc.payment_model === "flexible";
  const isMiningComplete = alloc.mining_completed || alloc.status === "matured";

  // If mining is complete, show the final profit (static)
  const finalProfit = alloc.final_profit ?? alloc.total_earned ?? 0;

  // Compute total expected profit for this session based on stored rate_factor
  // The rate_factor was set when the user started mining — internal only
  const rateFactor = alloc.rate_factor_used ?? 0.86; // default mid-range
  const planDailyMin =
    (plan?.base_daily_profit_min ?? BASE_DAILY_MIN) *
    (plan?.roi_tier_multiplier ?? 1.0);
  const planDailyMax =
    (plan?.base_daily_profit_max ?? BASE_DAILY_MAX) *
    (plan?.roi_tier_multiplier ?? 1.0);
  const dailyProfit = planDailyMin + rateFactor * (planDailyMax - planDailyMin);

  const period = alloc.mining_period ?? "daily";

  // Import the multiplier logic inline (avoids circular import issues)
  const MULTIPLIERS: Record<string, number> = {
    hourly: 0.8 / 24,
    daily: 1.0,
    weekly: 7 * 1.1,
    monthly: 30 * 1.25,
  };
  const periodMultiplier = MULTIPLIERS[period] ?? 1.0;
  const totalPeriodProfit = dailyProfit * periodMultiplier;
  const periodMs = PERIOD_DURATIONS_MS[period] ?? PERIOD_DURATIONS_MS.daily;
  const perSecond = totalPeriodProfit / (periodMs / 1000);

  // Base from what's already been recorded in DB
  const base = alloc.total_earned ?? 0;
  const lastUpdate = alloc.updated_at || alloc.created_at;
  const elapsedSeconds = (Date.now() - new Date(lastUpdate).getTime()) / 1000;

  const [live, setLive] = useState(
    isMiningComplete ? finalProfit : base + perSecond * elapsedSeconds,
  );

  useEffect(() => {
    if (isMiningComplete) {
      setLive(finalProfit);
      return;
    }
    setLive(base + perSecond * elapsedSeconds);
  }, [base, isMiningComplete, finalProfit]);

  // Tick every second
  useEffect(() => {
    if (isMiningComplete || !isFlexible) return;
    const iv = setInterval(() => setLive((p) => p + perSecond), 1000);
    return () => clearInterval(iv);
  }, [perSecond, isMiningComplete, isFlexible]);

  // Sync to DB every 60s (only while mining is active)
  useEffect(() => {
    if (isMiningComplete || !isFlexible) return;
    const syncInterval = setInterval(async () => {
      try {
        if (live > (alloc.total_earned ?? 0)) {
          await supabase
            .from("node_allocations")
            .update({
              total_earned: Math.round(live * 1_000_000) / 1_000_000,
              updated_at: new Date().toISOString(),
            })
            .eq("id", alloc.id);
        }
      } catch (err) {
        console.error("[mining] Earnings sync error:", err);
      }
    }, 60_000);
    return () => clearInterval(syncInterval);
  }, [live, alloc.id, isMiningComplete, isFlexible]);

  // CONTRACT plans: use old per-second logic based on daily_pct
  if (!isFlexible) {
    return (
      base +
      ((plan?.daily_pct ?? 0.0013) / 24 / 3600) *
        alloc.amount_invested *
        elapsedSeconds
    );
  }

  return isMiningComplete ? finalProfit : live;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
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
        <strong className="text-amber-300">Risk Disclosure:</strong> Mining
        rewards are variable and not guaranteed. Projected figures are estimates
        based on historical GPU rental demand. Past performance is not
        indicative of future results.
      </p>
    </div>
  );
}

// ─── MINING PROGRESS BADGE ────────────────────────────────────────────────────
function MiningProgressBadge({ alloc }: { alloc: Allocation }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [progressPct, setProgressPct] = useState(0);

  useEffect(() => {
    if (!alloc.mining_ends_at) return;
    const endTime = new Date(alloc.mining_ends_at).getTime();
    const startTime = new Date(alloc.created_at).getTime();
    const totalMs = endTime - startTime;

    function update() {
      const now = Date.now();
      const remaining = endTime - now;
      if (remaining <= 0) {
        setTimeLeft("Complete");
        setProgressPct(100);
        return;
      }
      const pct = Math.min(100, ((totalMs - remaining) / totalMs) * 100);
      setProgressPct(pct);

      const h = Math.floor(remaining / 3_600_000);
      const m = Math.floor((remaining % 3_600_000) / 60_000);
      const s = Math.floor((remaining % 60_000) / 1_000);
      if (h > 24) {
        const d = Math.floor(h / 24);
        setTimeLeft(`${d}d ${h % 24}h remaining`);
      } else if (h > 0) {
        setTimeLeft(`${h}h ${m}m remaining`);
      } else {
        setTimeLeft(`${m}m ${s}s remaining`);
      }
    }

    update();
    const iv = setInterval(update, 1_000);
    return () => clearInterval(iv);
  }, [alloc.mining_ends_at, alloc.created_at]);

  if (!alloc.mining_ends_at) return null;

  const isComplete = alloc.mining_completed;

  return (
    <div
      className="rounded-xl p-3 space-y-2"
      style={{
        background: isComplete
          ? "rgba(16,185,129,0.08)"
          : "rgba(16,185,129,0.05)",
        border: isComplete
          ? "1px solid rgba(16,185,129,0.3)"
          : "1px solid rgba(16,185,129,0.15)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isComplete ? (
            <CheckCircle size={12} className="text-emerald-400" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
          )}
          <span className="text-emerald-300 text-xs font-bold">
            {isComplete ? "Mining Complete" : "Mining Active"}
          </span>
        </div>
        <span className="text-slate-400 text-[10px]">{timeLeft}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-1.5 rounded-full transition-all duration-1000"
          style={{
            width: `${progressPct}%`,
            background: isComplete
              ? "linear-gradient(90deg,#10b981,#34d399)"
              : "linear-gradient(90deg,#10b981,rgba(16,185,129,0.5))",
          }}
        />
      </div>
    </div>
  );
}

// ─── WITHDRAW MODAL ───────────────────────────────────────────────────────────
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
}: {
  alloc: Allocation;
  plan: Plan | undefined;
  liveEarned: number;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
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

  // For flexible plans: can only withdraw after mining_completed
  const miningComplete = alloc.mining_completed || alloc.status === "matured";
  const canWithdraw = isContract ? contractMatured : miningComplete;

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
        "payout_registered, payout_account_name, payout_account_number, payout_bank_name, payout_gateway, kyc_verified, kyc_status",
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

  // Mining not yet complete for flexible plans
  const miningTimeLeft = alloc.mining_ends_at
    ? Math.max(0, new Date(alloc.mining_ends_at).getTime() - Date.now())
    : 0;

  async function handleWithdraw() {
    setError("");
    if (!isBusinessDayNow) {
      const day = new Date().getDay();
      const dayName = day === 0 ? "Sunday" : "Saturday";
      setError(
        `Withdrawals are only available on business days (Mon–Fri). It's currently ${dayName}. Please try again on Monday.`,
      );
      return;
    }
    if (!pin || pin.length < 4) {
      setError("Please enter your PIN (4–6 digits)");
      return;
    }
    async function hashPin(pinValue: string): Promise<string> {
      const encoder = new TextEncoder();
      const data = encoder.encode(pinValue + userId);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    const providedPinHash = await hashPin(pin);
    const { data: userData } = await supabase
      .from("users")
      .select("pin_hash")
      .eq("id", userId)
      .single();
    if (!userData?.pin_hash || providedPinHash !== userData.pin_hash) {
      setError("Invalid PIN. Withdrawal cannot be processed.");
      return;
    }
    if (!kycOk) {
      setError(
        "KYC verification required before withdrawing. Go to Verification section.",
      );
      logWithdrawalEvent(supabase, userId, "withdrawal_blocked", {
        reason: "KYC not verified",
        amount: amt,
      }).catch(() => {});
      return;
    }
    if (!hasPayoutAccount) {
      setError(
        "No payout account registered. Go to Verification → Payout Setup.",
      );
      logWithdrawalEvent(supabase, userId, "withdrawal_blocked", {
        reason: "No payout account",
        amount: amt,
      }).catch(() => {});
      return;
    }
    if (!amt || amt < minWithdraw) {
      setError(`Minimum withdrawal is $${minWithdraw}`);
      return;
    }
    if (amt > available) {
      setError(`Amount exceeds available balance ($${available.toFixed(2)}).`);
      return;
    }
    const { data: userBal, error: balErr } = await supabase
      .from("users")
      .select("balance_available")
      .eq("id", userId)
      .single();
    if (balErr || !userBal) {
      setError("Unable to verify balance. Please try again.");
      return;
    }
    const userBalance = (userBal as any)?.balance_available ?? 0;
    if (amt > userBalance) {
      setError(
        `Amount exceeds your available balance ($${userBalance.toFixed(2)}).`,
      );
      return;
    }

    setLoading(true);
    try {
      const payoutAccount = payoutInfo!.payout_account_number!;
      const payoutGateway = payoutInfo!.payout_gateway || "manual";
      const payoutName = payoutInfo!.payout_account_name || "";
      const payoutBank = payoutInfo!.payout_bank_name || null;
      const now = new Date().toISOString();

      if (isContract && !contractMatured) {
        throw new Error(
          `Contract is locked until ${maturityDate?.toLocaleDateString()}. Days remaining: ${daysRemaining}`,
        );
      }

      const fullPayload: Record<string, any> = {
        user_id: userId,
        amount: amt,
        status: "queued",
        created_at: now,
        payout_method: payoutGateway,
        payout_account_name: payoutName,
        payout_bank_name: payoutBank,
        tracking_status: "queued",
        node_allocation_id: alloc.id,
        expected_date: expectedDate.toISOString(),
        wallet_address: payoutAccount,
      };

      let insertError: any = null;
      const result1 = await supabase.from("withdrawals").insert(fullPayload);
      insertError = result1.error;

      if (insertError) {
        const errMsg = insertError.message || "";
        if (errMsg.includes("wallet_address")) {
          const { wallet_address, ...withoutWallet } = fullPayload;
          const result2 = await supabase
            .from("withdrawals")
            .insert(withoutWallet);
          insertError = result2.error;
        }
        if (insertError) {
          const minimalPayload = {
            user_id: userId,
            amount: amt,
            status: "queued",
            created_at: now,
          };
          const result3 = await supabase
            .from("withdrawals")
            .insert(minimalPayload);
          insertError = result3.error;
        }
      }

      if (insertError) {
        logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
          reason: insertError.message,
          amount: amt,
        }).catch(() => {});
        throw new Error(insertError.message || "Withdrawal insert failed.");
      }

      await supabase
        .from("node_allocations")
        .update({
          total_withdrawn: (alloc.total_withdrawn || 0) + amt,
          updated_at: now,
        })
        .eq("id", alloc.id);

      const { data: u } = await supabase
        .from("users")
        .select("balance_available, wallet_balance, total_withdrawn")
        .eq("id", userId)
        .single();

      if (u) {
        const currentAvailable = (u as any)?.balance_available ?? 0;
        const currentWallet = (u as any)?.wallet_balance ?? 0;
        const totalWithdrawnPrev = (u as any)?.total_withdrawn ?? 0;
        await supabase
          .from("users")
          .update({
            balance_available: Math.max(0, currentAvailable - amt),
            wallet_balance: Math.max(0, currentWallet - amt),
            total_withdrawn: totalWithdrawnPrev + amt,
            last_withdrawal_at: now,
          })
          .eq("id", userId);
      }

      try {
        await recordWithdrawalLedger(
          supabase,
          userId,
          amt,
          payoutAccount,
          payoutGateway,
        );
      } catch {}

      try {
        await logWithdrawalEvent(supabase, userId, "withdrawal_requested", {
          amount: amt,
          payout_method: payoutGateway,
          payout_account: payoutAccount.slice(0, 12) + "...",
          expected_date: expectedDate.toISOString(),
          node_allocation_id: alloc.id,
        });
      } catch {}

      onSuccess();
    } catch (e: any) {
      setError(e.message || "Withdrawal failed. Please try again.");
      logWithdrawalEvent(supabase, userId, "withdrawal_failed", {
        reason: e.message,
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
                {alloc.plan_id} · {isContract ? "Contract" : "Flexible Mining"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white flex-shrink-0 ml-2"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Flexible — mining not yet complete */}
          {!isContract && !miningComplete ? (
            <div
              className="rounded-2xl p-5 text-center"
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.25)",
              }}
            >
              <Pickaxe size={28} className="text-amber-400 mx-auto mb-3" />
              <p className="text-amber-300 font-black text-base">
                Mining Still Active
              </p>
              <p className="text-amber-400/70 text-sm mt-2">
                Your mining session is still running. Withdraw becomes available
                once the mining period completes and earnings are credited to
                your wallet.
              </p>
              {alloc.mining_ends_at && (
                <p className="text-amber-300 text-xs mt-3 font-bold">
                  Completes: {new Date(alloc.mining_ends_at).toLocaleString()}
                </p>
              )}
            </div>
          ) : !canWithdraw && isContract ? (
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
              {loadingPayout ? (
                <div
                  className="rounded-xl p-4 flex items-center gap-3"
                  style={{
                    background: "rgba(59,130,246,0.06)",
                    border: "1px solid rgba(59,130,246,0.2)",
                  }}
                >
                  <RefreshCw size={14} className="text-blue-400 animate-spin" />
                  <p className="text-slate-400 text-sm">
                    Loading payout account...
                  </p>
                </div>
              ) : (
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
                      <p className="text-blue-400 text-[10px] capitalize mt-0.5">
                        via {payoutInfo!.payout_gateway || "registered account"}
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
              )}

              {!loadingPayout && !kycOk && (
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
                {!isBusinessDayNow && (
                  <p className="text-red-400/70 text-xs mt-1">
                    Withdrawals are only processed on business days (Monday to
                    Friday).
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
                <p className="text-slate-500 text-xs mt-1">
                  Your PIN is required to complete the withdrawal for security.
                </p>
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
                          amt < 500 ? "Same day dispatch" : "Batch processed",
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
                          <p className="text-slate-600 text-[10px]">
                            {step.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-slate-500 text-[10px]">
                    {amt < 500
                      ? "Small withdrawals settle within 24 hours"
                      : amt < 5000
                        ? "Medium: 24–48 hours"
                        : "Large: 3–7 business days"}
                  </p>
                </div>
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

              <button
                onClick={handleWithdraw}
                disabled={
                  loading ||
                  !amount ||
                  !hasPayoutAccount ||
                  !kycOk ||
                  loadingPayout ||
                  !pin ||
                  pin.length < 4 ||
                  !isBusinessDayNow
                }
                className="w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg,#10b981,#059669)",
                }}
                title={
                  !isBusinessDayNow
                    ? "Withdrawals only available on business days (Mon–Fri)"
                    : !pin || pin.length < 4
                      ? "Enter valid PIN"
                      : ""
                }
              >
                {loading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />{" "}
                    Processing...
                  </>
                ) : !isBusinessDayNow ? (
                  <>
                    <Clock size={16} /> Only available on business days
                  </>
                ) : !pin || pin.length < 4 ? (
                  <>
                    <Lock size={16} /> Enter PIN to continue
                  </>
                ) : (
                  <>
                    <Send size={16} /> Withdraw ${amount || "0.00"}
                  </>
                )}
              </button>

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

// ─── PORTFOLIO CARD ───────────────────────────────────────────────────────────
function PortfolioCard({
  alloc,
  plan,
  userId,
  onWithdrawSuccess,
  onStartNewMining,
}: {
  alloc: Allocation;
  plan: Plan | undefined;
  userId: string;
  onWithdrawSuccess: () => void;
  onStartNewMining: () => void;
}) {
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const liveEarned = useLiveMiningEarnings(alloc, plan);

  const cs = plan ? CS[plan.tier_color] || CS.slate : CS.slate;
  const isContract = alloc.payment_model === "contract";
  const now = new Date();
  const startDate = new Date(alloc.created_at);
  const maturityDate = alloc.maturity_date
    ? new Date(alloc.maturity_date)
    : null;
  const isMatured = maturityDate ? now >= maturityDate : false;
  const miningComplete = alloc.mining_completed || alloc.status === "matured";
  const miningEndsAt = alloc.mining_ends_at
    ? new Date(alloc.mining_ends_at)
    : null;

  const totalWithdrawn = alloc.total_withdrawn || 0;
  const available = Math.max(0, liveEarned - totalWithdrawn);

  // For flexible: can withdraw only after mining completes
  const canWithdraw = isContract ? isMatured : miningComplete;

  // Contract-specific
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

  // Per-second rate for display (flexible only)
  const rateFactor = alloc.rate_factor_used ?? 0.86;
  const planDailyMin =
    (plan?.base_daily_profit_min ?? BASE_DAILY_MIN) *
    (plan?.roi_tier_multiplier ?? 1.0);
  const planDailyMax =
    (plan?.base_daily_profit_max ?? BASE_DAILY_MAX) *
    (plan?.roi_tier_multiplier ?? 1.0);
  const dailyProfit = planDailyMin + rateFactor * (planDailyMax - planDailyMin);

  const MULTIPLIERS: Record<string, number> = {
    hourly: 0.8 / 24,
    daily: 1.0,
    weekly: 7 * 1.1,
    monthly: 30 * 1.25,
  };
  const period = alloc.mining_period ?? "daily";
  const periodMultiplier = MULTIPLIERS[period] ?? 1.0;
  const totalPeriodProfit = dailyProfit * periodMultiplier;
  const periodMs = PERIOD_DURATIONS_MS[period] ?? PERIOD_DURATIONS_MS.daily;
  const perSecond = miningComplete ? 0 : totalPeriodProfit / (periodMs / 1000);
  const perHour = perSecond * 3600;

  // Contract rates
  const contractDailyPct = plan?.daily_pct ?? 0.0013;
  const contractPerDay = alloc.amount_invested * contractDailyPct;

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
              {isContract ? (
                <Cpu size={16} className={cs.accent} />
              ) : (
                <Pickaxe size={16} className={cs.accent} />
              )}
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
          <div className="flex gap-2 items-center flex-wrap justify-end">
            <span
              className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${isContract ? "bg-violet-900/20 border-violet-800/40 text-violet-400" : "bg-emerald-900/20 border-emerald-800/40 text-emerald-400"}`}
            >
              {isContract ? "📋 Contract" : "⛏️ Mining"}
            </span>
            {miningComplete && !isContract && (
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full border bg-emerald-900/30 border-emerald-700/50 text-emerald-400">
                Complete ✓
              </span>
            )}
            {isMatured && isContract && (
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full border bg-emerald-900/30 border-emerald-700/50 text-emerald-400">
                Matured ✓
              </span>
            )}
            {!miningComplete && !isContract && (
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full border bg-emerald-900/20 border-emerald-800/40 text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{" "}
                LIVE
              </span>
            )}
          </div>
        </div>

        {/* Live earnings banner */}
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
                {miningComplete ? "Total Mined (Final)" : "Mined So Far (Live)"}
              </p>
              <p className="text-emerald-400 font-black text-3xl tabular-nums">
                ${liveEarned.toFixed(6)}
              </p>
              {!miningComplete && !isContract && (
                <p className="text-emerald-500/60 text-[10px] mt-1">
                  +${perSecond.toFixed(8)}/sec · +${perHour.toFixed(6)}/hr
                </p>
              )}
              {miningComplete && (
                <p className="text-emerald-400/60 text-[10px] mt-1">
                  Mining session complete · Capital returned to wallet
                </p>
              )}
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
          {/* Mining progress (flexible only) */}
          {!isContract && <MiningProgressBadge alloc={alloc} />}

          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: "Capital Staked",
                value: `$${alloc.amount_invested.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                icon: Wallet,
                color: "text-white",
              },
              {
                label: "Coins Mined",
                value: `$${liveEarned.toFixed(4)}`,
                icon: Coins,
                color: "text-emerald-400",
              },
              {
                label: "Withdrawn",
                value: `$${totalWithdrawn.toFixed(2)}`,
                icon: ArrowUpRight,
                color: "text-blue-400",
              },
              {
                label: isContract
                  ? "Locked Until"
                  : miningComplete
                    ? "Status"
                    : "Mining Until",
                value:
                  isContract && maturityDate
                    ? maturityDate.toLocaleDateString()
                    : isContract
                      ? "Flexible"
                      : miningComplete
                        ? "Complete ✓"
                        : miningEndsAt
                          ? miningEndsAt.toLocaleDateString()
                          : "—",
                icon: isContract
                  ? Lock
                  : miningComplete
                    ? CheckCircle
                    : Pickaxe,
                color: miningComplete ? "text-emerald-400" : "text-amber-400",
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

          {/* Mining period info (flexible) */}
          {!isContract && !miningComplete && (
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{
                background: "rgba(16,185,129,0.06)",
                border: "1px solid rgba(16,185,129,0.15)",
              }}
            >
              <div className="flex items-center gap-2">
                <Pickaxe size={13} className="text-emerald-400" />
                <span className="text-slate-400 text-xs">Mining Period</span>
              </div>
              <span className="text-emerald-400 font-black text-sm capitalize">
                {alloc.mining_period ?? "Daily"} session
              </span>
            </div>
          )}

          {/* Contract progress */}
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
              {alloc.contract_min_pct && alloc.contract_max_pct && (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div
                    className="rounded-lg p-2.5 text-center"
                    style={{
                      background: "rgba(16,185,129,0.06)",
                      border: "1px solid rgba(16,185,129,0.15)",
                    }}
                  >
                    <p className="text-slate-500 text-[9px] uppercase">
                      Min Return ({alloc.contract_min_pct}%)
                    </p>
                    <p className="text-emerald-400 font-black text-sm">
                      $
                      {(
                        (alloc.amount_invested * alloc.contract_min_pct) /
                        100
                      ).toFixed(2)}
                    </p>
                  </div>
                  <div
                    className="rounded-lg p-2.5 text-center"
                    style={{
                      background: "rgba(16,185,129,0.1)",
                      border: "1px solid rgba(16,185,129,0.25)",
                    }}
                  >
                    <p className="text-slate-500 text-[9px] uppercase">
                      Max Return ({alloc.contract_max_pct}%)
                    </p>
                    <p className="text-emerald-300 font-black text-sm">
                      $
                      {(
                        (alloc.amount_invested * alloc.contract_max_pct) /
                        100
                      ).toFixed(2)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Status messages */}
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
          {isContract && isMatured && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-2.5 bg-emerald-900/15 border border-emerald-800/30">
              <CheckCircle
                size={13}
                className="text-emerald-400 mt-0.5 shrink-0"
              />
              <p className="text-emerald-300 text-xs">
                Contract fully matured. Withdraw your capital and all earnings
                below.
              </p>
            </div>
          )}
          {!isContract && miningComplete && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-2.5 bg-emerald-900/15 border border-emerald-800/30">
              <CheckCircle
                size={13}
                className="text-emerald-400 mt-0.5 shrink-0"
              />
              <p className="text-emerald-300 text-xs">
                Mining session complete. Your capital + earnings have been
                credited to your wallet. Withdraw below or start a new mining
                session.
              </p>
            </div>
          )}
          {!isContract && !miningComplete && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-2.5 bg-emerald-900/15 border border-emerald-800/30">
              <Pickaxe size={13} className="text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-emerald-300 text-xs">
                Mining is active. Earnings accumulate continuously. Your capital
                and profits will be returned to your wallet when the mining
                period ends.
              </p>
            </div>
          )}

          {/* Actions */}
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
              {!isContract && !miningComplete
                ? "Mining in Progress…"
                : isContract && !isMatured
                  ? `Locked · ${daysRemaining}d left`
                  : available < 10
                    ? "Min $10 to withdraw"
                    : `Withdraw $${available.toFixed(2)}`}
            </button>

            {/* Start New Mining (flexible, after completion) */}
            {!isContract && miningComplete && (
              <button
                onClick={onStartNewMining}
                className="px-4 py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all"
                style={{
                  background:
                    "linear-gradient(135deg,rgba(16,185,129,0.3),rgba(16,185,129,0.1))",
                  border: "1px solid rgba(16,185,129,0.4)",
                  color: "#10b981",
                }}
              >
                <RotateCcw size={14} /> New Session
              </button>
            )}

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
                ["VRAM", plan?.vram || "—"],
                ["Capital Staked", `$${alloc.amount_invested.toFixed(2)}`],
                [
                  "Payment Model",
                  isContract
                    ? `Contract — ${alloc.contract_label}`
                    : `Mining — ${alloc.mining_period ?? "daily"} session`,
                ],
                ...(!isContract
                  ? [
                      ["Mining Period", alloc.mining_period ?? "daily"],
                      ["Mining Started", startDate.toLocaleString()],
                      ...(miningEndsAt
                        ? [["Mining Ends", miningEndsAt.toLocaleString()]]
                        : []),
                      [
                        "Session Status",
                        miningComplete ? "Complete ✓" : "Active ⛏️",
                      ],
                    ]
                  : []),
                ...(isContract && maturityDate
                  ? [
                      ["Maturity Date", maturityDate.toLocaleString()],
                      [
                        "Days Remaining",
                        isMatured ? "Matured ✅" : `${daysRemaining} days`,
                      ],
                      [
                        "Est. Return Range",
                        `${alloc.contract_min_pct}%–${alloc.contract_max_pct}%`,
                      ],
                    ]
                  : []),
                ["Coins Mined (Live)", `$${liveEarned.toFixed(6)}`],
                ["Total Withdrawn", `$${totalWithdrawn.toFixed(2)}`],
                ["Available to Withdraw", `$${available.toFixed(6)}`],
                ...(miningComplete
                  ? [
                      [
                        "Final Profit Credited",
                        `$${(alloc.final_profit ?? liveEarned).toFixed(6)}`,
                      ],
                    ]
                  : []),
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

// ─── KYC GATE MODAL ───────────────────────────────────────────────────────────
// NOTE: This is now only shown when WITHDRAWING, not when starting mining.
function KYCGateModal({
  kycStatus,
  onClose,
  onGoVerify,
}: {
  kycStatus: KYCStatus;
  onClose: () => void;
  onGoVerify: () => void;
}) {
  const isPending = kycStatus === "pending";
  const isRejected = kycStatus === "rejected";
  const accent = isPending ? "#f59e0b" : isRejected ? "#ef4444" : "#10b981";
  const accentDim = isPending
    ? "rgba(245,158,11,0.08)"
    : isRejected
      ? "rgba(239,68,68,0.08)"
      : "rgba(16,185,129,0.08)";
  const accentBorder = isPending
    ? "rgba(245,158,11,0.25)"
    : isRejected
      ? "rgba(239,68,68,0.25)"
      : "rgba(16,185,129,0.25)";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(10px)" }}
    >
      <div
        className="relative w-full max-w-lg rounded-3xl overflow-hidden"
        style={{
          background: "rgb(10,15,26)",
          border: `1px solid ${accentBorder}`,
          boxShadow: `0 0 80px ${accentDim}`,
        }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg,transparent,${accent},transparent)`,
          }}
        />
        <div
          className="px-8 pt-8 pb-6"
          style={{
            background: accentDim,
            borderBottom: `1px solid ${accentBorder}`,
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"
          >
            <X size={14} className="text-slate-400" />
          </button>
          <div className="flex items-start gap-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: accentDim,
                border: `1px solid ${accentBorder}`,
              }}
            >
              {isPending ? (
                <Clock size={30} style={{ color: accent }} />
              ) : isRejected ? (
                <AlertTriangle size={30} style={{ color: accent }} />
              ) : (
                <UserCheck size={30} style={{ color: accent }} />
              )}
            </div>
            <div>
              <p
                className="text-[10px] font-black uppercase tracking-[0.2em] mb-1.5"
                style={{ color: accent }}
              >
                {isPending
                  ? "Verification In Progress"
                  : isRejected
                    ? "Verification Rejected"
                    : "Identity Verification Required"}
              </p>
              <h3 className="text-white font-black text-xl leading-tight">
                {isPending
                  ? "KYC Under Review"
                  : isRejected
                    ? "Resubmit Your Documents"
                    : "Verify to Withdraw"}
              </h3>
              <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                {isPending
                  ? "Our compliance team is reviewing your documents (24–48 hrs). Withdrawals unlock automatically once approved."
                  : isRejected
                    ? "Your previous submission was rejected. Please resubmit with clear, valid government-issued documents."
                    : "Withdrawals require identity verification under our compliance policy. Takes less than 5 minutes."}
              </p>
            </div>
          </div>
        </div>
        <div className="px-8 pb-8 pt-6 space-y-3">
          {!isPending && (
            <button
              onClick={onGoVerify}
              className="w-full py-4 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2.5 transition-all hover:opacity-90"
              style={{
                background: `linear-gradient(135deg,${accent},${accent}cc)`,
              }}
            >
              <FileCheck size={18} />
              {isRejected
                ? "Resubmit Verification Documents"
                : "Start Identity Verification"}
              <ArrowRight size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-2.5 text-slate-600 text-xs hover:text-slate-400 transition-colors"
          >
            {isPending ? "Close — I'll wait for approval" : "Go back"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PLAN CARD ────────────────────────────────────────────────────────────────
function PlanCard({
  plan,
  index,
  event,
  userAlloc,
  onWaitlist,
  onMine,
  waitlisted,
  kycStatus,
  onNeedKYC,
}: {
  plan: Plan;
  index: number;
  event: DemandEvent | null;
  userAlloc: Allocation | null;
  onWaitlist: () => void;
  onMine: (
    amount: number,
    itype: string,
    paymentModel: "flexible" | "contract",
    miningPeriod?: string,
    contractTerm?: (typeof CONTRACT_TERMS)[0],
  ) => void;
  waitlisted: boolean;
  kycStatus: KYCStatus;
  onNeedKYC: () => void;
}) {
  const cs = CS[plan.tier_color] || CS.slate;
  const cap = useCapacity(index);
  const [amountStr, setAmountStr] = useState(String(plan.price_min));
  const amount = parseFloat(amountStr) || 0;
  const [itype] = useState(plan.instance_type);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | null>(null);

  const showFlexible =
    plan.payment_model === "flexible" || plan.payment_model === "both";
  const showContract =
    plan.payment_model === "contract" || plan.payment_model === "both";
  const [selectedTab, setSelectedTab] = useState<"flexible" | "contract">(
    showFlexible ? "flexible" : "contract",
  );
  const [selectedMiningPeriod, setSelectedMiningPeriod] =
    useState<MiningPeriodInfo>(MINING_PERIODS[1]); // default daily
  const [selectedTerm, setSelectedTerm] = useState(CONTRACT_TERMS[0]);

  const isSurge = event?.event_type === "surge" && event.is_active;
  const locked = plan.is_admin_locked;
  const waitlistOnly = plan.is_waitlist || plan.is_invite_only;

  // Users can mine without KYC — KYC only required at withdrawal
  // So we remove the KYC gate from plan cards entirely
  const amountError =
    !amount || amount < plan.price_min
      ? `Minimum stake is $${plan.price_min.toLocaleString()}`
      : amount > plan.price_max
        ? `Maximum is $${(plan.price_max / 1_000_000).toFixed(0)}M`
        : null;

  // Plan-specific daily profit range (from DB, scaled by tier multiplier)
  const planDailyMin =
    (plan.base_daily_profit_min ?? BASE_DAILY_MIN) *
    (plan.roi_tier_multiplier ?? 1.0);
  const planDailyMax =
    (plan.base_daily_profit_max ?? BASE_DAILY_MAX) *
    (plan.roi_tier_multiplier ?? 1.0);

  // Period-specific profit range for display ($ range, no % shown)
  const periodRange = getDisplayProfitRange({
    planDailyMin,
    planDailyMax,
    period: selectedMiningPeriod.key,
  });

  // Contract data (preserved)
  const termReturns = plan.contract_returns?.[selectedTerm.key] || {
    min_pct: 52,
    max_pct: 93,
  };
  const contractEarnMin = (amount * termReturns.min_pct) / 100;
  const contractEarnMax = (amount * termReturns.max_pct) / 100;
  const contractTotalMin = amount + contractEarnMin;
  const contractTotalMax = amount + contractEarnMax;

  function handleMineClick() {
    if (amountError) return;
    if (selectedTab === "flexible" || !showContract) {
      onMine(amount, itype, "flexible", selectedMiningPeriod.key);
    } else {
      onMine(amount, itype, "contract", undefined, selectedTerm);
    }
  }

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
            ⚡ {event!.title} — Mining output boosted {event!.multiplier}× this
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
                Mining
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
              GPU Cloud Mining
            </span>
            <span className="text-slate-500 text-xs">·</span>
            <span className="text-slate-400 text-xs">
              Min stake ${plan.price_min.toLocaleString()}
            </span>
            <span className="text-slate-600 text-xs">{plan.vram} VRAM</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-white font-black text-sm">
              ${plan.price_min.toLocaleString()}
            </p>
            <p className="text-slate-600 text-[10px]">min stake</p>
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
          {/* Tab selector */}
          {showFlexible && showContract && (
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedTab("flexible")}
                className={`flex-1 py-2.5 rounded-xl text-sm font-black border transition-all ${selectedTab === "flexible" ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300" : "border-slate-800 text-slate-500 hover:border-slate-600"}`}
              >
                ⛏️ Mining (Flexible)
              </button>
              <button
                onClick={() => setSelectedTab("contract")}
                className={`flex-1 py-2.5 rounded-xl text-sm font-black border transition-all ${selectedTab === "contract" ? "bg-violet-500/10 border-violet-500/40 text-violet-300" : "border-slate-800 text-slate-500 hover:border-slate-600"}`}
              >
                📋 Contract
              </button>
            </div>
          )}

          {/* ── FLEXIBLE / MINING TAB ── */}
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
                  ⛏️ GPU Cloud Mining (Flexible)
                </p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Stake your capital into a dedicated GPU node. The node mines
                  for your chosen period — once the session ends, your capital
                  and earnings are returned to your wallet automatically. Start
                  a new session anytime.
                </p>
              </div>

              {/* Amount input */}
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-2">
                  Stake Amount
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
                    onFocus={(e) => {
                      if (e.target.value === String(plan.price_min))
                        setAmountStr("");
                    }}
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

              {/* Mining period selector */}
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-2">
                  Select Mining Duration
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {MINING_PERIODS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setSelectedMiningPeriod(p)}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${selectedMiningPeriod.key === p.key ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300" : "border-slate-800 text-slate-500 hover:border-slate-600"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="text-slate-600 text-[10px] mt-2">
                  Mining runs for {selectedMiningPeriod.durationLabel}. After
                  this, your stake + earnings are credited to your wallet
                  automatically.
                </p>
              </div>

              {/* Earnings estimate — $ range only, no % shown */}
              {!amountError && amount > 0 && (
                <>
                  <div
                    className="rounded-2xl p-5"
                    style={{
                      background: "rgba(16,185,129,0.08)",
                      border: "1px solid rgba(16,185,129,0.25)",
                    }}
                  >
                    <p className="text-slate-400 text-xs mb-2 text-center">
                      Estimated earnings for {selectedMiningPeriod.label} mining
                      session
                    </p>
                    <div className="flex items-center justify-center gap-3">
                      <div className="text-center">
                        <p className="text-slate-500 text-[10px] uppercase">
                          Min
                        </p>
                        <p className="text-emerald-400 font-black text-2xl">
                          ${periodRange.min.toFixed(4)}
                        </p>
                      </div>
                      <div className="text-slate-600 font-black text-xl">–</div>
                      <div className="text-center">
                        <p className="text-slate-500 text-[10px] uppercase">
                          Max
                        </p>
                        <p className="text-emerald-300 font-black text-2xl">
                          ${periodRange.max.toFixed(4)}
                        </p>
                      </div>
                    </div>
                    <p className="text-amber-400/60 text-[10px] mt-3 text-center">
                      Actual earnings vary with network demand · Not a guarantee
                    </p>
                  </div>

                  {/* What happens info */}
                  <div
                    className="rounded-xl p-4 space-y-2"
                    style={{
                      background: "rgba(59,130,246,0.05)",
                      border: "1px solid rgba(59,130,246,0.15)",
                    }}
                  >
                    <p className="text-blue-300 text-xs font-black uppercase tracking-wide">
                      How This Mining Session Works
                    </p>
                    {[
                      {
                        icon: PlayCircle,
                        text: `Your node starts mining immediately for ${selectedMiningPeriod.durationLabel}`,
                      },
                      {
                        icon: Pickaxe,
                        text: "Live earnings accumulate in your portfolio — visible in real time",
                      },
                      {
                        icon: Coins,
                        text: "When the session ends, capital + profits are sent to your wallet",
                      },
                      {
                        icon: RotateCcw,
                        text: "Start a new session anytime after completion",
                      },
                    ].map(({ icon: Icon, text }) => (
                      <div key={text} className="flex items-start gap-2.5">
                        <Icon
                          size={12}
                          className="text-blue-400 shrink-0 mt-0.5"
                        />
                        <p className="text-slate-400 text-xs">{text}</p>
                      </div>
                    ))}
                  </div>

                  <Disclaimer />
                </>
              )}
            </div>
          )}

          {/* ── CONTRACT TAB (preserved exactly) ── */}
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
                  Commit your capital for a fixed period. Earnings accrue daily
                  in real time — locked until maturity. Higher estimated returns
                  for longer commitments.{" "}
                  <strong className="text-slate-300">
                    Returns not guaranteed.
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
                <p className="text-slate-600 text-[11px] mt-2">
                  {selectedTerm.desc}
                </p>
              </div>
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-2">
                  Capital Amount
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
                    onFocus={(e) => {
                      if (e.target.value === String(plan.price_min))
                        setAmountStr("");
                    }}
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
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-700 text-slate-400 hover:border-violet-500/50 hover:text-violet-400 transition-all"
                        >
                          ${v.toLocaleString()}
                        </button>
                      ))}
                  </div>
                )}
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
                        What you could receive at {selectedTerm.label} maturity
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
                            Min Return
                          </p>
                          <p className="text-emerald-400 font-black text-2xl">
                            ${contractEarnMin.toFixed(2)}
                          </p>
                          <p className="text-slate-500 text-[10px] mt-0.5">
                            {termReturns.min_pct}% of your $
                            {amount.toLocaleString()}
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
                            Max Return
                          </p>
                          <p className="text-emerald-300 font-black text-2xl">
                            ${contractEarnMax.toFixed(2)}
                          </p>
                          <p className="text-slate-500 text-[10px] mt-0.5">
                            {termReturns.max_pct}% of your $
                            {amount.toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="border-t border-slate-800/50 px-4 py-4">
                        <p className="text-slate-400 text-xs text-center mb-3">
                          Total account value at maturity (capital + return)
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="text-center">
                            <p className="text-slate-500 text-[10px]">
                              Min Total
                            </p>
                            <p className="text-white font-black text-xl">
                              ${contractTotalMin.toFixed(2)}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-slate-500 text-[10px]">
                              Max Total
                            </p>
                            <p className="text-amber-400 font-black text-xl">
                              ${contractTotalMax.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="px-4 pb-4">
                        <div
                          className="rounded-xl px-3 py-2.5"
                          style={{
                            background: "rgba(16,185,129,0.04)",
                            border: "1px solid rgba(16,185,129,0.1)",
                          }}
                        >
                          <p className="text-slate-500 text-[10px] text-center">
                            Daily accrual visible on dashboard · locked until{" "}
                            {selectedTerm.label} maturity
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

          {/* Info sections (specs, use cases, risk, legal) */}
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
                      ["Node Type", plan.instance_type, Server],
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
                      GPU compute demand is variable. Mining rewards fluctuate
                      with network load and are not guaranteed.
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
                        "All projected figures are estimates. We make no guarantee of minimum returns.",
                      ],
                      [
                        "AML / KYC",
                        "Withdrawals require identity verification. KYC must be approved by our compliance team before any payout is processed.",
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

          {/* CTA button */}
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
              // No KYC gate for mining — only at withdrawal
              <button
                disabled={!!amountError || !amount}
                onClick={handleMineClick}
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
                {selectedTab === "contract" ? (
                  <>
                    <FileCheck size={15} /> Lock In $
                    {amount > 0 ? amount.toLocaleString() : "—"} ·{" "}
                    {selectedTerm.label} Contract <ArrowRight size={14} />
                  </>
                ) : (
                  <>
                    <Pickaxe size={15} /> Get Coins &amp; Mine · $
                    {amount > 0 ? amount.toLocaleString() : "—"} for{" "}
                    {selectedMiningPeriod.label} <ArrowRight size={14} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
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
  const [showKYCModal, setShowKYCModal] = useState(false);
  const [activeTab, setActiveTab] = useState<"plans" | "portfolio">("plans");
  const networkEarnings = useLiveNetworkEarnings();
  const { kycStatus, recheck: recheckKyc } = useKycStatus(userId);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function goToVerification() {
    setShowKYCModal(false);
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

  // Realtime subscription — new allocations appear instantly
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("node_allocations_realtime")
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
          showToast("⛏️ Mining session activated! Your node is now live.");
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
        (payload) => {
          setAllocations((prev) =>
            prev.map((a) =>
              a.id === (payload.new as Allocation).id
                ? (payload.new as Allocation)
                : a,
            ),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Sync earnings to DB every 60s (flexible active allocations)
  useEffect(() => {
    if (!userId || allocations.length === 0 || plans.length === 0) return;
    const iv = setInterval(async () => {
      for (const alloc of allocations.filter(
        (a) =>
          a.status === "active" &&
          a.payment_model === "flexible" &&
          !a.mining_completed,
      )) {
        const plan = plans.find((p) => p.id === alloc.plan_id);
        const planDailyMin =
          (plan?.base_daily_profit_min ?? BASE_DAILY_MIN) *
          (plan?.roi_tier_multiplier ?? 1.0);
        const planDailyMax =
          (plan?.base_daily_profit_max ?? BASE_DAILY_MAX) *
          (plan?.roi_tier_multiplier ?? 1.0);
        const rateFactor = alloc.rate_factor_used ?? 0.86;
        const dailyProfit =
          planDailyMin + rateFactor * (planDailyMax - planDailyMin);
        const MULTIPLIERS: Record<string, number> = {
          hourly: 0.8 / 24,
          daily: 1.0,
          weekly: 7 * 1.1,
          monthly: 30 * 1.25,
        };
        const period = alloc.mining_period ?? "daily";
        const totalPeriodProfit = dailyProfit * (MULTIPLIERS[period] ?? 1.0);
        const periodMs =
          PERIOD_DURATIONS_MS[period] ?? PERIOD_DURATIONS_MS.daily;
        const perSecond = totalPeriodProfit / (periodMs / 1000);
        const base = alloc.total_earned ?? 0;
        const elapsed =
          (Date.now() -
            new Date(alloc.updated_at || alloc.created_at).getTime()) /
          1000;
        const newEarned = base + perSecond * elapsed;

        await supabase
          .from("node_allocations")
          .update({
            total_earned: Math.round(newEarned * 1_000_000) / 1_000_000,
            updated_at: new Date().toISOString(),
          })
          .eq("id", alloc.id);
      }
    }, 60_000);
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

  // Mine function — now passes miningPeriod to checkout
  function mine(
    planId: string,
    amount: number,
    itype: string,
    paymentModel: "flexible" | "contract",
    miningPeriod?: string,
    contractTerm?: (typeof CONTRACT_TERMS)[0],
  ) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;

    if (paymentModel === "contract") {
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
        paymentModel: "contract",
        contractMonths: (contractTerm?.months ?? 6).toString(),
        contractLabel: contractTerm?.label ?? "6 Months",
        contractMinPct: termReturns.min_pct.toString(),
        contractMaxPct: termReturns.max_pct.toString(),
        lockInMonths: (contractTerm?.months ?? 6).toString(),
        lockInLabel: contractTerm?.label ?? "6 Months",
        lockInMultiplier: "1",
      });
      if (typeof window !== "undefined")
        sessionStorage.setItem("checkout_redirect", "/dashboard/gpu-plans");
      router.push(`/dashboard/checkout?${params.toString()}`);
    } else {
      // Flexible / mining
      const params = new URLSearchParams({
        node: planId,
        name: plan.name,
        price: amount.toString(),
        itype,
        gpu: plan.gpu_model,
        vram: plan.vram,
        paymentModel: "flexible",
        miningPeriod: miningPeriod ?? "daily",
        lockInMonths: "0",
        lockInLabel: "Flexible",
        lockInMultiplier: "1",
      });
      if (typeof window !== "undefined")
        sessionStorage.setItem("checkout_redirect", "/dashboard/gpu-plans");
      router.push(`/dashboard/checkout?${params.toString()}`);
    }
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
  const isKYCVerified = kycStatus === "approved";

  return (
    <div
      className="flex min-h-screen text-white"
      style={{ background: "#06080f" }}
    >
      <DashboardNavigation />

      {/* KYC modal — only shown when trying to withdraw without KYC */}
      {showKYCModal && (
        <KYCGateModal
          kycStatus={kycStatus}
          onClose={() => setShowKYCModal(false)}
          onGoVerify={goToVerification}
        />
      )}

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
            <div className="relative">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{" "}
                  Live Network
                </span>
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 bg-slate-800/60 border border-slate-700/40 px-3 py-1 rounded-full">
                  24h: ${networkEarnings}
                </span>
                {isKYCVerified ? (
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full flex items-center gap-1.5">
                    <CheckCircle size={9} /> KYC Verified
                  </span>
                ) : (
                  <span
                    className="text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full flex items-center gap-1.5"
                    style={{
                      color: kycStatus === "pending" ? "#f59e0b" : "#94a3b8",
                      background:
                        kycStatus === "pending"
                          ? "rgba(245,158,11,0.1)"
                          : "rgba(100,116,139,0.1)",
                      border:
                        kycStatus === "pending"
                          ? "1px solid rgba(245,158,11,0.3)"
                          : "1px solid rgba(100,116,139,0.2)",
                    }}
                  >
                    <Shield size={9} />
                    {kycStatus === "pending"
                      ? "KYC Under Review"
                      : "KYC Needed for Withdrawal"}
                  </span>
                )}
              </div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
                GPU Cloud Mining
                <br />
                <span className="text-emerald-400">Infrastructure</span>
              </h1>
              <p className="text-slate-400 mt-4 max-w-2xl leading-relaxed text-sm md:text-base">
                Participate in the global GPU compute economy. Stake capital
                into dedicated GPU nodes inside Tier III/IV data centres — your
                node processes AI training, inference, and rendering workloads
                24/7, generating daily compute mining income.
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
          </div>

          {/* KYC INFO BANNER — now just info, not a blocker */}
          {!isKYCVerified && (
            <div
              className="rounded-2xl p-5 flex items-start gap-4"
              style={{
                background:
                  kycStatus === "pending"
                    ? "rgba(245,158,11,0.05)"
                    : "rgba(59,130,246,0.05)",
                border:
                  kycStatus === "pending"
                    ? "1px solid rgba(245,158,11,0.18)"
                    : "1px solid rgba(59,130,246,0.18)",
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background:
                    kycStatus === "pending"
                      ? "rgba(245,158,11,0.12)"
                      : "rgba(59,130,246,0.12)",
                  border:
                    kycStatus === "pending"
                      ? "1px solid rgba(245,158,11,0.3)"
                      : "1px solid rgba(59,130,246,0.3)",
                }}
              >
                {kycStatus === "pending" ? (
                  <Clock size={18} className="text-amber-400" />
                ) : (
                  <Info size={18} className="text-blue-400" />
                )}
              </div>
              <div className="flex-1">
                <p
                  className={`font-black text-sm ${kycStatus === "pending" ? "text-amber-300" : "text-blue-300"}`}
                >
                  {kycStatus === "pending"
                    ? "KYC Under Review — Mining is available while you wait"
                    : kycStatus === "rejected"
                      ? "KYC Rejected — Resubmit to enable withdrawals"
                      : "Identity Verification Required for Withdrawals Only"}
                </p>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                  {kycStatus === "pending"
                    ? "Your documents are being reviewed. You can start mining right now — withdrawals unlock automatically once approved."
                    : kycStatus === "rejected"
                      ? "Mining continues normally. Resubmit your documents to enable withdrawals."
                      : "You can start mining immediately without verification. KYC is only required when you want to withdraw your earnings."}
                </p>
                <div className="flex flex-wrap gap-3 mt-3">
                  {kycStatus !== "pending" && (
                    <button
                      onClick={goToVerification}
                      className="font-black text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all hover:opacity-90"
                      style={{
                        background:
                          kycStatus === "rejected"
                            ? "rgba(239,68,68,0.2)"
                            : "rgba(59,130,246,0.2)",
                        color: kycStatus === "rejected" ? "#ef4444" : "#60a5fa",
                        border:
                          kycStatus === "rejected"
                            ? "1px solid rgba(239,68,68,0.3)"
                            : "1px solid rgba(59,130,246,0.3)",
                      }}
                    >
                      <FileCheck size={12} />
                      {kycStatus === "rejected"
                        ? "Resubmit Documents"
                        : "Complete Verification"}
                    </button>
                  )}
                  <p className="text-slate-600 text-[11px] flex items-center gap-1 self-center">
                    <Pickaxe size={10} /> Mining is available immediately — no
                    verification needed to start
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TABS */}
          <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-1.5 w-fit">
            <button
              onClick={() => setActiveTab("plans")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "plans" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
            >
              <Server size={14} /> GPU Mining Nodes
            </button>
            <button
              onClick={() => setActiveTab("portfolio")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "portfolio" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
            >
              <BarChart2 size={14} /> My Mining Portfolio
              {activeAllocs.length > 0 && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                  {activeAllocs.length}
                </span>
              )}
            </button>
          </div>

          {/* ── PORTFOLIO TAB ── */}
          {activeTab === "portfolio" && (
            <section>
              <div className="mb-8">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                  My Portfolio
                </span>
                <h2 className="text-white font-black text-2xl md:text-3xl mt-3">
                  Active Mining Sessions
                </h2>
                <p className="text-slate-500 text-sm mt-1.5">
                  Real-time earnings, mining progress, and withdrawal management
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
                  <Pickaxe size={32} className="text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 font-semibold text-sm">
                    No active mining sessions yet
                  </p>
                  <p className="text-slate-600 text-xs mt-1">
                    Select a GPU node below to start mining
                  </p>
                  <button
                    onClick={() => setActiveTab("plans")}
                    className="mt-4 px-5 py-2.5 rounded-xl font-black text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-2 mx-auto"
                  >
                    <Pickaxe size={13} /> Browse Mining Nodes
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      {
                        label: "Total Staked",
                        value: `$${activeAllocs.reduce((s, a) => s + a.amount_invested, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                        icon: Wallet,
                        color: "text-white",
                      },
                      {
                        label: "Active Sessions",
                        value: `${activeAllocs.filter((a) => !a.mining_completed && a.payment_model === "flexible").length}`,
                        icon: Pickaxe,
                        color: "text-emerald-400",
                      },
                      {
                        label: "Completed",
                        value: `${activeAllocs.filter((a) => a.mining_completed || (a.status === "matured" && a.payment_model === "flexible")).length}`,
                        icon: CheckCircle,
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
                      onStartNewMining={() => {
                        setActiveTab("plans");
                        showToast("Start a new mining session below.", true);
                      }}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── PLANS TAB ── */}
          {activeTab === "plans" && (
            <>
              {/* How It Works */}
              <section>
                <div className="mb-8">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                    How It Works
                  </span>
                  <h2 className="text-white font-black text-2xl md:text-3xl mt-3">
                    Two Ways to Earn
                  </h2>
                  <p className="text-slate-500 text-sm mt-1.5">
                    Flexible mining sessions or fixed-term contracts — both put
                    your capital to work in real GPU compute infrastructure
                  </p>
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
                      <Pickaxe size={18} className="text-emerald-400" />
                    </div>
                    <h3 className="text-white font-black text-base mb-2">
                      ⛏️ Flexible Mining
                    </h3>
                    <p className="text-slate-400 text-xs leading-relaxed mb-3">
                      Stake capital for a mining period of your choice (1 hour,
                      1 day, 1 week, or 1 month). When the session ends, your
                      stake and earnings are automatically returned to your
                      wallet.
                    </p>
                    <div className="space-y-1.5 text-xs">
                      {[
                        "No KYC required to start mining",
                        "Capital + profits returned when session ends",
                        "Start a new session anytime",
                        "KYC required only to withdraw",
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
                      Commit 6–24 months for potentially higher returns. Capital
                      is locked until maturity.{" "}
                      <strong className="text-slate-300">
                        Returns are not guaranteed.
                      </strong>
                    </p>
                    <div className="space-y-1.5 text-xs">
                      {[
                        "6 months: est. 52%–93% return",
                        "12 months: est. 130%–250% return",
                        "24 months: est. 800%–1,200% return",
                        "Capital + earnings released at maturity",
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

              {/* GPU Node Tiers */}
              <section>
                <div className="mb-8">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                    GPU Node Tiers
                  </span>
                  <h2 className="text-white font-black text-2xl md:text-3xl mt-3">
                    Select Your Mining Node
                  </h2>
                  <p className="text-slate-500 text-sm mt-1.5">
                    Browse all GPU tiers — stake your amount and start mining
                    immediately
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
                      kycStatus={kycStatus}
                      onNeedKYC={() => setShowKYCModal(true)}
                      onWaitlist={() => joinWaitlist(plan.id)}
                      onMine={(
                        amount,
                        itype,
                        paymentModel,
                        miningPeriod,
                        contractTerm,
                      ) =>
                        mine(
                          plan.id,
                          amount,
                          itype,
                          paymentModel,
                          miningPeriod,
                          contractTerm,
                        )
                      }
                    />
                  ))}
                </div>
              </section>

              {/* Testimonials (preserved) */}
              <section>
                <div className="mb-8">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                    Miner Stories
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
