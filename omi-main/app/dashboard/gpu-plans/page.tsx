"use client";
// app/dashboard/gpu-plans/page.tsx
// Updates:
// 1. Amount-based lock days via lib/lock-policy.ts
// 2. Re-mine visible to ANY user with >= $0.50 balance (was >= $1)
// 3. Proper balance deduction on re-mine + credit when mining completes
// 4. getLockStatus uses amount_invested, not tier

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getBusinessDayMessage, isBusinessDay } from "@/lib/business-days";
import DashboardNavigation from "@/components/dashboard-navigation";
import { getCapitalReturnTier, getCapitalReturnUnlockDate, getCapitalReturnAmount } from "@/lib/lock-policy";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Cpu,
  Zap,
  Shield,
  AlertTriangle,
  Lock,
  Clock,
  CheckCircle,
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
  Pickaxe,
  Coins,
  RotateCcw,
  Gauge,
  X,
  Star,
  Repeat2,
  BadgeDollarSign,
  ShieldCheck,
  CircleDollarSign,
} from "lucide-react";
import { useKycStatus, KYCStatus } from "@/lib/useKycStatus";
import {
  logWithdrawalEvent,
  recordWithdrawalLedger,
} from "@/lib/withdrawal-security";
import {
  MINING_PERIODS,
  PERIOD_DURATIONS_MS,
  type MiningPeriodInfo,
} from "@/lib/mining-service";

// ─── MINIMUM BALANCE TO SEE RE-MINE ──────────────────────────────────────────
const REMINE_MIN_BALANCE = 0.5;

const TIER_NAMES = ["Lite", "Foundation", "RTX 4090", "A100", "H100"];

type LockStatus = {
  // Whether this allocation is even eligible for a capital return at all.
  // Only a user's first-ever deposit qualifies — everything after that has
  // its capital permanently committed to mining (no return, ever).
  isEligible: boolean;
  isLocked: boolean;
  unlockDate: Date | null;
  daysRemaining: number;
  hoursRemaining: number;
  lockDays: number;
  returnPct: number;     // 0 - 1
  returnAmount: number;  // dollar amount that will be returned at unlock
};

// ─── FIRST-DEPOSIT-ONLY, PERCENTAGE-BASED LOCK STATUS ────────────────────────
function getLockStatusByAmount(
  createdAt: string,
  amountInvested: number,
  isFirstDeposit: boolean,
  lockUnlockAtOverride?: string | null,
): LockStatus {
  if (!isFirstDeposit) {
    // Not the user's first deposit — no capital return ever applies.
    // Capital stays committed to mining; only mined profit is withdrawable.
    return {
      isEligible: false,
      isLocked: false,
      unlockDate: null,
      daysRemaining: 0,
      hoursRemaining: 0,
      lockDays: 0,
      returnPct: 0,
      returnAmount: 0,
    };
  }

  const tier = getCapitalReturnTier(amountInvested);
  const unlock = lockUnlockAtOverride
    ? new Date(lockUnlockAtOverride)
    : getCapitalReturnUnlockDate(createdAt, amountInvested);
  const remaining = unlock.getTime() - Date.now();
  const isLocked = remaining > 0;
  return {
    isEligible: true,
    isLocked,
    unlockDate: unlock,
    daysRemaining: Math.max(0, Math.ceil(remaining / 86_400_000)),
    hoursRemaining: Math.max(0, Math.ceil(remaining / 3_600_000)),
    lockDays: tier.lockDays,
    returnPct: tier.returnPct,
    returnAmount: getCapitalReturnAmount(amountInvested),
  };
}

// ─── ROI TABLE ────────────────────────────────────────────────────────────────
type RoiRates = {
  hourly: number;
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
};

const TIER_ROI: RoiRates[] = [
  { hourly: 0.004, daily: 0.025, weekly: 0.15, monthly: 0.55, yearly: 6.6 },
  { hourly: 0.003, daily: 0.02, weekly: 0.12, monthly: 0.45, yearly: 5.4 },
  { hourly: 0.005, daily: 0.03, weekly: 0.18, monthly: 0.7, yearly: 8.4 },
  { hourly: 0.008, daily: 0.05, weekly: 0.35, monthly: 1.2, yearly: 14.4 },
  { hourly: 0.012, daily: 0.08, weekly: 0.6, monthly: 2.5, yearly: 30 },
];

const NAME_TO_TIER: Record<string, number> = {
  lite: 0, "lite node": 0, "lite-node": 0, litenode: 0, entry: 0, shared: 0,
  foundation: 1, "foundation node": 1, "foundation-node": 1, foundationnode: 1, t4: 1, l4: 1,
  rtx: 2, "rtx 4090": 2, "rtx-4090": 2, rtx4090: 2, "rtx 4090 node": 2, "rtx-4090-node": 2, rtx4090node: 2, "4090": 2,
  a100: 3, "a100 gpu": 3, "a100-gpu": 3, a100gpu: 3, "a100 gpu node": 3, "a100-gpu-node": 3, a100gpunode: 3, "a100 node": 3,
  h100: 4, "h100 pcie": 4, "h100-pcie": 4, h100pcie: 4, "h100 pcie node": 4, "h100-pcie-node": 4, h100pcienode: 4, "h100 node": 4, frontier: 4,
};

function resolveTier(plan: Plan): number {
  if (typeof plan.tier_index === "number" && plan.tier_index >= 0 && plan.tier_index <= 4)
    return plan.tier_index;
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const candidates = [plan.short_name, plan.name, plan.gpu_model].filter(Boolean) as string[];
  for (const raw of candidates) {
    const key = normalise(raw);
    if (NAME_TO_TIER[key] !== undefined) return NAME_TO_TIER[key];
    const stripped = key.replace(/\s*node\s*$/, "").trim();
    if (NAME_TO_TIER[stripped] !== undefined) return NAME_TO_TIER[stripped];
  }
  if (plan.price_min >= 1000) return 4;
  if (plan.price_min >= 250) return 3;
  if (plan.price_min >= 50) return 2;
  if (plan.price_min >= 5) return 1;
  return 0;
}

export function getPlanRoi(plan: Plan, period: string): number {
  const tier = resolveTier(plan);
  const rates = TIER_ROI[tier] ?? TIER_ROI[0];
  return (rates as Record<string, number>)[period] ?? rates.daily;
}

export function calcProfit(capital: number, plan: Plan, period: string): number {
  return capital * getPlanRoi(plan, period);
}

export async function syncPlanRatesToDB() {
  const updates = [
    { price_min_match: 0.5, tier_index: 0, price_min: 0.5, hourly_pct: 0.004, daily_pct: 0.025, base_daily_profit_min: 2.5, base_daily_profit_max: 2.5, roi_tier_multiplier: 1.0 },
    { price_min_match: 5, tier_index: 1, price_min: 5, hourly_pct: 0.003, daily_pct: 0.02, base_daily_profit_min: 2.0, base_daily_profit_max: 2.0, roi_tier_multiplier: 1.0 },
    { price_min_match: 50, tier_index: 2, price_min: 50, hourly_pct: 0.005, daily_pct: 0.03, base_daily_profit_min: 3.0, base_daily_profit_max: 3.0, roi_tier_multiplier: 1.0 },
    { price_min_match: 250, tier_index: 3, price_min: 250, hourly_pct: 0.008, daily_pct: 0.05, base_daily_profit_min: 5.0, base_daily_profit_max: 5.0, roi_tier_multiplier: 1.0 },
    { price_min_match: 1000, tier_index: 4, price_min: 1000, hourly_pct: 0.012, daily_pct: 0.08, base_daily_profit_min: 8.0, base_daily_profit_max: 8.0, roi_tier_multiplier: 1.0 },
  ];
  for (const { price_min_match, ...fields } of updates) {
    await supabase.from("gpu_plans").update(fields).eq("price_min", price_min_match);
  }
}

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
  hourly_pct: number;
  daily_pct: number;
  referral_pct: number;
  base_daily_profit_min: number;
  base_daily_profit_max: number;
  roi_tier_multiplier: number;
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
  is_locked: boolean;
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
  mining_period?: string;
  mining_ends_at?: string;
  final_profit?: number;
  mining_completed?: boolean;
  rate_factor_used?: number;
  capital_returned?: boolean;
  tier_index?: number;
  lock_unlock_at?: string;
  is_first_deposit?: boolean;
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

type PayoutInfo = {
  payout_registered: boolean;
  payout_account_name: string | null;
  payout_account_number: string | null;
  payout_bank_name: string | null;
  payout_gateway: string | null;
  kyc_verified: boolean;
  kyc_status: string | null;
};

type UserFinance = {
  balance_available: number;
  kyc_verified: boolean;
  kyc_status: string | null;
  total_remined: number;
};

// ─── PLAN OPTION TYPES ───────────────────────────────────────────────────────
type FlexOption = {
  type: "flexible";
  period: MiningPeriodInfo;
  roi: number;
  profit: number;
};

type ContractOption = {
  type: "contract";
  months: number;
  label: string;
  key: string;
  desc: string;
  roi: number;
  profit: number;
};

type PlanOption = FlexOption | ContractOption;

const PLAIN_PERIOD_LABELS: Record<string, string> = {
  hourly: "1 Hour",
  daily: "1 Day",
  weekly: "1 Week",
  monthly: "1 Month",
  yearly: "1 Year",
};

const CONTRACT_TERMS = [
  { months: 2, label: "2 Months", key: "2m", desc: "Capital locked for 2 months." },
  { months: 6, label: "6 Months", key: "6m", desc: "Capital locked for 6 months." },
  { months: 12, label: "12 Months", key: "12m", desc: "Capital locked for 12 months." },
  { months: 24, label: "2 Years", key: "24m", desc: "Capital locked for 2 years." },
];

const CS: Record<string, { accent: string; bg: string; border: string; glow: string; hex: string }> = {
  slate:   { accent: "text-slate-300",   bg: "rgba(100,116,139,0.08)", border: "rgba(100,116,139,0.25)", glow: "rgba(100,116,139,0.15)", hex: "#94a3b8" },
  emerald: { accent: "text-emerald-400", bg: "rgba(16,185,129,0.07)",  border: "rgba(16,185,129,0.3)",   glow: "rgba(16,185,129,0.12)",  hex: "#10b981" },
  blue:    { accent: "text-blue-400",    bg: "rgba(59,130,246,0.07)",  border: "rgba(59,130,246,0.3)",   glow: "rgba(59,130,246,0.12)",  hex: "#3b82f6" },
  violet:  { accent: "text-violet-400",  bg: "rgba(139,92,246,0.07)",  border: "rgba(139,92,246,0.3)",   glow: "rgba(139,92,246,0.12)",  hex: "#8b5cf6" },
  amber:   { accent: "text-amber-400",   bg: "rgba(245,158,11,0.07)",  border: "rgba(245,158,11,0.3)",   glow: "rgba(245,158,11,0.12)",  hex: "#f59e0b" },
  sky:     { accent: "text-sky-400",     bg: "rgba(14,165,233,0.07)",  border: "rgba(14,165,233,0.3)",   glow: "rgba(14,165,233,0.12)",  hex: "#0ea5e9" },
};

function isLiteNode(plan: Plan): boolean {
  return resolveTier(plan) === 0 || plan.price_min <= 0.5;
}

const MARKET_STATS = [
  { label: "Global AI Compute Market", value: "$91.2B", icon: Globe },
  { label: "GPU Cloud Revenue 2025",   value: "$14.8B", icon: Server },
  { label: "LLM Training Demand",      value: "↑ 340%", icon: Activity },
  { label: "Average Node Uptime",      value: "99.7%",  icon: Gauge },
];

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
    const t = setInterval(() => setV(Math.floor(Math.random() * 20) + 78), 90_000);
    return () => clearInterval(t);
  }, []);
  return v;
}

function useLiveMiningEarnings(alloc: Allocation, plan: Plan | undefined): number {
  const isFlexible   = alloc.payment_model === "flexible";
  const isComplete   = alloc.mining_completed || alloc.status === "matured";
  const finalProfit  = alloc.final_profit ?? alloc.total_earned ?? 0;
  const period       = alloc.mining_period ?? "daily";
  const safePlan     = plan ?? ({ tier_index: 0, price_min: 5, short_name: "", name: "", gpu_model: "" } as unknown as Plan);
  const totalPeriodProfit = calcProfit(alloc.amount_invested, safePlan, period);
  const periodMs     = PERIOD_DURATIONS_MS[period] ?? PERIOD_DURATIONS_MS.daily;
  const flexPerSec   = totalPeriodProfit / (periodMs / 1000);
  const contractPerSec = (alloc.amount_invested * getPlanRoi(safePlan, "daily")) / 86400;
  const perSec       = isFlexible ? flexPerSec : contractPerSec;
  const base         = alloc.total_earned ?? 0;
  const lastUpdate   = alloc.updated_at || alloc.created_at;
  const elapsedSec   = Math.max(0, (Date.now() - new Date(lastUpdate).getTime()) / 1000);
  const seedValue    = isComplete
    ? finalProfit
    : isFlexible
      ? Math.min(base + perSec * elapsedSec, totalPeriodProfit)
      : base + perSec * elapsedSec;

  const [live, setLive] = useState(seedValue);
  const liveRef = useRef(live);
  useEffect(() => { liveRef.current = live; }, [live]);

  useEffect(() => {
    if (isComplete) { setLive(finalProfit); return; }
    const newElapsed = Math.max(0, (Date.now() - new Date(alloc.updated_at || alloc.created_at).getTime()) / 1000);
    const reseeded = isFlexible
      ? Math.min((alloc.total_earned ?? 0) + perSec * newElapsed, totalPeriodProfit)
      : (alloc.total_earned ?? 0) + perSec * newElapsed;
    setLive(reseeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alloc.total_earned, alloc.updated_at, isComplete]);

  useEffect(() => {
    if (isComplete) return;
    const iv = setInterval(() => {
      setLive((p) => isFlexible ? Math.min(p + perSec, totalPeriodProfit) : p + perSec);
    }, 1000);
    return () => clearInterval(iv);
  }, [perSec, isComplete, isFlexible, totalPeriodProfit]);

  useEffect(() => {
    if (isComplete) return;
    const syncIv = setInterval(async () => {
      const current = liveRef.current;
      if (current > (alloc.total_earned ?? 0)) {
        try {
          // Use the monotonic RPC instead of a direct overwrite.
          // GREATEST(total_earned, new_value) inside the DB function means
          // a stale/lower write from a competing tab or interval can never
          // decrease a user's stored earnings — fixes "mining keeps reducing".
          await supabase.rpc("safe_update_earnings", {
            alloc_id: alloc.id,
            new_earned: Math.round(current * 1_000_000) / 1_000_000,
          });
        } catch (err) { console.error("[mining] sync error:", err); }
      }
    }, 60_000);
    return () => clearInterval(syncIv);
  }, [alloc.id, alloc.total_earned, isComplete]);

  return isComplete ? finalProfit : live;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${className}`}>
      {children}
    </span>
  );
}

function LockStatusBadge({ isEligible, isLocked, daysRemaining, unlockDate, returnPct }: {
  isEligible: boolean; isLocked: boolean; daysRemaining: number; unlockDate: Date | null; returnPct: number;
}) {
  // Non-first deposits have no capital-return concept — show nothing rather
  // than a misleading lock/unlock badge.
  if (!isEligible) return null;

  if (!isLocked) {
    return (
      <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-emerald-900/20 border-emerald-700/40 text-emerald-400 flex items-center gap-1">
        <CheckCircle size={9} /> {(returnPct * 100).toFixed(0)}% capital unlocked
      </span>
    );
  }
  return (
    <span
      className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-amber-900/30 border-amber-700/50 text-amber-400 flex items-center gap-1 cursor-help"
      title={`${(returnPct * 100).toFixed(0)}% of your stake unlocks ${unlockDate?.toLocaleDateString()}. Profits above stake are withdrawable now.`}
    >
      <Lock size={9} /> {(returnPct * 100).toFixed(0)}% locked {daysRemaining}d
    </span>
  );
}

// ─── FIRST DEPOSIT BANNER — shown only after a user has actually paid ───────
// Replaces the old LockPeriodInfoBanner, which showed the internal % / day
// table to every signed-in user regardless of payment history. This version
// only renders something once the user has a real first-deposit allocation,
// and only ever shows THEIR specific outcome — never the underlying table,
// never shown to visitors, never shown before a payment exists.
function FirstDepositBanner({ allocations }: { allocations: Allocation[] }) {
  const [open, setOpen] = React.useState(false);

  const firstDeposit = allocations.find((a) => a.is_first_deposit === true);
  if (!firstDeposit) return null; // No payment made yet — show nothing.

  const lockStatus = getLockStatusByAmount(
  firstDeposit.created_at,
  firstDeposit.amount_invested,
  true,                // this IS the first deposit by definition
  firstDeposit.lock_unlock_at,
);
if (!lockStatus.isEligible) return null;
  return (
    <div
      className="rounded-xl p-3 cursor-pointer"
      style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.18)" }}
      onClick={() => setOpen((v) => !v)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info size={13} className="text-amber-400" />
          <span className="text-amber-300 text-xs font-black">
            {lockStatus.isLocked ? "Your Stake Return" : "Stake Returned"}
          </span>
        </div>
        <ChevronDown size={11} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className="mt-3 space-y-1.5">
          {lockStatus.isLocked ? (
            <p className="text-amber-400/80 text-xs">
              ${lockStatus.returnAmount.toFixed(2)} of your original stake will be returned to your wallet on{" "}
              <span className="text-amber-300 font-bold">{lockStatus.unlockDate?.toLocaleDateString()}</span>.
              Mining profits are withdrawable as soon as a session completes.
            </p>
          ) : (
            <p className="text-emerald-400/80 text-xs">
              ${lockStatus.returnAmount.toFixed(2)} of your original stake has been returned to your wallet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── WITHDRAW MODAL ───────────────────────────────────────────────────────────
function WithdrawModal({
  alloc, plan, liveEarned, userId, onClose, onSuccess,
}: {
  alloc: Allocation; plan: Plan | undefined; liveEarned: number; userId: string; onClose: () => void; onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payoutInfo, setPayoutInfo] = useState<PayoutInfo | null>(null);
  const [loadingPayout, setLoadingPayout] = useState(true);

  // First-deposit-only capital return status. For non-first deposits,
  // isEligible is false and isLocked is always false — those allocations
  // have no capital-return concept; only profit is ever withdrawable once
  // mining completes, capital stays committed to the node permanently.
  const lockStatus = getLockStatusByAmount(
     alloc.created_at,
     alloc.amount_invested,
     alloc.is_first_deposit === true,   // strict: re-mines never get bonus
     alloc.lock_unlock_at,
   );

  const available      = Math.max(0, liveEarned - (alloc.total_withdrawn ?? 0));
  const isContract     = alloc.payment_model === "contract";
  const maturityDate   = alloc.maturity_date ? new Date(alloc.maturity_date) : null;
  const contractMature = maturityDate ? Date.now() >= maturityDate.getTime() : false;
  const miningComplete = alloc.mining_completed || alloc.status === "matured";
  const canWithdraw    = isContract ? contractMature : miningComplete;
  const daysLeft       = maturityDate ? Math.max(0, Math.ceil((maturityDate.getTime() - Date.now()) / 86400000)) : 0;
  const minW           = 10;
  const amt            = parseFloat(amount) || 0;
  const isBizDay       = isBusinessDay();
  const bizMsg         = getBusinessDayMessage();

  // Profit is always withdrawable once mining completes, regardless of
  // first-deposit status. Capital eligibility only matters for first
  // deposits — non-first deposits simply have no capital portion to unlock.
  const earningsAboveStake = Math.max(0, liveEarned - alloc.amount_invested);
  const canWithdrawEarnings = earningsAboveStake >= minW;
  const canWithdrawAny =
    canWithdraw && (!lockStatus.isEligible || !lockStatus.isLocked || canWithdrawEarnings);

  useEffect(() => {
    supabase
      .from("users")
      .select("payout_registered,payout_account_name,payout_account_number,payout_bank_name,payout_gateway,kyc_verified,kyc_status")
      .eq("id", userId)
      .single()
      .then(({ data }: { data: PayoutInfo | null }) => { if (data) setPayoutInfo(data); setLoadingPayout(false); });
  }, [userId]);

  const kycOk    = !!(payoutInfo?.kyc_verified || payoutInfo?.kyc_status === "approved");
  const hasPayout = !!(payoutInfo?.payout_registered && payoutInfo?.payout_account_number);

  async function handleWithdraw() {
    setError("");
    if (!isBizDay) { const d = new Date().getDay(); setError(`Withdrawals are only on business days (Mon–Fri). Today is ${d === 0 ? "Sunday" : "Saturday"}.`); return; }
    if (!pin || pin.length < 4) { setError("Enter your PIN (4–6 digits)"); return; }
    const encoder  = new TextEncoder();
    const hashBuf  = await crypto.subtle.digest("SHA-256", encoder.encode(pin + userId));
    const pinHash  = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: ud } = await supabase.from("users").select("pin_hash").eq("id", userId).single();
    if (!ud?.pin_hash || pinHash !== (ud as { pin_hash: string }).pin_hash) { setError("Invalid PIN."); return; }
    if (!kycOk)    { setError("KYC verification required before withdrawing."); return; }
    if (!hasPayout){ setError("No payout account registered. Go to Verification → Payout Setup."); return; }
    if (amt < minW){ setError(`Minimum withdrawal is $${minW}`); return; }
    if (amt > available){ setError(`Amount exceeds available balance ($${available.toFixed(2)}).`); return; }
    if (lockStatus.isEligible && lockStatus.isLocked && amt > earningsAboveStake) {
      setError(`Your locked capital return (${(lockStatus.returnPct * 100).toFixed(0)}% of stake) unlocks in ${lockStatus.daysRemaining} more days. You can withdraw profits above your stake ($${earningsAboveStake.toFixed(2)}) now.`);
      return;
    }
    setLoading(true);
    try {
      const { data: freshBal } = await supabase.from("users").select("balance_available").eq("id", userId).single();
      const serverBal = (freshBal as { balance_available: number } | null)?.balance_available ?? 0;
      if (amt > serverBal) { setError(`Amount exceeds confirmed server balance ($${serverBal.toFixed(2)}).`); setLoading(false); return; }
      if (isContract && !contractMature) throw new Error(`Contract locked until ${maturityDate?.toLocaleDateString()}. ${daysLeft} days remaining.`);
      const now   = new Date().toISOString();
      const acct  = payoutInfo!.payout_account_number!;
      const gw    = payoutInfo!.payout_gateway || "manual";
      const aname = payoutInfo!.payout_account_name || "";
      const bank  = payoutInfo!.payout_bank_name || null;
      const expectedDays = amt < 500 ? 1 : amt < 5000 ? 2 : amt < 50000 ? 5 : 7;
      const expectedDate = new Date(Date.now() + expectedDays * 86400000);
      const payload: Record<string, unknown> = {
        user_id: userId, amount: amt, status: "queued", created_at: now,
        payout_method: gw, payout_account_name: aname, payout_bank_name: bank,
        tracking_status: "queued", node_allocation_id: alloc.id,
        expected_date: expectedDate.toISOString(), wallet_address: acct,
      };
      let insErr: { message: string } | null = null;
      const r1 = await supabase.from("withdrawals").insert(payload);
      insErr = r1.error as { message: string } | null;
      if (insErr?.message?.includes("wallet_address")) {
        const { wallet_address, ...noWallet } = payload; void wallet_address;
        insErr = (await supabase.from("withdrawals").insert(noWallet)).error as { message: string } | null;
      }
      if (insErr) throw new Error(insErr.message || "Withdrawal insert failed.");
      const { error: deductErr } = await supabase.from("users")
        .update({ balance_available: Math.max(0, serverBal - amt), last_withdrawal_at: now })
        .eq("id", userId)
        .gte("balance_available", amt);
      if (deductErr) { setError("Balance update failed. Please try again."); setLoading(false); return; }
      await supabase.from("node_allocations")
        .update({ total_withdrawn: (alloc.total_withdrawn ?? 0) + amt, updated_at: now })
        .eq("id", alloc.id);
      const { data: fw } = await supabase.from("users").select("wallet_balance,total_withdrawn").eq("id", userId).single();
      if (fw) {
        const fwData = fw as { wallet_balance: number; total_withdrawn: number };
        await supabase.from("users")
          .update({ wallet_balance: Math.max(0, (fwData.wallet_balance ?? 0) - amt), total_withdrawn: (fwData.total_withdrawn ?? 0) + amt })
          .eq("id", userId);
      }
      try { await recordWithdrawalLedger(supabase, userId, amt, acct, gw); } catch {}
      try {
        await logWithdrawalEvent(supabase, userId, "withdrawal_requested", {
          amount: amt, payout_method: gw, payout_account: acct.slice(0, 12) + "...",
          expected_date: expectedDate.toISOString(), node_allocation_id: alloc.id,
        });
      } catch {}
      onSuccess();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Withdrawal failed. Please try again.";
      setError(msg);
      logWithdrawalEvent(supabase, userId, "withdrawal_failed", { reason: msg, amount: amt }).catch(() => {});
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col" style={{ background: "rgb(10,16,28)", border: "1px solid rgba(16,185,129,0.3)", maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ background: "rgba(16,185,129,0.08)", borderBottom: "1px solid rgba(16,185,129,0.2)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <ArrowUpRight size={16} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-white font-black text-sm">Withdraw Earnings</p>
              <p className="text-slate-500 text-[10px]">{isContract ? "Contract" : "Pay-As-You-Go Mining"}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white ml-2"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {lockStatus.isEligible && lockStatus.isLocked && (
            <div className="rounded-xl px-3 py-2 text-xs text-amber-400 font-bold flex items-center gap-1.5" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <Lock size={10} />
              ${lockStatus.returnAmount.toFixed(2)} ({(lockStatus.returnPct * 100).toFixed(0)}% of your stake) unlocks in {lockStatus.daysRemaining} more days. Profits above your stake are withdrawable now.
            </div>
          )}
          {!isContract && !miningComplete ? (
            <div className="rounded-2xl p-5 text-center" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
              <Pickaxe size={24} className="text-amber-400 mx-auto mb-2" />
              <p className="text-amber-300 font-black text-sm">Mining Still Active</p>
              <p className="text-amber-400/70 text-xs mt-2">Withdraw unlocks when your mining period completes.</p>
              {alloc.mining_ends_at && <p className="text-amber-300 text-xs mt-2 font-bold">Completes: {new Date(alloc.mining_ends_at).toLocaleString()}</p>}
            </div>
          ) : isContract && !contractMature ? (
            <div className="rounded-2xl p-5 text-center" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
              <Lock size={24} className="text-amber-400 mx-auto mb-2" />
              <p className="text-amber-300 font-black text-sm">Contract Locked Until Maturity</p>
              <p className="text-amber-400/70 text-xs mt-2">Contract matures on {maturityDate?.toLocaleDateString()}.</p>
              <p className="text-amber-300 text-xs mt-1 font-bold">{daysLeft} days remaining</p>
            </div>
          ) : (
            <>
              {loadingPayout ? (
                <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
                  <RefreshCw size={13} className="text-blue-400 animate-spin" />
                  <p className="text-slate-400 text-sm">Loading payout account…</p>
                </div>
              ) : (
                <div className="rounded-xl p-4" style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
                  <p className="text-slate-400 text-[10px] uppercase tracking-wide mb-2 flex items-center gap-1.5"><Shield size={9} className="text-blue-400" /> Registered Payout Account</p>
                  {hasPayout ? (
                    <div className="space-y-0.5">
                      <p className="text-white font-bold text-sm">{payoutInfo!.payout_account_name ?? "—"}</p>
                      {payoutInfo!.payout_bank_name && <p className="text-slate-400 text-xs">{payoutInfo!.payout_bank_name}</p>}
                      <p className="text-slate-500 text-xs font-mono">{payoutInfo!.payout_account_number}</p>
                      {kycOk && <p className="text-emerald-400 text-[10px] flex items-center gap-1 mt-1"><CheckCircle size={9} /> KYC verified</p>}
                    </div>
                  ) : (
                    <div>
                      <p className="text-amber-400 text-sm font-bold">No payout account registered</p>
                      <p className="text-slate-500 text-xs mt-0.5">Go to Verification → Payout Setup first.</p>
                    </div>
                  )}
                </div>
              )}
              {!loadingPayout && !kycOk && (
                <div className="rounded-xl p-3" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                  <p className="text-amber-400 text-sm font-bold flex items-center gap-2"><AlertTriangle size={13} /> KYC verification required</p>
                  <p className="text-amber-400/70 text-xs mt-1">Complete identity verification in the Verification section.</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)" }}>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">Total Earned</p>
                  <p className="text-emerald-400 font-black text-lg tabular-nums">${liveEarned.toFixed(4)}</p>
                </div>
                <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">Available Now</p>
                  <p className="text-white font-black text-lg">${available.toFixed(4)}</p>
                </div>
              </div>
              <div>
                <label className="text-slate-300 text-sm font-bold block mb-2">Amount to Withdraw (min ${minW})</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">$</span>
                  <input type="number" min={minW} max={available} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full pl-9 pr-4 py-3 rounded-xl text-lg font-black text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors" />
                </div>
                <div className="flex gap-2 mt-2">
                  {[25, 50, 75, 100].map((p) => (
                    <button key={p} onClick={() => setAmount(((available * p) / 100).toFixed(2))} className="flex-1 text-[11px] font-bold py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-400 transition-all">{p}%</button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ background: isBizDay ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.08)", border: isBizDay ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(245,158,11,0.25)" }}>
                <p className={`text-sm font-bold flex items-center gap-2 ${isBizDay ? "text-emerald-400" : "text-amber-400"}`}><Clock size={13} />{bizMsg}</p>
              </div>
              <div>
                <label className="text-slate-300 text-sm font-bold block mb-2">Security PIN <span className="text-amber-400">*</span></label>
                <input type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="Enter your 4–6 digit PIN" className="w-full px-4 py-3 rounded-xl text-lg font-bold text-center tracking-widest text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              {error && (
                <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                  <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-amber-300 text-sm">{error}</p>
                </div>
              )}
              <button
                onClick={handleWithdraw}
                disabled={loading || !amount || !hasPayout || !kycOk || loadingPayout || pin.length < 4 || !isBizDay || !canWithdrawAny}
                className="w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
              >
                {loading ? <><RefreshCw size={15} className="animate-spin" /> Processing…</> : !isBizDay ? <><Clock size={15} /> Business days only</> : pin.length < 4 ? <><Lock size={15} /> Enter PIN to continue</> : <><Send size={15} /> Withdraw ${amount || "0.00"}</>}
              </button>
              <p className="text-slate-600 text-[11px] text-center pb-1">Funds sent to your registered payout account.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PORTFOLIO CARD ───────────────────────────────────────────────────────────
function PortfolioCard({
  alloc, plan, userId, userBalance, onWithdrawSuccess, onStartNewMining, onRemine,
}: {
  alloc: Allocation; plan: Plan | undefined; userId: string; userBalance: number;
  onWithdrawSuccess: () => void; onStartNewMining: () => void;
  onRemine: (sourceAllocId: string, defaultPlanId: string) => void;
}) {
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [expanded, setExpanded]         = useState(false);
  const liveEarned = useLiveMiningEarnings(alloc, plan);
  const cs         = plan ? (CS[plan.tier_color] ?? CS.slate) : CS.slate;
  const isContract = alloc.payment_model === "contract";
  const now        = new Date();
  const startDate  = new Date(alloc.created_at);
  const maturityDate = alloc.maturity_date ? new Date(alloc.maturity_date) : null;
  const isMatured  = maturityDate ? now >= maturityDate : false;
  const miningDone = alloc.mining_completed || alloc.status === "matured";
  const miningEndsAt = alloc.mining_ends_at ? new Date(alloc.mining_ends_at) : null;
  const withdrawn  = alloc.total_withdrawn ?? 0;
  const available  = Math.max(0, liveEarned - withdrawn);
  const canWithdraw = isContract ? isMatured : miningDone;
  const isExpiredUnclaimed = !miningDone && !isContract && miningEndsAt !== null && miningEndsAt <= new Date();
  const [claiming, setClaiming]   = useState(false);
  const [claimDone, setClaimDone] = useState(false);

  // First-deposit-only capital return status
  const lockStatus = getLockStatusByAmount(
    alloc.created_at,
    alloc.amount_invested,
    alloc.is_first_deposit ?? false,
    alloc.lock_unlock_at,
  );

  const earningsAboveStake  = Math.max(0, liveEarned - alloc.amount_invested);
  const canWithdrawEarnings = earningsAboveStake >= 10;
  const canWithdrawAny =
    canWithdraw && (!lockStatus.isEligible || !lockStatus.isLocked || canWithdrawEarnings);

  // Show re-mine if user has >= $0.50 balance (REMINE_MIN_BALANCE)
  const showReminBtn = (miningDone || claimDone || isMatured) && userBalance >= REMINE_MIN_BALANCE;

  const daysElapsed  = Math.floor((now.getTime() - startDate.getTime()) / 86400000);
  const totalDays    = maturityDate ? Math.ceil((maturityDate.getTime() - startDate.getTime()) / 86400000) : 0;
  const progressPct  = totalDays > 0 ? Math.min(100, (daysElapsed / totalDays) * 100) : 0;
  const daysLeft     = maturityDate ? Math.max(0, Math.ceil((maturityDate.getTime() - now.getTime()) / 86400000)) : 0;
  const period       = alloc.mining_period ?? "daily";
  const safePlan2    = plan ?? ({ tier_index: 0, price_min: 5, short_name: "", name: "", gpu_model: "" } as unknown as Plan);
  const totalProfit  = calcProfit(alloc.amount_invested, safePlan2, period);
  const pMs          = PERIOD_DURATIONS_MS[period] ?? PERIOD_DURATIONS_MS.daily;
  const perSec       = miningDone ? 0 : totalProfit / (pMs / 1000);
  const perHour      = perSec * 3600;

  async function claimEarnings() {
    if (claiming || claimDone) return;
    setClaiming(true);
    try {
      const res = await fetch("/api/mining/claim-session", { method: "POST" });
      if (res.ok) { setClaimDone(true); onWithdrawSuccess(); }
    } catch {}
    setClaiming(false);
  }

  return (
    <>
      {showWithdraw && (
        <WithdrawModal
          alloc={alloc} plan={plan} liveEarned={liveEarned} userId={userId}
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => { setShowWithdraw(false); onWithdrawSuccess(); }}
        />
      )}
      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(10,16,28,0.9)", border: `1px solid ${cs.border}`, boxShadow: `0 0 30px ${cs.glow}` }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ background: cs.bg, borderBottom: `1px solid ${cs.border}` }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${cs.border}` }}>
              {isContract ? <Cpu size={14} className={cs.accent} /> : <Pickaxe size={14} className={cs.accent} />}
            </div>
            <div className="min-w-0">
              <p className="text-white font-black text-sm truncate">{plan?.name ?? alloc.plan_id}</p>
              <p className="text-slate-500 text-[10px]">{plan?.gpu_model ?? ""} · {startDate.toLocaleDateString()}</p>
            </div>
          </div>
          <div className="flex gap-1.5 items-center shrink-0 ml-2 flex-wrap justify-end">
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${isContract ? "bg-violet-900/20 border-violet-800/40 text-violet-400" : "bg-emerald-900/20 border-emerald-800/40 text-emerald-400"}`}>
              {isContract ? "Contract" : "Pay-As-You-Go"}
            </span>
            {(miningDone || isMatured || claimDone) && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-emerald-900/30 border-emerald-700/50 text-emerald-400">Done</span>
            )}
            {isExpiredUnclaimed && !claimDone && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-amber-900/30 border-amber-700/50 text-amber-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Claim Ready
              </span>
            )}
            {!miningDone && !isExpiredUnclaimed && !isContract && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-emerald-900/20 border-emerald-800/40 text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
            )}
            <LockStatusBadge
              isEligible={lockStatus.isEligible}
              isLocked={lockStatus.isLocked}
              daysRemaining={lockStatus.daysRemaining}
              unlockDate={lockStatus.unlockDate}
              returnPct={lockStatus.returnPct}
            />
          </div>
        </div>

        {/* Earnings */}
        <div className="px-4 py-4" style={{ background: "linear-gradient(135deg,rgba(16,185,129,0.06),rgba(0,0,0,0))", borderBottom: `1px solid ${cs.border}` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                {miningDone || claimDone ? "Total Earned (Final)" : isExpiredUnclaimed ? "Mining Complete — Pending Claim" : "Earning Right Now (Live)"}
              </p>
              <p className="text-emerald-400 font-black text-2xl tabular-nums">${liveEarned.toFixed(6)}</p>
              {!miningDone && !claimDone && !isContract && !isExpiredUnclaimed && (
                <p className="text-emerald-500/60 text-[10px] mt-1">+${perSec.toFixed(8)}/sec · +${perHour.toFixed(6)}/hr</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">Available</p>
              <p className="text-white font-black text-xl">${available.toFixed(4)}</p>
              {withdrawn > 0 && <p className="text-slate-600 text-[10px]">after ${withdrawn.toFixed(2)} out</p>}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {([
              { label: "Capital Staked",  value: `$${alloc.amount_invested.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: Wallet,       color: "text-white" },
              { label: "Coins Mined",     value: `$${liveEarned.toFixed(4)}`,     icon: Coins,        color: "text-emerald-400" },
              { label: "Withdrawn",       value: `$${withdrawn.toFixed(2)}`,       icon: ArrowUpRight, color: "text-blue-400" },
              {
                label: isContract ? "Locked Until" : miningDone ? "Status" : "Mining Until",
                value: isContract && maturityDate ? maturityDate.toLocaleDateString() : miningDone ? "Complete" : miningEndsAt ? miningEndsAt.toLocaleDateString() : "—",
                icon: isContract ? Lock : miningDone ? CheckCircle : Pickaxe,
                color: miningDone ? "text-emerald-400" : "text-amber-400",
              },
            ] as { label: string; value: string; icon: React.ComponentType<{ size?: number; className?: string }>; color: string }[]).map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="rounded-xl p-3" style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-center gap-1.5 mb-1.5"><Icon size={10} className="text-slate-600" /><p className="text-slate-500 text-[10px]">{label}</p></div>
                <p className={`font-black text-sm ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Lock info — only shown for the user's first deposit, which is
              the only allocation type with any capital-return concept */}
          {lockStatus.isEligible && (
            <div className="rounded-xl p-3" style={{ background: lockStatus.isLocked ? "rgba(245,158,11,0.06)" : "rgba(16,185,129,0.06)", border: lockStatus.isLocked ? "1px solid rgba(245,158,11,0.18)" : "1px solid rgba(16,185,129,0.18)" }}>
              <div className="flex items-center gap-2">
                <Lock size={10} className={lockStatus.isLocked ? "text-amber-400" : "text-emerald-400"} />
                <p className={`text-xs font-bold ${lockStatus.isLocked ? "text-amber-300" : "text-emerald-300"}`}>
                  {lockStatus.isLocked
                    ? `$${lockStatus.returnAmount.toFixed(2)} (${(lockStatus.returnPct * 100).toFixed(0)}% of stake) unlocks in ${lockStatus.daysRemaining} more days — ${lockStatus.unlockDate?.toLocaleDateString()}`
                    : `$${lockStatus.returnAmount.toFixed(2)} (${(lockStatus.returnPct * 100).toFixed(0)}% of stake) has been returned to your wallet`}
                </p>
              </div>
            </div>
          )}

          {isContract && maturityDate && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5"><Timer size={11} className="text-slate-500" /><span className="text-slate-400 text-xs font-semibold">Contract Progress</span></div>
                <span className="text-xs text-slate-400">{isMatured ? <span className="text-emerald-400 font-bold">Matured</span> : `${daysLeft}d remaining`}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
                <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${progressPct}%`, background: isMatured ? "linear-gradient(90deg,#10b981,#34d399)" : `linear-gradient(90deg,${cs.border},rgba(16,185,129,0.5))` }} />
              </div>
              <div className="flex justify-between text-[10px] text-slate-600">
                <span>{startDate.toLocaleDateString()}</span>
                <span>{progressPct.toFixed(1)}%</span>
                <span>{maturityDate.toLocaleDateString()}</span>
              </div>
            </div>
          )}

          {lockStatus.isEligible && lockStatus.isLocked && (
            <div className="rounded-xl px-3 py-2 text-xs text-amber-400 font-bold flex items-center gap-1.5" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <Lock size={10} /> Profits above your stake (${earningsAboveStake.toFixed(2)}) can be withdrawn now. The remaining {(lockStatus.returnPct * 100).toFixed(0)}% of your stake (${lockStatus.returnAmount.toFixed(2)}) unlocks after the lock period.
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {isExpiredUnclaimed && !claimDone ? (
              <button onClick={claimEarnings} disabled={claiming} className="flex-1 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60" style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#020b04" }}>
                {claiming ? <><RefreshCw size={14} className="animate-spin" /> Claiming…</> : <><Coins size={14} /> Claim Earnings + Capital</>}
              </button>
            ) : (
              <button
                onClick={() => setShowWithdraw(true)}
                disabled={(!canWithdrawAny && !claimDone) || available < 10}
                className="flex-1 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: (canWithdrawAny || claimDone) && available >= 10 ? "linear-gradient(135deg,#10b981,#059669)" : "rgba(100,116,139,0.2)", color: "white" }}
              >
                <ArrowUpRight size={14} />
                {!isContract && !miningDone && !claimDone ? "Mining in Progress…"
                  : isContract && !isMatured ? `Locked · ${daysLeft}d left`
                  : available < 10 ? "Min $10 to withdraw"
                  : `Withdraw $${available.toFixed(2)}`}
              </button>
            )}
            {!isContract && (miningDone || claimDone) && (
              <button onClick={onStartNewMining} className="px-3 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 transition-all" style={{ background: "linear-gradient(135deg,rgba(16,185,129,0.3),rgba(16,185,129,0.1))", border: "1px solid rgba(16,185,129,0.4)", color: "#10b981" }}>
                <RotateCcw size={13} /> New
              </button>
            )}
            {/* Re-mine button: visible to any user with >= $0.50 balance */}
            {showReminBtn && (
              <button
                onClick={() => onRemine(alloc.id, plan?.id ?? "")}
                className="px-3 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 transition-all"
                style={{ background: "linear-gradient(135deg,rgba(52,211,153,0.2),rgba(16,185,129,0.08))", border: "1px solid rgba(52,211,153,0.5)", color: "#34d399" }}
              >
                <Repeat2 size={13} /> Re-mine
              </button>
            )}
            <button onClick={() => setExpanded((v) => !v)} className="px-3 py-3 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-sm font-bold transition-all flex items-center gap-1">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {expanded && (
            <div className="rounded-xl p-4 space-y-1.5" style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-wider mb-3">Full Details</p>
              {([
                ["Plan",              plan?.name ?? alloc.plan_id],
                ["GPU",              plan?.gpu_model ?? alloc.instance_type ?? "—"],
                ["VRAM",             plan?.vram ?? "—"],
                ["Capital Staked",   `$${alloc.amount_invested.toFixed(2)}`],
                ["Payment Model",    isContract ? `Contract — ${alloc.contract_label}` : `Pay-As-You-Go — ${alloc.mining_period ?? "daily"}`],
                ...(!isContract ? [
                  ["Mining Period",  alloc.mining_period ?? "daily"],
                  ["Started",        startDate.toLocaleString()],
                  ...(miningEndsAt ? [["Ends", miningEndsAt.toLocaleString()]] : []),
                  ["Status",         miningDone ? "Complete" : "Active"],
                ] : []),
                ...(isContract && maturityDate ? [
                  ["Maturity Date",  maturityDate.toLocaleString()],
                  ["Days Remaining", isMatured ? "Matured" : `${daysLeft} days`],
                ] : []),
                ...(lockStatus.isEligible ? [
                  ["Capital Return", lockStatus.isLocked
                    ? `${(lockStatus.returnPct * 100).toFixed(0)}% ($${lockStatus.returnAmount.toFixed(2)}) unlocks in ${lockStatus.daysRemaining} days (${lockStatus.unlockDate?.toLocaleDateString()})`
                    : `${(lockStatus.returnPct * 100).toFixed(0)}% ($${lockStatus.returnAmount.toFixed(2)}) returned to wallet`],
                  ["Lock Period",     `${lockStatus.lockDays} days (first deposit, $${alloc.amount_invested.toFixed(2)} stake)`],
                ] : [
                  ["Capital Return",  "Not applicable — capital remains committed to mining"],
                ]),
                ["Total Earned (Live)", `$${liveEarned.toFixed(6)}`],
                ["Total Withdrawn",  `$${withdrawn.toFixed(2)}`],
                ["Available Now",    `$${available.toFixed(6)}`],
                ...(miningDone ? [["Final Profit", `$${(alloc.final_profit ?? liveEarned).toFixed(6)}`]] : []),
              ] as [string, string][]).map(([l, v]) => (
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

// ─── WALLET BALANCE BANNER ────────────────────────────────────────────────────
// Visible to any user with >= $0.50
function WalletBalanceBanner({ balance, onUseBalance }: { balance: number; onUseBalance: () => void }) {
  if (balance < REMINE_MIN_BALANCE) return null;
  return (
    <div className="rounded-2xl p-4 flex items-center justify-between gap-3" style={{ background: "linear-gradient(135deg,rgba(16,185,129,0.1),rgba(16,185,129,0.04))", border: "1px solid rgba(16,185,129,0.3)" }}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}>
          <CircleDollarSign size={18} className="text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-emerald-300 font-black text-sm flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Wallet Balance Available
          </p>
          <p className="text-emerald-400 font-black text-xl tabular-nums">${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-slate-500 text-[10px] mt-0.5">Use your earnings to mine without a new deposit</p>
        </div>
      </div>
      <button onClick={onUseBalance} className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl font-black text-xs text-white transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
        <Repeat2 size={13} /> Re-mine
      </button>
    </div>
  );
}

// ─── RE-MINE MODAL ────────────────────────────────────────────────────────────
function RemineModal({
  userId, plans, userBalance, kycStatus, sourceAllocId, defaultPlanId, onClose, onSuccess,
}: {
  userId: string; plans: Plan[]; userBalance: number; kycStatus: KYCStatus;
  sourceAllocId?: string; defaultPlanId?: string;
  onClose: () => void; onSuccess: (newAllocId: string, amountUsed: number) => void;
}) {
  const kycOk = kycStatus === "approved";
  const [step, setStep]               = useState<"plan" | "configure" | "confirm">(defaultPlanId ? "configure" : "plan");
  const [selectedPlanId, setSelectedPlanId] = useState<string>(defaultPlanId ?? plans[0]?.id ?? "");
  const [amountStr, setAmountStr]     = useState("");
  const [selectedOption, setSelectedOption] = useState<PlanOption | null>(null);
  const [pin, setPin]                 = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const idempotencyKey                = useRef(`rm_${userId}_${Date.now()}`);
  const selectedPlan                  = plans.find((p) => p.id === selectedPlanId);
  const amount                        = parseFloat(amountStr) || 0;

  const amountErr = !amount ? null
    : amount < REMINE_MIN_BALANCE ? `Minimum re-mine is $${REMINE_MIN_BALANCE}`
    : selectedPlan && amount < selectedPlan.price_min ? `Minimum for this plan is $${selectedPlan.price_min}`
    : amount > userBalance ? `Exceeds your balance ($${userBalance.toFixed(2)})`
    : selectedPlan && amount > selectedPlan.price_max ? `Maximum for this plan is $${selectedPlan.price_max.toLocaleString()}`
    : null;

  const quickAmounts = [
    Math.min(userBalance, 1),
    Math.min(userBalance, 10),
    Math.min(userBalance, 50),
    userBalance,
  ].filter((v, i, arr) => v >= REMINE_MIN_BALANCE && arr.indexOf(v) === i).slice(0, 4);

  const options: PlanOption[] = React.useMemo(() => {
    if (!selectedPlan || !amount || amountErr) return [];
    const flexOpts: PlanOption[] = MINING_PERIODS.map((p) => ({
      type: "flexible" as const, period: p, roi: getPlanRoi(selectedPlan, p.key), profit: calcProfit(amount, selectedPlan, p.key),
    }));
    const contractOpts: PlanOption[] = CONTRACT_TERMS.map((t) => ({
      type: "contract" as const, months: t.months, label: t.label, key: t.key, desc: t.desc,
      roi: getPlanRoi(selectedPlan, "monthly") * t.months,
      profit: amount * getPlanRoi(selectedPlan, "monthly") * t.months,
    }));
    return [...flexOpts, ...contractOpts];
  }, [selectedPlan, amount, amountErr]);

  async function handleConfirm() {
    if (!selectedPlan || !selectedOption || amountErr || !amount) return;
    setError("");
    if (pin.length < 4) { setError("Enter your PIN (4–6 digits)"); return; }

    // PIN verification
    const encoder  = new TextEncoder();
    const hashBuf  = await crypto.subtle.digest("SHA-256", encoder.encode(pin + userId));
    const pinHash  = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: ud } = await supabase.from("users").select("pin_hash").eq("id", userId).single();
    if (!ud?.pin_hash || pinHash !== (ud as { pin_hash: string }).pin_hash) { setError("Incorrect PIN. Please try again."); return; }

    // Fresh balance check before deducting
    const { data: freshUser } = await supabase.from("users").select("balance_available").eq("id", userId).single();
    const serverBalance = (freshUser as { balance_available: number } | null)?.balance_available ?? 0;
    if (amount > serverBalance) {
      setError(`Insufficient balance. Server balance is $${serverBalance.toFixed(2)}.`);
      return;
    }

    setLoading(true);
    try {
      const tierIdx = resolveTier(selectedPlan);

      const body: Record<string, unknown> = {
        plan_id: selectedPlan.id,
        amount,
        payment_model: selectedOption.type,
        idempotency_key: idempotencyKey.current,
        source_allocation_id: sourceAllocId ?? null,
        tier_index: tierIdx,
        // No lock_unlock_at sent — re-mines are never a user's first deposit,
        // so they're never eligible for capital return. The backend sets
        // is_first_deposit = false on every re-mine allocation.
      };
      if (selectedOption.type === "flexible") body.mining_period = selectedOption.period.key;
      if (selectedOption.type === "contract") body.contract_months = selectedOption.months;

      const { data: { session: remineSession } } = await supabase.auth.getSession();
      if (!remineSession?.access_token) { setError("Session expired. Please sign in again."); setLoading(false); return; }

      const res  = await fetch("/api/mining/remine", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${remineSession.access_token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { success?: boolean; error?: string; allocation_id?: string; duplicate?: boolean };

      if (!res.ok || !data.success) {
        setError(data.duplicate ? "Duplicate request detected." : (data.error ?? "Re-mine failed. Please try again."));
        setLoading(false);
        return;
      }

      // Balance is already deducted atomically on the server via
      // deduct_balance_atomic inside /api/mining/remine. Do NOT deduct
      // again here — that would double-charge the user's wallet.
      // The ledger entry is also already written server-side (remine_requests
      // + the atomic RPC). onSuccess() just updates local UI state.
      onSuccess(data.allocation_id!, amount);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl overflow-hidden flex flex-col" style={{ background: "rgb(9,14,26)", border: "1px solid rgba(16,185,129,0.35)", maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ background: "rgba(16,185,129,0.09)", borderBottom: "1px solid rgba(16,185,129,0.2)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center"><Repeat2 size={16} className="text-emerald-400" /></div>
            <div>
              <p className="text-white font-black text-sm">Re-mine from Balance</p>
              <p className="text-slate-500 text-[10px]">Available: <span className="text-emerald-400 font-bold">${userBalance.toFixed(2)}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!kycOk && (
            <div className="rounded-2xl p-5 text-center" style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.25)" }}>
              <ShieldCheck size={24} className="text-amber-400 mx-auto mb-2" />
              <p className="text-amber-300 font-black text-sm">KYC Verification Required</p>
              <p className="text-amber-400/70 text-xs mt-2 leading-relaxed">Identity verification is required before re-mining from your balance.</p>
            </div>
          )}
          {kycOk && step === "plan" && (
            <>
              <p className="text-slate-300 text-sm font-black">Which node do you want to mine on?</p>
              <div className="space-y-2">
                {plans.filter((p) => !p.is_admin_locked).map((p) => {
                  const pcs        = CS[p.tier_color ?? "slate"] ?? CS.slate;
                  const canAfford  = userBalance >= Math.max(REMINE_MIN_BALANCE, p.price_min);
                  return (
                    <button key={p.id} onClick={() => { if (canAfford) { setSelectedPlanId(p.id); setStep("configure"); } }} disabled={!canAfford}
                      className={`w-full rounded-xl p-3 text-left transition-all flex items-center gap-3 ${!canAfford ? "opacity-40 cursor-not-allowed" : "hover:bg-white/5"}`}
                      style={{ background: pcs.bg, border: `1px solid ${pcs.border}` }}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(0,0,0,0.3)", border: `1px solid ${pcs.border}` }}><Cpu size={14} className={pcs.accent} /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-black text-sm">{p.name}</p>
                        <p className="text-slate-500 text-[10px]">{p.gpu_model} · Min ${p.price_min}</p>
                      </div>
                      <p className={`text-[10px] font-bold ${canAfford ? "text-emerald-400" : "text-amber-400"}`}>
                        {canAfford ? "Available" : `Need $${(p.price_min - userBalance).toFixed(2)} more`}
                      </p>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {kycOk && step === "configure" && selectedPlan && (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => setStep("plan")} className="text-slate-500 hover:text-white text-xs">Back</button>
                <p className="text-white text-xs font-black flex-1 truncate">{selectedPlan.name}</p>
                <span className="text-emerald-400 text-xs font-bold">${userBalance.toFixed(2)} available</span>
              </div>

              <div>
                <label className="text-slate-400 text-xs font-bold block mb-2">Amount to stake (min ${REMINE_MIN_BALANCE})</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">$</span>
                  <input type="number" value={amountStr} onChange={(e) => { setAmountStr(e.target.value); setSelectedOption(null); }}
                    placeholder={`Min $${REMINE_MIN_BALANCE}`}
                    className="w-full pl-9 pr-4 py-3.5 rounded-xl text-xl font-black text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
                    style={{ appearance: "textfield" } as React.CSSProperties} />
                </div>
                {amountErr && amount > 0 && <p className="text-amber-400 text-xs mt-1.5">{amountErr}</p>}
                {quickAmounts.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {quickAmounts.map((v) => (
                      <button key={v} onClick={() => { setAmountStr(v.toFixed(2)); setSelectedOption(null); }}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all ${parseFloat(amountStr) === v ? "border-emerald-500/60 text-emerald-400 bg-emerald-500/10" : "border-slate-700 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-400"}`}>
                        {v === userBalance ? "Max" : `$${v}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!amountErr && amount > 0 && options.length > 0 && (
                <div className="space-y-2">
                  <p className="text-slate-400 text-xs font-bold">Choose earning period</p>
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(16,185,129,0.2)" }}>
                    <div className="px-3 py-2" style={{ background: "rgba(16,185,129,0.08)", borderBottom: "1px solid rgba(16,185,129,0.15)" }}>
                      <p className="text-emerald-300 text-[11px] font-black uppercase tracking-wide">Pay-As-You-Go — Flexible</p>
                      <p className="text-slate-500 text-[10px] mt-0.5">Capital and earnings returned at end of period</p>
                    </div>
                    {options.filter((o): o is FlexOption => o.type === "flexible").map((opt) => {
                      const isSelected = selectedOption?.type === "flexible" && selectedOption.period.key === opt.period.key;
                      const label      = PLAIN_PERIOD_LABELS[opt.period.key] ?? opt.period.label;
                      return (
                        <button key={opt.period.key} onClick={() => setSelectedOption(opt)} className="w-full flex items-center justify-between px-3 py-3 transition-all hover:bg-white/5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: isSelected ? "rgba(16,185,129,0.12)" : undefined }}>
                          <div className="flex items-center gap-2">
                            {isSelected ? <CheckCircle size={13} className="text-emerald-400" /> : <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />}
                            <span className={`text-sm font-bold ${isSelected ? "text-white" : "text-slate-300"}`}>{label}</span>
                          </div>
                          <div className="text-right">
                            <p className="text-emerald-400 font-black text-sm">${opt.profit.toFixed(2)}</p>
                            <p className="text-slate-500 text-[10px]">{(opt.roi * 100).toFixed(2)}% return</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(139,92,246,0.2)" }}>
                    <div className="px-3 py-2" style={{ background: "rgba(139,92,246,0.08)", borderBottom: "1px solid rgba(139,92,246,0.15)" }}>
                      <p className="text-violet-300 text-[11px] font-black uppercase tracking-wide">Contract — Capital Locked</p>
                      <p className="text-slate-500 text-[10px] mt-0.5">Higher returns — capital released at maturity</p>
                    </div>
                    {options.filter((o): o is ContractOption => o.type === "contract").map((opt) => {
                      const isSelected = selectedOption?.type === "contract" && selectedOption.key === opt.key;
                      return (
                        <button key={opt.key} onClick={() => setSelectedOption(opt)} className="w-full flex items-center justify-between px-3 py-3 transition-all hover:bg-white/5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: isSelected ? "rgba(139,92,246,0.12)" : undefined }}>
                          <div className="flex items-center gap-2">
                            {isSelected ? <CheckCircle size={13} className="text-violet-400" /> : <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />}
                            <div className="text-left">
                              <p className={`text-sm font-bold ${isSelected ? "text-white" : "text-slate-300"}`}>{opt.label}</p>
                              <p className="text-slate-600 text-[10px] flex items-center gap-1"><Lock size={8} /> locked period</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-violet-400 font-black text-sm">${opt.profit.toFixed(2)}</p>
                            <p className="text-slate-500 text-[10px]">{(opt.roi * 100).toFixed(2)}% total</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <button disabled={!selectedOption || !!amountErr || !amount} onClick={() => setStep("confirm")}
                className="w-full py-3.5 rounded-xl font-black text-white text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
                Continue to Confirm <ArrowRight size={14} />
              </button>
            </>
          )}
          {kycOk && step === "confirm" && selectedPlan && selectedOption && (
            <>
              <button onClick={() => setStep("configure")} className="text-slate-500 hover:text-white text-xs flex items-center gap-1">Back</button>
              <div className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)" }}>
                <p className="text-emerald-300 font-black text-xs uppercase tracking-wide mb-3 flex items-center gap-1.5"><CheckCircle size={11} /> Re-mine Summary</p>
                {([
                  ["Plan",          selectedPlan.name],
                  ["GPU",           selectedPlan.gpu_model],
                  ["Type",          selectedOption.type === "flexible"
                    ? `Pay-As-You-Go — ${PLAIN_PERIOD_LABELS[selectedOption.period.key] ?? selectedOption.period.label}`
                    : `Contract — ${selectedOption.label}`],
                  ["Amount",        `$${amount.toFixed(2)} deducted from wallet`],
                  ["Capital",       "Committed to mining — not eligible for separate capital return"],
                  ["Wallet after",  `$${Math.max(0, userBalance - amount).toFixed(2)}`],
                  ["Est. profit",   `$${selectedOption.profit.toFixed(2)} (withdrawable once mining completes)`],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} className="flex justify-between items-start">
                    <span className="text-slate-500 text-xs">{l}</span>
                    <span className="text-slate-200 text-xs font-bold text-right max-w-[60%]">{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <label className="text-slate-300 text-sm font-bold block mb-2">Confirm with PIN <span className="text-amber-400">*</span></label>
                <input type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="Enter your 4–6 digit PIN"
                  className="w-full px-4 py-3 rounded-xl text-lg font-bold text-center tracking-widest text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors" autoFocus />
              </div>
              {error && (
                <div className="rounded-xl p-3 flex items-start gap-2" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                  <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-amber-300 text-sm">{error}</p>
                </div>
              )}
              <button onClick={handleConfirm} disabled={loading || pin.length < 4}
                className="w-full py-4 rounded-xl font-black text-white text-base flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
                {loading ? <><RefreshCw size={15} className="animate-spin" /> Processing…</>
                  : pin.length < 4 ? <><Lock size={15} /> Enter PIN to confirm</>
                  : <><Repeat2 size={15} /> Confirm Re-mine · ${amount.toFixed(2)}</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── KYC GATE MODAL ───────────────────────────────────────────────────────────
function KYCGateModal({ kycStatus, onClose, onGoVerify }: { kycStatus: KYCStatus; onClose: () => void; onGoVerify: () => void }) {
  const isPending  = kycStatus === "pending";
  const isRejected = kycStatus === "rejected";
  const accent = isPending || isRejected ? "#f59e0b" : "#10b981";
  const dim    = isPending || isRejected ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.08)";
  const brd    = isPending || isRejected ? "rgba(245,158,11,0.25)" : "rgba(16,185,129,0.25)";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(10px)" }}>
      <div className="relative w-full max-w-lg rounded-3xl overflow-hidden" style={{ background: "rgb(10,15,26)", border: `1px solid ${brd}` }}>
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${accent},transparent)` }} />
        <div className="px-6 pt-6 pb-5" style={{ background: dim, borderBottom: `1px solid ${brd}` }}>
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"><X size={14} className="text-slate-400" /></button>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: dim, border: `1px solid ${brd}` }}>
              {isPending ? <Clock size={22} style={{ color: accent }} /> : isRejected ? <AlertTriangle size={22} style={{ color: accent }} /> : <UserCheck size={22} style={{ color: accent }} />}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: accent }}>
                {isPending ? "Verification In Progress" : isRejected ? "Verification Rejected" : "Identity Verification Required"}
              </p>
              <h3 className="text-white font-black text-lg leading-tight">
                {isPending ? "KYC Under Review" : isRejected ? "Resubmit Your Documents" : "Verify to Withdraw"}
              </h3>
              <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                {isPending ? "Our team is reviewing your documents (24–48 hrs). Withdrawals unlock automatically once approved."
                  : isRejected ? "Your previous submission was rejected. Resubmit with clear, valid government-issued documents."
                  : "Withdrawals require identity verification. Takes less than 5 minutes."}
              </p>
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 pt-5 space-y-2">
          {!isPending && (
            <button onClick={onGoVerify} className="w-full py-3.5 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2 transition-all hover:opacity-90" style={{ background: `linear-gradient(135deg,${accent},${accent}cc)` }}>
              <FileCheck size={16} /> {isRejected ? "Resubmit Verification Documents" : "Start Identity Verification"} <ArrowRight size={14} />
            </button>
          )}
          <button onClick={onClose} className="w-full py-2 text-slate-600 text-xs hover:text-slate-400 transition-colors">
            {isPending ? "Close — I'll wait for approval" : "Go back"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PLAN CARD ────────────────────────────────────────────────────────────────
type IconComponent = React.ComponentType<{ size?: number; className?: string }>;

function PlanCard({
  plan, index, event, userAlloc, onWaitlist, onMine, waitlisted, kycStatus: _kycStatus, onNeedKYC: _onNeedKYC,
}: {
  plan: Plan; index: number; event: DemandEvent | null; userAlloc: Allocation | null;
  onWaitlist: () => void;
  onMine: (amount: number, itype: string, model: "flexible" | "contract", period?: string, term?: (typeof CONTRACT_TERMS)[0]) => void;
  waitlisted: boolean; kycStatus: KYCStatus; onNeedKYC: () => void;
}) {
  const liteNode           = isLiteNode(plan);
  const effectiveTierColor = liteNode ? "sky" : plan.tier_color;
  const cs                 = CS[effectiveTierColor] ?? CS.slate;
  const cap                = useCapacity(index);

  const [isOpen, setIsOpen]           = useState(false);
  const [amountStr, setAmountStr]     = useState(String(plan.price_min));
  const [selectedOption, setSelectedOption] = useState<PlanOption | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [section, setSection]         = useState<string | null>(null);

  const isSurge  = event?.event_type === "surge" && event.is_active;
  const waitOnly = plan.is_waitlist || plan.is_invite_only;
  const amount   = parseFloat(amountStr) || 0;

  const amountErr = !amount || amount < plan.price_min
    ? `Minimum stake is $${plan.price_min.toLocaleString()}`
    : amount > plan.price_max
      ? `Maximum is $${plan.price_max.toLocaleString()}`
      : null;

  const quickVals = [5, 50, 100, 250, 500, 1000, 5000].filter((v) => v >= plan.price_min && v <= plan.price_max).slice(0, 4);
  const showFlex     = plan.payment_model === "flexible" || plan.payment_model === "both" || liteNode;
  const showContract = plan.payment_model === "contract" || plan.payment_model === "both" || liteNode;

  const options: PlanOption[] = React.useMemo(() => {
    if (!amount || amountErr) return [];
    const flexOpts: PlanOption[] = showFlex ? MINING_PERIODS.map((p) => ({
      type: "flexible" as const, period: p, roi: getPlanRoi(plan, p.key), profit: calcProfit(amount, plan, p.key),
    })) : [];
    const contractOpts: PlanOption[] = showContract ? CONTRACT_TERMS.map((t) => ({
      type: "contract" as const, months: t.months, label: t.label, key: t.key, desc: t.desc,
      roi: getPlanRoi(plan, "monthly") * t.months,
      profit: amount * getPlanRoi(plan, "monthly") * t.months,
    })) : [];
    return [...flexOpts, ...contractOpts];
  }, [amount, amountErr, plan, showFlex, showContract]);

  const INFO_SECTIONS: Array<{ id: string; lbl: string; Icon: IconComponent }> = [
    { id: "specs",    lbl: "GPU Specs",  Icon: Server },
    { id: "usecases", lbl: "Use Cases",  Icon: Layers },
    { id: "risk",     lbl: "Risk",       Icon: AlertTriangle },
    { id: "legal",    lbl: "Legal",      Icon: BookOpen },
  ];
  const SPEC_ROWS: Array<{ lbl: string; val: string; Icon: IconComponent }> = [
    { lbl: "Model",        val: plan.gpu_model,      Icon: Cpu },
    { lbl: "VRAM",         val: plan.vram,            Icon: HardDrive },
    { lbl: "TDP",          val: plan.tdp,             Icon: Thermometer },
    { lbl: "Architecture", val: plan.architecture,    Icon: Layers },
    { lbl: "TFLOPS",       val: `${plan.tflops} TF`, Icon: Gauge },
    { lbl: "Node Type",    val: plan.instance_type,   Icon: Server },
  ];

  function handleMine() {
    if (!selectedOption || amountErr) return;
    if (selectedOption.type === "flexible") {
      onMine(amount, plan.instance_type, "flexible", selectedOption.period.key);
    } else {
      const term = CONTRACT_TERMS.find((t) => t.key === selectedOption.key);
      onMine(amount, plan.instance_type, "contract", undefined, term);
    }
  }

  if (plan.is_admin_locked) {
    return (
      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(100,116,139,0.2)" }}>
        <div className="flex items-center justify-between px-4 py-4 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(100,116,139,0.1)", border: "1px solid rgba(100,116,139,0.2)" }}><Cpu size={16} className="text-slate-500" /></div>
            <div className="min-w-0">
              <p className="text-white font-black text-sm truncate">{plan.name}</p>
              <p className="text-slate-600 text-[11px]">{plan.gpu_model} · {plan.vram}</p>
            </div>
          </div>
          <div className="shrink-0 text-right flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black" style={{ background: "rgba(100,116,139,0.1)", border: "1px solid rgba(100,116,139,0.2)", color: "#64748b" }}><Lock size={9} /> Coming Soon</div>
            <p className="text-slate-400 text-xs font-bold">${plan.price_min.toLocaleString()} — ${plan.price_max.toLocaleString()}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden transition-all duration-300" style={{ background: cs.bg, border: `1px solid ${cs.border}`, boxShadow: `0 0 30px ${cs.glow}` }}>
      {liteNode && (
        <div className="flex items-center justify-between px-4 py-1.5" style={{ background: "rgba(14,165,233,0.1)", borderBottom: "1px solid rgba(14,165,233,0.2)" }}>
          <div className="flex items-center gap-1.5">
            <Star size={9} className="text-sky-400" />
            <span className="text-sky-400 text-[10px] font-black uppercase tracking-widest">Entry Node</span>
          </div>
          <span className="text-sky-500 text-[9px] font-semibold">Starter — Low minimum</span>
        </div>
      )}
      {isSurge && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs font-bold" style={{ background: "rgba(16,185,129,0.12)", borderBottom: "1px solid rgba(16,185,129,0.2)" }}>
          <Zap size={11} className="text-emerald-400 animate-pulse" />
          <span className="text-emerald-300">{event!.title} — Output boosted {event!.multiplier}x</span>
        </div>
      )}

      {/* Collapsed summary row */}
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: cs.bg, border: `1px solid ${cs.border}` }}>
          <Cpu size={18} className={cs.accent} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <h3 className="text-white font-black text-sm">{plan.name}</h3>
            {liteNode   && <Pill className="border-sky-700/50 text-sky-400 bg-sky-900/20">starter</Pill>}
            {waitOnly   && <Pill className="border-amber-700/50 text-amber-400 bg-amber-900/20">Waitlist</Pill>}
            {userAlloc  && <Pill className="border-emerald-700/50 text-emerald-400 bg-emerald-900/20">Active</Pill>}
          </div>
          <p className="text-slate-500 text-[11px]">{plan.gpu_model} · {plan.vram} VRAM</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className={`text-xs font-black ${cs.accent}`}>Daily: +{(getPlanRoi(plan, "daily") * 100).toFixed(2)}%</span>
            <span className="text-slate-600 text-[10px]">Min ${plan.price_min.toLocaleString()}</span>
          </div>
        </div>
        {!plan.is_locked && !waitOnly && (
          <button onClick={() => setIsOpen((v) => !v)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all"
            style={{ background: isOpen ? cs.bg : `linear-gradient(135deg,${cs.hex}22,${cs.hex}11)`, border: `1px solid ${cs.border}`, color: cs.hex }}>
            {isOpen ? "Close" : "Select"} {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
        {(plan.is_locked || (waitOnly && !userAlloc)) && (
          <div className="shrink-0">
            {plan.is_locked ? (
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full" style={{ background: "rgba(100,116,139,0.1)", border: "1px solid rgba(100,116,139,0.2)", color: "#64748b" }}>Locked</span>
            ) : waitlisted ? (
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-amber-900/20 border border-amber-700/40 text-amber-400">On waitlist</span>
            ) : (
              <button onClick={onWaitlist} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all">
                <Clock size={11} /> Join Waitlist
              </button>
            )}
          </div>
        )}
      </div>

      {/* Capacity bar */}
      <div className="px-4 pb-3">
        <div className="flex justify-between text-[10px] text-slate-600 mb-1">
          <span>Cluster utilisation</span><span>{cap}%</span>
        </div>
        <div className="h-1 rounded-full bg-slate-800/80 overflow-hidden">
          <div className="h-1 rounded-full transition-all duration-1000" style={{ width: `${cap}%`, background: `linear-gradient(90deg,${cs.border},${cs.glow})` }} />
        </div>
      </div>

      {/* Expanded: step-by-step config */}
      {isOpen && !plan.is_locked && (
        <div className="border-t px-4 pb-5 pt-4 space-y-5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>

          {/* STEP 1: Amount */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: cs.hex, color: "#000" }}>1</div>
              <p className="text-white text-sm font-black">How much do you want to stake?</p>
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">$</span>
              <input type="number" min={plan.price_min} max={plan.price_max} value={amountStr}
                onChange={(e) => { setAmountStr(e.target.value); setSelectedOption(null); }}
                onFocus={(e) => { if (e.target.value === String(plan.price_min)) setAmountStr(""); }}
                onBlur={(e) => { if (!e.target.value || parseFloat(e.target.value) < plan.price_min) setAmountStr(String(plan.price_min)); }}
                placeholder={`Min $${plan.price_min}`}
                className="w-full pl-9 pr-4 py-3.5 rounded-xl text-xl font-black text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
                style={{ appearance: "textfield" } as React.CSSProperties} />
            </div>
            {amountErr && amount > 0 && <p className="text-amber-400 text-xs mt-1.5">{amountErr}</p>}
            {quickVals.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {quickVals.map((v) => (
                  <button key={v} onClick={() => { setAmountStr(String(v)); setSelectedOption(null); }} className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-slate-700 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-400 transition-all">${v.toLocaleString()}</button>
                ))}
              </div>
            )}
          </div>

          {/* STEP 2: Period */}
          {!amountErr && amount > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: cs.hex, color: "#000" }}>2</div>
                <p className="text-white text-sm font-black">Choose how long to mine</p>
              </div>
              <p className="text-slate-500 text-xs mb-3">
                Estimated earnings on <span className="text-white font-bold">${amount.toLocaleString()}</span>. Pick a time that works for you.
              </p>
              {showFlex && (
                <div className="rounded-xl overflow-hidden mb-2" style={{ border: "1px solid rgba(16,185,129,0.2)" }}>
                  <div className="px-3 py-2.5" style={{ background: "rgba(16,185,129,0.07)", borderBottom: "1px solid rgba(16,185,129,0.12)" }}>
                    <p className="text-emerald-300 text-xs font-black">Pay-As-You-Go</p>
                    <p className="text-slate-500 text-[10px] mt-0.5">You get your stake back plus earnings when the period ends. No long-term commitment.</p>
                  </div>
                  {options.filter((o): o is FlexOption => o.type === "flexible").map((opt, i, arr) => {
                    const isSelected = selectedOption?.type === "flexible" && (selectedOption as FlexOption).period.key === opt.period.key;
                    const label      = PLAIN_PERIOD_LABELS[opt.period.key] ?? opt.period.label;
                    return (
                      <button key={opt.period.key} onClick={() => setSelectedOption(opt)} className="w-full flex items-center justify-between px-3 py-3 transition-all hover:bg-white/5 text-left" style={{ borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", background: isSelected ? "rgba(16,185,129,0.1)" : undefined }}>
                        <div className="flex items-center gap-2.5">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? "border-emerald-400 bg-emerald-400" : "border-slate-600"}`}>
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />}
                          </div>
                          <span className={`text-sm font-bold ${isSelected ? "text-white" : "text-slate-300"}`}>{label}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-emerald-400 font-black text-sm">${opt.profit.toFixed(2)}</p>
                          <p className="text-slate-500 text-[10px]">{(opt.roi * 100).toFixed(2)}% return</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {showContract && (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(139,92,246,0.2)" }}>
                  <div className="px-3 py-2.5" style={{ background: "rgba(139,92,246,0.07)", borderBottom: "1px solid rgba(139,92,246,0.12)" }}>
                    <p className="text-violet-300 text-xs font-black flex items-center gap-1.5"><Lock size={10} /> Contract — Higher Returns</p>
                    <p className="text-slate-500 text-[10px] mt-0.5">Your stake is locked until the contract ends. You earn more, but cannot withdraw early.</p>
                  </div>
                  {options.filter((o): o is ContractOption => o.type === "contract").map((opt, i, arr) => {
                    const isSelected = selectedOption?.type === "contract" && (selectedOption as ContractOption).key === opt.key;
                    return (
                      <button key={opt.key} onClick={() => setSelectedOption(opt)} className="w-full flex items-center justify-between px-3 py-3 transition-all hover:bg-white/5 text-left" style={{ borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", background: isSelected ? "rgba(139,92,246,0.1)" : undefined }}>
                        <div className="flex items-center gap-2.5">
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? "border-violet-400 bg-violet-400" : "border-slate-600"}`}>
                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />}
                          </div>
                          <div>
                            <p className={`text-sm font-bold ${isSelected ? "text-white" : "text-slate-300"}`}>{opt.label}</p>
                            <p className="text-slate-600 text-[10px]">locked — released at maturity</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-violet-400 font-black text-sm">${opt.profit.toFixed(2)}</p>
                          <p className="text-slate-500 text-[10px]">{(opt.roi * 100).toFixed(2)}% total</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Selection summary */}
          {selectedOption && (
            <div className="rounded-xl px-3 py-2.5 flex items-center justify-between" style={{ background: selectedOption.type === "contract" ? "rgba(139,92,246,0.08)" : "rgba(16,185,129,0.08)", border: selectedOption.type === "contract" ? "1px solid rgba(139,92,246,0.25)" : "1px solid rgba(16,185,129,0.25)" }}>
              <div className="flex items-center gap-2">
                <CheckCircle size={12} className={selectedOption.type === "contract" ? "text-violet-400" : "text-emerald-400"} />
                <span className="text-slate-300 text-xs">
                  {selectedOption.type === "flexible"
                    ? `${PLAIN_PERIOD_LABELS[selectedOption.period.key] ?? selectedOption.period.label} — Pay-As-You-Go`
                    : `${selectedOption.label} — Contract (locked)`}
                </span>
              </div>
              <span className={`font-black text-sm ${selectedOption.type === "contract" ? "text-violet-400" : "text-emerald-400"}`}>
                +${selectedOption.profit.toFixed(2)}
              </span>
            </div>
          )}

          {/* Specs toggle */}
          <div className="space-y-2">
            <button onClick={() => setShowDetails((v) => !v)} className="flex items-center gap-1.5 text-slate-500 text-[11px] font-bold hover:text-slate-300 transition-colors">
              <Info size={10} />{showDetails ? "Hide details" : "Show specs and legal"} {showDetails ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
            {showDetails && (
              <>
                <div className="flex gap-1.5 flex-wrap">
                  {INFO_SECTIONS.map(({ id, lbl, Icon }) => (
                    <button key={id} onClick={() => setSection(section === id ? null : id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${section === id ? "text-white border-slate-600 bg-slate-700/60" : "text-slate-500 border-slate-800/50 hover:border-slate-600 hover:text-slate-300"}`}>
                      <Icon size={10} />{lbl}
                    </button>
                  ))}
                </div>
                {section && (
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="p-4 space-y-3" style={{ background: "rgba(8,13,24,0.85)" }}>
                      {section === "specs" && (
                        <div className="grid grid-cols-2 gap-2">
                          {SPEC_ROWS.map(({ lbl, val, Icon }) => (
                            <div key={lbl} className="rounded-lg p-2.5 space-y-1" style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(255,255,255,0.05)" }}>
                              <div className="flex items-center gap-1"><Icon size={10} className="text-slate-600" /><span className="text-slate-600 text-[9px] uppercase tracking-wider">{lbl}</span></div>
                              <p className={`text-xs font-bold leading-tight ${cs.accent}`}>{val}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {section === "usecases" && (
                        <div className="space-y-2">
                          {(plan.use_cases ?? []).map((uc) => (
                            <div key={uc} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: "rgba(15,23,42,0.7)", border: "1px solid rgba(255,255,255,0.05)" }}>
                              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: cs.bg, border: `1px solid ${cs.border}` }}><Zap size={11} className={cs.accent} /></div>
                              <div>
                                <p className="text-white text-xs font-bold">{uc}</p>
                                <p className="text-slate-500 text-[11px] mt-0.5">High-performance GPU compute.</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {section === "risk" && (
                        <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.18)" }}>
                          <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                          <p className="text-amber-400/80 text-[11px] leading-relaxed"><strong className="text-amber-300">Risk Disclosure:</strong> Mining rewards are variable and not guaranteed. Past performance is not indicative of future results.</p>
                        </div>
                      )}
                      {section === "legal" && (
                        <div className="space-y-2">
                          {([
                            ["Not a Security",       "Node allocations are not classified as securities under applicable regulations."],
                            ["No Guaranteed Returns","All projected figures are estimates. We make no guarantee of minimum returns."],
                            ["AML / KYC",            "Withdrawals require identity verification. KYC must be approved before any payout is processed."],
                          ] as [string, string][]).map(([t, d]) => (
                            <div key={t} className="flex gap-2.5 p-3 rounded-lg" style={{ background: "rgba(15,23,42,0.7)", border: "1px solid rgba(255,255,255,0.05)" }}>
                              <BookOpen size={11} className="text-slate-500 mt-0.5 shrink-0" />
                              <div><p className="text-white text-xs font-bold">{t}</p><p className="text-slate-400 text-[11px] mt-0.5">{d}</p></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* STEP 3: CTA */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: selectedOption ? cs.hex : "rgba(100,116,139,0.3)", color: selectedOption ? "#000" : "#64748b" }}>3</div>
              <p className={`text-sm font-black ${selectedOption ? "text-white" : "text-slate-500"}`}>Confirm and start mining</p>
            </div>
            <button
              disabled={!selectedOption || !!amountErr || !amount}
              onClick={handleMine}
              className="w-full py-4 rounded-xl text-base font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: !selectedOption || amountErr || !amount ? undefined
                  : selectedOption.type === "contract"
                    ? "linear-gradient(135deg,rgba(139,92,246,0.9),rgba(99,102,241,0.7))"
                    : liteNode
                      ? "linear-gradient(135deg,#0ea5e9,rgba(14,165,233,0.7))"
                      : `linear-gradient(135deg,${cs.hex},rgba(16,185,129,0.7))`,
              }}
            >
              {!selectedOption ? (
                <>Select a period above <ChevronUp size={14} /></>
              ) : selectedOption.type === "contract" ? (
                <><FileCheck size={14} /> Lock In ${amount > 0 ? amount.toLocaleString() : "—"} — {selectedOption.label} <ArrowRight size={13} /></>
              ) : (
                <><Pickaxe size={14} /> Start Mining — ${amount > 0 ? amount.toLocaleString() : "—"} — {PLAIN_PERIOD_LABELS[selectedOption.period.key] ?? selectedOption.period.label} <ArrowRight size={13} /></>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function GPUPlansPage() {
  const router = useRouter();
  const [plans, setPlans]           = useState<Plan[]>([]);
  const [events, setEvents]         = useState<DemandEvent[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [waitlist, setWaitlist]     = useState<WaitlistEntry[]>([]);
  const [userId, setUserId]         = useState<string | null>(null);
  const [userEmail, setUserEmail]   = useState("");
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [activeNotif, setActiveNotif] = useState<Notification | null>(null);
  const [showKYC, setShowKYC]       = useState(false);
  const [activeTab, setActiveTab]   = useState<"plans" | "portfolio">("plans");
  const networkEarnings             = useLiveNetworkEarnings();
  const { kycStatus }               = useKycStatus(userId);
  const [ratesSynced, setRatesSynced] = useState(false);
  const [userBalance, setUserBalance] = useState(0);
  const [showRemine, setShowRemine] = useState(false);
  const [remineSourceAllocId, setRemineSourceAllocId] = useState<string | undefined>();
  const [remineDefaultPlanId, setRemineDefaultPlanId] = useState<string | undefined>();

  function openRemine(sourceAllocId?: string, defaultPlanId?: string) {
    setRemineSourceAllocId(sourceAllocId);
    setRemineDefaultPlanId(defaultPlanId);
    setShowRemine(true);
  }

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function goToVerification() {
    setShowKYC(false);
    if (typeof window !== "undefined") sessionStorage.setItem("kyc_redirect", "/dashboard/gpu-plans");
    router.push("/dashboard/verification");
  }

  const loadAll = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { router.push("/auth/signin"); return; }
    const u = session.user;
    setUserId(u.id);
    setUserEmail(u.email ?? "");
    const [{ data: p }, { data: ev }, { data: al }, { data: wl }, { data: notifs }, { data: uf }] = await Promise.all([
      supabase.from("gpu_plans").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("demand_events").select("*").eq("is_active", true),
      supabase.from("node_allocations").select("*").eq("user_id", u.id).order("created_at", { ascending: false }),
      supabase.from("gpu_waitlist").select("plan_id,status").eq("user_id", u.id),
      supabase.from("user_notifications").select("*").eq("user_id", u.id).is("read_at", null).order("created_at", { ascending: false }).limit(5),
      supabase.from("users").select("balance_available,kyc_verified,kyc_status,total_remined").eq("id", u.id).single(),
    ]);
    setPlans(p ?? []);
    setEvents(ev ?? []);
    setAllocations(al ?? []);
    setWaitlist(wl ?? []);
    if (notifs?.length) setActiveNotif(notifs[0]);
    setUserBalance((uf as UserFinance | null)?.balance_available ?? 0);
    setLoading(false);
  }, [router]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!userId || ratesSynced) return;
    setRatesSynced(true);
    syncPlanRatesToDB().catch((e) => console.warn("[plan-sync]", e));
  }, [userId, ratesSynced]);

  const [autoCompleting, setAutoCompleting] = useState(false);
  const autoCompleteExpiredSessions = useCallback(async () => {
    if (!userId || autoCompleting) return;
    const expired = allocations.filter((a) => !a.mining_completed && a.payment_model === "flexible" && a.mining_ends_at && new Date(a.mining_ends_at) <= new Date());
    if (!expired.length) return;
    setAutoCompleting(true);
    try {
      const res  = await fetch("/api/mining/claim-session", { method: "POST" });
      if (res.ok) {
        const data = await res.json() as { completed?: number; processed?: number };
        const n    = data.completed ?? data.processed ?? 0;
        if (n > 0) { showToast(`${n} session${n > 1 ? "s" : ""} completed — earnings credited!`); await loadAll(); }
      }
    } catch {}
    setAutoCompleting(false);
  }, [userId, allocations, autoCompleting, loadAll]);

  useEffect(() => {
    if (activeTab === "portfolio") autoCompleteExpiredSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel("allocs_rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "node_allocations", filter: `user_id=eq.${userId}` }, (payload: { new: Allocation }) => {
        setAllocations((prev) => [payload.new, ...prev]);
        showToast("Mining session activated!");
        setActiveTab("portfolio");
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "node_allocations", filter: `user_id=eq.${userId}` }, (payload: { new: Allocation }) => {
        setAllocations((prev) => prev.map((a) => (a.id === payload.new.id ? payload.new : a)));
      })
      // Also listen for balance updates so Re-mine button appears immediately
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users", filter: `id=eq.${userId}` }, (payload: { new: { balance_available?: number } }) => {
        if (payload.new?.balance_available !== undefined) {
          setUserBalance(payload.new.balance_available);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  useEffect(() => {
    if (!userId || !allocations.length || !plans.length) return;
    const iv = setInterval(async () => {
      const now = Date.now();
      for (const alloc of allocations.filter((a) => a.status === "active" && !a.mining_completed)) {
        const plan   = plans.find((p) => p.id === alloc.plan_id);
        const period = alloc.mining_period ?? "daily";
        const base   = alloc.total_earned ?? 0;
        const elapsed = Math.max(0, (now - new Date(alloc.updated_at ?? alloc.created_at).getTime()) / 1000);
        const planObj = plan ?? ({ tier_index: 0, price_min: 5, short_name: "", name: "", gpu_model: "" } as unknown as Plan);
        let newEarned: number;
        if (alloc.payment_model === "flexible") {
          const totalProfit = calcProfit(alloc.amount_invested, planObj, period);
          const pMs = PERIOD_DURATIONS_MS[period] ?? PERIOD_DURATIONS_MS.daily;
          newEarned = Math.min(base + (totalProfit / (pMs / 1000)) * elapsed, totalProfit);
        } else {
          newEarned = base + (calcProfit(alloc.amount_invested, planObj, "daily") / 86400) * elapsed;
        }
        // Use the monotonic RPC — never overwrite with a lower value.
        // This page-level interval recalculates from local `allocations`
        // state, which can go stale between refetches; GREATEST() in the
        // DB function is what actually prevents the regression.
        await supabase.rpc("safe_update_earnings", {
          alloc_id: alloc.id,
          new_earned: Math.round(newEarned * 1_000_000) / 1_000_000,
        });
      }
    }, 60_000);
    return () => clearInterval(iv);
  }, [userId, allocations, plans]);

  async function joinWaitlist(planId: string) {
    if (!userId) return;
    const { error } = await supabase.from("gpu_waitlist").upsert(
      { user_id: userId, plan_id: planId, email: userEmail, status: "pending" },
      { onConflict: "user_id,plan_id" },
    );
    if (!error) { showToast("You're on the waitlist!"); loadAll(); }
    else showToast("Could not join waitlist.", false);
  }

  function mine(planId: string, amount: number, itype: string, paymentModel: "flexible" | "contract", miningPeriod?: string, contractTerm?: (typeof CONTRACT_TERMS)[0]) {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const tierIdx = resolveTier(plan);
    // NOTE: capital-return eligibility (is_first_deposit) and any resulting
    // lock period are determined server-side at payment confirmation, never
    // here — the frontend cannot reliably know whether this is the user's
    // first-ever deposit without querying their full allocation history,
    // and that decision carries real financial weight so it must not be
    // trusted from client input.

    if (paymentModel === "contract") {
      const contractMonths = contractTerm?.months ?? 6;
      const estProfit      = amount * getPlanRoi(plan, "monthly") * contractMonths;
      const ps = new URLSearchParams({
        node: planId, name: plan.name, price: amount.toString(), daily: calcProfit(amount, plan, "daily").toFixed(6),
        itype, gpu: plan.gpu_model, vram: plan.vram,
        paymentModel: "contract", contractMonths: String(contractMonths),
        contractLabel: contractTerm?.label ?? "6 Months", contractEstProfit: estProfit.toFixed(2),
        lockInMonths: String(contractMonths), lockInLabel: contractTerm?.label ?? "6 Months", lockInMultiplier: "1",
        tierIndex: String(tierIdx),
      });
      if (typeof window !== "undefined") sessionStorage.setItem("checkout_redirect", "/dashboard/gpu-plans");
      router.push(`/dashboard/checkout?${ps.toString()}`);
    } else {
      const period    = miningPeriod ?? "daily";
      const estProfit = calcProfit(amount, plan, period);
      const ps = new URLSearchParams({
        node: planId, name: plan.name, price: amount.toString(), itype, gpu: plan.gpu_model, vram: plan.vram,
        paymentModel: "flexible", miningPeriod: period, miningEstProfit: estProfit.toFixed(2),
        lockInMonths: "0", lockInLabel: "Flexible", lockInMultiplier: "1",
        tierIndex: String(tierIdx),
      });
      if (typeof window !== "undefined") sessionStorage.setItem("checkout_redirect", "/dashboard/gpu-plans");
      router.push(`/dashboard/checkout?${ps.toString()}`);
    }
  }

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#06080f" }}>
        <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );

  const eventByPlan   = (id: string) => events.find((e) => e.plan_id === id && e.is_active) ?? null;
  const allocByPlan   = (id: string) => allocations.find((a) => a.plan_id === id) ?? null;
  const isOnWaitlist  = (id: string) => waitlist.some((w) => w.plan_id === id);
  const activeAllocs  = allocations.filter((a) => a.status === "active" || a.status === "matured");
  const kycVerified   = kycStatus === "approved";

  return (
    <div className="flex min-h-screen text-white" style={{ background: "#06080f" }}>
      <DashboardNavigation />
      {showKYC && <KYCGateModal kycStatus={kycStatus} onClose={() => setShowKYC(false)} onGoVerify={goToVerification} />}
      {showRemine && userId && (
        <RemineModal
          userId={userId} plans={plans} userBalance={userBalance} kycStatus={kycStatus}
          sourceAllocId={remineSourceAllocId} defaultPlanId={remineDefaultPlanId}
          onClose={() => setShowRemine(false)}
          onSuccess={(newAllocId, amountUsed) => {
            setShowRemine(false);
            // Update local balance immediately so UI reflects deduction
            setUserBalance((prev) => Math.max(0, prev - amountUsed));
            showToast(`Re-mine started — $${amountUsed.toFixed(2)} staked.`);
            setActiveTab("portfolio");
            loadAll();
            void newAllocId;
          }}
        />
      )}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-2xl flex items-center gap-2 max-w-xs ${toast.ok ? "bg-emerald-500 text-slate-950" : "bg-amber-500 text-slate-950"}`}>
          {toast.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />} {toast.msg}
        </div>
      )}
      {activeNotif && (
        <div className="fixed bottom-24 md:bottom-6 right-4 z-50 max-w-xs w-full rounded-2xl p-4 shadow-2xl" style={{ background: "rgb(10,16,28)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0"><Bell size={13} className="text-emerald-400" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold">{activeNotif.title}</p>
              {activeNotif.body && <p className="text-slate-400 text-xs mt-0.5 line-clamp-2">{activeNotif.body}</p>}
            </div>
            <button onClick={async () => { await supabase.from("user_notifications").update({ read_at: new Date().toISOString() }).eq("id", activeNotif.id); setActiveNotif(null); }} className="text-slate-600 hover:text-white shrink-0"><X size={13} /></button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 pt-5 pb-28 md:pb-12 space-y-8">

          {/* HERO */}
          <div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live Network
              </span>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-800/60 border border-slate-700/40 px-2.5 py-1 rounded-full">24h: ${networkEarnings}</span>
              {kycVerified ? (
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5"><CheckCircle size={9} /> KYC Verified</span>
              ) : (
                <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1.5" style={{ color: kycStatus === "pending" ? "#f59e0b" : "#94a3b8", background: kycStatus === "pending" ? "rgba(245,158,11,0.1)" : "rgba(100,116,139,0.1)", border: kycStatus === "pending" ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(100,116,139,0.2)" }}>
                  <Shield size={9} /> {kycStatus === "pending" ? "KYC Reviewing" : "KYC Needed"}
                </span>
              )}
              {/* Show balance pill if user has >= $0.50 */}
              {userBalance >= REMINE_MIN_BALANCE && (
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <CircleDollarSign size={9} /> ${userBalance.toFixed(2)} wallet
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-tight">
              Put Your Capital<br /><span className="text-emerald-400">To Work 24/7</span>
            </h1>
            <p className="text-slate-400 mt-3 leading-relaxed text-sm">
              Stake capital into enterprise-grade GPU nodes. Your node earns around the clock processing real AI workloads — and you watch every dollar appear in real time.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {MARKET_STATS.map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center gap-2 bg-slate-900/60 border border-slate-800/60 rounded-xl px-3 py-2.5">
                  <Icon size={12} className="text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-white font-black text-sm">{value}</p>
                    <p className="text-slate-600 text-[9px] leading-tight">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TABS */}
          <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-1">
            <button onClick={() => setActiveTab("plans")} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "plans" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
              <Server size={13} /> Mining Nodes
            </button>
            <button onClick={() => setActiveTab("portfolio")} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "portfolio" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
              <BarChart2 size={13} /> My Portfolio
              {activeAllocs.length > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">{activeAllocs.length}</span>
              )}
            </button>
          </div>

          {/* PORTFOLIO TAB */}
          {activeTab === "portfolio" && (
            <section>
              <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-white font-black text-xl">Active Mining Sessions</h2>
                  <p className="text-slate-500 text-sm mt-1">Real-time earnings, progress and withdrawals</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {/* Re-mine in portfolio header: visible at $0.50+ */}
                  {userBalance >= REMINE_MIN_BALANCE && (
                    <button onClick={() => openRemine()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all" style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)", color: "#10b981" }}>
                      <Repeat2 size={11} /> Re-mine ${userBalance.toFixed(2)}
                    </button>
                  )}
                  {allocations.some((a) => !a.mining_completed && a.mining_ends_at && new Date(a.mining_ends_at) <= new Date() && a.payment_model === "flexible") && (
                    <button onClick={autoCompleteExpiredSessions} disabled={autoCompleting} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all" style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", color: "#f59e0b" }}>
                      {autoCompleting ? <><RefreshCw size={11} className="animate-spin" /> Processing…</> : <><Coins size={11} /> Claim All Expired</>}
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-4"><FirstDepositBanner allocations={allocations} /></div>

              {activeAllocs.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {([
                    { label: "Total Staked",   value: `$${activeAllocs.reduce((s, a) => s + a.amount_invested, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, icon: Wallet,          color: "text-white" },
                    { label: "Wallet Balance", value: `$${userBalance.toFixed(2)}`,  icon: CircleDollarSign, color: "text-emerald-400" },
                    { label: "Active Sessions",value: String(activeAllocs.filter((a) => !a.mining_completed && a.payment_model === "flexible").length), icon: Pickaxe, color: "text-emerald-400" },
                    { label: "Completed",      value: String(activeAllocs.filter((a) => a.mining_completed).length),  icon: CheckCircle, color: "text-blue-400" },
                    { label: "Contracts",      value: String(activeAllocs.filter((a) => a.payment_model === "contract").length), icon: Lock, color: "text-violet-400" },
                  ] as { label: string; value: string; icon: React.ComponentType<{ size?: number; className?: string }>; color: string }[]).map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="rounded-xl p-3" style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-center gap-1.5 mb-2"><Icon size={11} className="text-slate-600" /><p className="text-slate-500 text-[10px] uppercase tracking-wide">{label}</p></div>
                      <p className={`font-black text-base leading-none ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeAllocs.length === 0 ? (
                <div className="rounded-2xl p-8 text-center" style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <Pickaxe size={28} className="text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 font-semibold text-sm">No active mining sessions yet</p>
                  <p className="text-slate-600 text-xs mt-1">Select a GPU node to start</p>
                  <button onClick={() => setActiveTab("plans")} className="mt-4 px-4 py-2 rounded-xl font-black text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-2 mx-auto">
                    <Pickaxe size={12} /> Browse Mining Nodes
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeAllocs.map((alloc) => (
                    <PortfolioCard
                      key={alloc.id} alloc={alloc}
                      plan={plans.find((p) => p.id === alloc.plan_id)}
                      userId={userId ?? ""} userBalance={userBalance}
                      onWithdrawSuccess={() => { showToast("Withdrawal queued — track in Financials → Withdrawals."); loadAll(); }}
                      onStartNewMining={() => { setActiveTab("plans"); showToast("Start a new mining session below.", true); }}
                      onRemine={(srcId, planId) => openRemine(srcId, planId)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* PLANS TAB */}
          {activeTab === "plans" && (
            <>
              {/* Wallet balance banner: visible at $0.50+ */}
              <WalletBalanceBanner balance={userBalance} onUseBalance={() => openRemine()} />
              <section>
                <h2 className="text-white font-black text-xl mb-1">Choose Your GPU Node</h2>
                <p className="text-slate-500 text-sm mb-1">Each node is a different GPU tier. Click <strong className="text-slate-300">Select</strong> on any node to set your stake amount and choose a mining period.</p>
                <p className="text-slate-600 text-xs mb-4">Only one node is open at a time — close one before opening another.</p>
                <div className="space-y-3">
                  {plans.map((plan, i) => (
                    <PlanCard
                      key={plan.id} plan={plan} index={i} event={eventByPlan(plan.id)}
                      userAlloc={allocByPlan(plan.id)} waitlisted={isOnWaitlist(plan.id)}
                      kycStatus={kycStatus} onNeedKYC={() => setShowKYC(true)}
                      onWaitlist={() => joinWaitlist(plan.id)}
                      onMine={(amount, itype, model, period, term) => mine(plan.id, amount, itype, model, period, term)}
                    />
                  ))}
                </div>
              </section>
              <div className="rounded-2xl p-4 mt-4" style={{ background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.12)" }}>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { label: "Avg. Payout Time",    value: "Within 2 business days", icon: "⚡" },
                    { label: "Node Uptime SLA",      value: "99.7% guaranteed",       icon: "🟢" },
                    { label: "Capital Protection",   value: "Returned after lock",     icon: "🔒" },
                    { label: "Withdrawals",          value: "Mon–Fri business days",   icon: "💳" },
                  ] as { label: string; value: string; icon: string }[]).map((s) => (
                    <div key={s.label} className="flex items-start gap-2.5">
                      <span className="text-xl shrink-0 mt-0.5">{s.icon}</span>
                      <div><p className="text-white text-xs font-black">{s.value}</p><p className="text-slate-500 text-[10px]">{s.label}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}