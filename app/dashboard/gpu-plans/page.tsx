"use client";
// app/dashboard/gpu-plans/page.tsx — ROI UPDATED VERSION
// ─────────────────────────────────────────────────────────────────────────────
// CHANGES IN THIS VERSION:
// • New ROI rates per plan/period (exact % from spec)
// • EstimatedProfitBanner now shows a SINGLE dollar amount (no low/high range)
// • % never shown to user — only calculated dollar values displayed
// • DB update helper included (run once to sync plan rates)
// • All profit calculations use the exact period ROI %
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getBusinessDayMessage, isBusinessDay } from "@/lib/business-days";
import DashboardNavigation from "@/components/dashboard-navigation";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
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
  Pickaxe,
  Coins,
  PlayCircle,
  RotateCcw,
  Gauge,
  X,
} from "lucide-react";
import { useKycStatus, KYCStatus } from "@/lib/useKycStatus";
import {
  logWithdrawalEvent,
  recordWithdrawalLedger,
} from "@/lib/withdrawal-security";
import {
  MINING_PERIODS,
  PERIOD_DURATIONS_MS,
  BASE_DAILY_MIN,
  BASE_DAILY_MAX,
  TIER_MULTIPLIERS,
  type MiningPeriodInfo,
} from "@/lib/mining-service";

// ─── ROI TABLE ────────────────────────────────────────────────────────────────
// Exact ROI rates per plan tier and period.
// NEVER shown as % to users — only the resulting $ amount is displayed.
// Keyed by tier_index (0–3) which is always present on every plan from DB.
// Also keyed by every possible name/slug variant for maximum compatibility.

type RoiRates = { hourly: number; daily: number; weekly: number; monthly: number };

// Tier 0 = Foundation Node  (min $5)
// Tier 1 = RTX 4090 Node    (min $50)
// Tier 2 = A100 GPU Node    (min $250)
// Tier 3 = H100 PCIe Node   (min $1,000)
const TIER_ROI: RoiRates[] = [
  { hourly: 0.003,  daily: 0.02,  weekly: 0.12, monthly: 0.45  }, // Tier 0 — Foundation
  { hourly: 0.005,  daily: 0.03,  weekly: 0.18, monthly: 0.70  }, // Tier 1 — RTX 4090
  { hourly: 0.008,  daily: 0.05,  weekly: 0.35, monthly: 1.20  }, // Tier 2 — A100
  { hourly: 0.012,  daily: 0.08,  weekly: 0.60, monthly: 2.50  }, // Tier 3 — H100 PCIe
];

// Name → tier_index map — catches any slug/name variant the DB might use
const NAME_TO_TIER: Record<string, number> = {
  // Tier 0 variants
  "foundation":         0, "foundation node":    0, "foundation-node":    0,
  "foundationnode":     0, "t4":                 0, "l4":                 0,
  "entry":              0, "shared":             0,
  // Tier 1 variants
  "rtx":                1, "rtx 4090":           1, "rtx-4090":           1,
  "rtx4090":            1, "rtx 4090 node":      1, "rtx-4090-node":      1,
  "rtx4090node":        1, "4090":               1,
  // Tier 2 variants
  "a100":               2, "a100 gpu":           2, "a100-gpu":           2,
  "a100gpu":            2, "a100 gpu node":      2, "a100-gpu-node":      2,
  "a100gpunode":        2, "a100 node":          2,
  // Tier 3 variants
  "h100":               3, "h100 pcie":          3, "h100-pcie":          3,
  "h100pcie":           3, "h100 pcie node":     3, "h100-pcie-node":     3,
  "h100pcienode":       3, "h100 node":          3, "frontier":           3,
};

/**
 * Resolve the correct tier index for a plan.
 * Priority: tier_index field → name/slug lookup → price_min bracket.
 */
function resolveTier(plan: Plan): number {
  // 1. Use tier_index if it's a valid 0–3 integer
  if (
    typeof plan.tier_index === "number" &&
    plan.tier_index >= 0 &&
    plan.tier_index <= 3
  ) {
    return plan.tier_index;
  }

  // 2. Try name / short_name lookup (normalise to lowercase, strip punctuation)
  const normalise = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  const candidates = [plan.short_name, plan.name, plan.gpu_model].filter(Boolean);
  for (const raw of candidates) {
    const key = normalise(raw);
    if (NAME_TO_TIER[key] !== undefined) return NAME_TO_TIER[key];
    // also try stripping " node" suffix
    const stripped = key.replace(/\s*node\s*$/, "").trim();
    if (NAME_TO_TIER[stripped] !== undefined) return NAME_TO_TIER[stripped];
  }

  // 3. Fall back to price_min bracket
  if (plan.price_min >= 1000) return 3;
  if (plan.price_min >= 250)  return 2;
  if (plan.price_min >= 50)   return 1;
  return 0;
}

/** Get the ROI rate (decimal) for a plan + period. */
function getPlanRoi(plan: Plan, period: string): number {
  const tier = resolveTier(plan);
  const rates = TIER_ROI[tier] ?? TIER_ROI[0];
  return (rates as Record<string, number>)[period] ?? rates.daily;
}

/** Compute profit $ = capital × ROI rate for the given period. */
function calcProfit(capital: number, plan: Plan, period: string): number {
  return capital * getPlanRoi(plan, period);
}

// ─── DB SYNC HELPER ───────────────────────────────────────────────────────────
// Call this once (e.g. from an admin page or on first load for admin users)
// to push the new plan rates into the gpu_plans table.
export async function syncPlanRatesToDB() {
  // Matches by price_min bracket — works no matter what short_name is in the DB.
  // Also writes tier_index so the fast lookup path always works going forward.
  const updates = [
    { price_min_match: 5,    tier_index: 0, price_min: 5,    hourly_pct: 0.003, daily_pct: 0.02, base_daily_profit_min: 2.0,  base_daily_profit_max: 2.0,  roi_tier_multiplier: 1.0 },
    { price_min_match: 50,   tier_index: 1, price_min: 50,   hourly_pct: 0.005, daily_pct: 0.03, base_daily_profit_min: 3.0,  base_daily_profit_max: 3.0,  roi_tier_multiplier: 1.0 },
    { price_min_match: 250,  tier_index: 2, price_min: 250,  hourly_pct: 0.008, daily_pct: 0.05, base_daily_profit_min: 5.0,  base_daily_profit_max: 5.0,  roi_tier_multiplier: 1.0 },
    { price_min_match: 1000, tier_index: 3, price_min: 1000, hourly_pct: 0.012, daily_pct: 0.08, base_daily_profit_min: 8.0,  base_daily_profit_max: 8.0,  roi_tier_multiplier: 1.0 },
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

// ─── CONTRACT TERMS ───────────────────────────────────────────────────────────
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

// ─── COLOUR SCHEME ────────────────────────────────────────────────────────────
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
    text: "The A100 nodes deliver exactly what they promise. Transparent earnings unlike anything I've seen.",
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
// Uses PLAN_ROI table for exact period profit. No range — single deterministic value.
function useLiveMiningEarnings(
  alloc: Allocation,
  plan: Plan | undefined,
): number {
  const isFlexible = alloc.payment_model === "flexible";
  const isComplete = alloc.mining_completed || alloc.status === "matured";
  const finalProfit = alloc.final_profit ?? alloc.total_earned ?? 0;

  const period = alloc.mining_period ?? "daily";
  // plan may be undefined for a brief moment — use a safe fallback Plan shell
  const safePlan = plan ?? { tier_index: 0, price_min: 5, short_name: "", name: "", gpu_model: "" } as unknown as Plan;

  // Total profit for this session = capital × exact ROI rate for this period
  const totalPeriodProfit = calcProfit(alloc.amount_invested, safePlan, period);
  const periodMs = PERIOD_DURATIONS_MS[period] ?? PERIOD_DURATIONS_MS.daily;

  // Per-second tick rate
  const flexPerSec = totalPeriodProfit / (periodMs / 1000);
  // Contract uses daily rate ticking every second
  const contractDailyProfit = alloc.amount_invested * getPlanRoi(safePlan, "daily");
  const contractPerSec = contractDailyProfit / 86400;
  const perSec = isFlexible ? flexPerSec : contractPerSec;

  // Seed from last DB sync
  const base = alloc.total_earned ?? 0;
  const lastUpdate = alloc.updated_at || alloc.created_at;
  const elapsedSec = Math.max(
    0,
    (Date.now() - new Date(lastUpdate).getTime()) / 1000,
  );
  const seedValue = isComplete
    ? finalProfit
    : isFlexible
      ? Math.min(base + perSec * elapsedSec, totalPeriodProfit)
      : base + perSec * elapsedSec;

  const [live, setLive] = useState(seedValue);
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    if (isComplete) {
      setLive(finalProfit);
      return;
    }
    const newBase = alloc.total_earned ?? 0;
    const newElapsed = Math.max(
      0,
      (Date.now() - new Date(alloc.updated_at || alloc.created_at).getTime()) /
        1000,
    );
    const reseeded = isFlexible
      ? Math.min(newBase + perSec * newElapsed, totalPeriodProfit)
      : newBase + perSec * newElapsed;
    setLive(reseeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alloc.total_earned, alloc.updated_at, isComplete]);

  useEffect(() => {
    if (isComplete) return;
    const iv = setInterval(() => {
      setLive((p) =>
        isFlexible ? Math.min(p + perSec, totalPeriodProfit) : p + perSec,
      );
    }, 1000);
    return () => clearInterval(iv);
  }, [perSec, isComplete, isFlexible, totalPeriodProfit]);

  useEffect(() => {
    if (isComplete) return;
    const syncIv = setInterval(async () => {
      const current = liveRef.current;
      if (current > (alloc.total_earned ?? 0)) {
        try {
          await supabase
            .from("node_allocations")
            .update({
              total_earned: Math.round(current * 1_000_000) / 1_000_000,
              updated_at: new Date().toISOString(),
            })
            .eq("id", alloc.id)
            .eq("mining_completed", false);
        } catch (err) {
          console.error("[mining] sync error:", err);
        }
      }
    }, 60_000);
    return () => clearInterval(syncIv);
  }, [alloc.id, alloc.total_earned, isComplete]);

  return isComplete ? finalProfit : live;
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
      <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
      <p className="text-amber-400/80 text-[11px] leading-relaxed">
        <strong className="text-amber-300">Risk Disclosure:</strong> Mining
        rewards are variable and not guaranteed. Past performance is not
        indicative of future results.
      </p>
    </div>
  );
}

// ─── ESTIMATED PROFIT BANNER ─────────────────────────────────────────────────
// Single dollar amount — no low/high range, no % shown to user.
// Reacts instantly to capital + period/term changes.
function EstimatedProfitBanner({
  profit,
  periodLabel,
  isContract,
}: {
  profit: number;
  periodLabel: string;
  isContract: boolean;
}) {
  const accentColor = isContract ? "#8b5cf6" : "#10b981";
  const accentBg = isContract
    ? "rgba(139,92,246,0.07)"
    : "rgba(16,185,129,0.07)";
  const accentBorder = isContract
    ? "rgba(139,92,246,0.28)"
    : "rgba(16,185,129,0.28)";
  const accentText = isContract ? "text-violet-300" : "text-emerald-300";
  const accentVal = isContract ? "text-violet-400" : "text-emerald-400";
  const accentBadgeBg = isContract
    ? "rgba(139,92,246,0.12)"
    : "rgba(16,185,129,0.12)";
  const accentBadgeBorder = isContract
    ? "rgba(139,92,246,0.3)"
    : "rgba(16,185,129,0.3)";

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: accentBg, border: `1px solid ${accentBorder}` }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p
          className={`text-xs font-black uppercase tracking-wide flex items-center gap-1.5 ${accentText}`}
        >
          <TrendingUp size={11} style={{ color: accentColor }} />
          Estimated Profit — {periodLabel}
        </p>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{
            background: accentBadgeBg,
            border: `1px solid ${accentBadgeBorder}`,
            color: accentColor,
          }}
        >
          Live Estimate
        </span>
      </div>

      {/* Single profit amount */}
      <div
        className="rounded-xl py-4 px-4 text-center"
        style={{
          background: "rgba(0,0,0,0.3)",
          border: `1px solid ${accentBorder}`,
        }}
      >
        <p className="text-slate-500 text-[9px] uppercase tracking-widest mb-1.5">
          Estimated Earnings
        </p>
        <p className={`font-black text-3xl tabular-nums ${accentVal}`}>
          $
          {profit.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </p>
        <p className="text-slate-600 text-[10px] mt-1">
          for {periodLabel}
        </p>
      </div>

      {/* Disclaimer note */}
      <div
        className="flex items-start gap-2 rounded-lg px-3 py-2.5"
        style={{
          background: "rgba(245,158,11,0.05)",
          border: "1px solid rgba(245,158,11,0.15)",
        }}
      >
        <AlertTriangle size={11} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-400/80 text-[11px] leading-relaxed">
          This is an{" "}
          <strong className="text-amber-300">estimated projection</strong> based
          on current GPU demand and live network conditions. Your actual return
          may be higher or lower. This figure is a guide only, not a guarantee.
        </p>
      </div>
    </div>
  );
}

// ─── MINING PROGRESS BADGE ────────────────────────────────────────────────────
function MiningProgressBadge({ alloc }: { alloc: Allocation }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!alloc.mining_ends_at) return;
    const end = new Date(alloc.mining_ends_at).getTime();
    const start = new Date(alloc.created_at).getTime();
    const total = end - start;
    function tick() {
      const rem = end - Date.now();
      if (rem <= 0) {
        setTimeLeft("Complete");
        setPct(100);
        return;
      }
      setPct(Math.min(100, ((total - rem) / total) * 100));
      const h = Math.floor(rem / 3_600_000);
      const m = Math.floor((rem % 3_600_000) / 60_000);
      const s = Math.floor((rem % 60_000) / 1_000);
      if (h > 24) setTimeLeft(`${Math.floor(h / 24)}d ${h % 24}h left`);
      else if (h > 0) setTimeLeft(`${h}h ${m}m left`);
      else setTimeLeft(`${m}m ${s}s left`);
    }
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [alloc.mining_ends_at, alloc.created_at]);

  if (!alloc.mining_ends_at) return null;
  const done = !!alloc.mining_completed;

  return (
    <div
      className="rounded-xl p-3 space-y-2"
      style={{
        background: done ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.05)",
        border: done
          ? "1px solid rgba(16,185,129,0.3)"
          : "1px solid rgba(16,185,129,0.15)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {done ? (
            <CheckCircle size={11} className="text-emerald-400" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
          )}
          <span className="text-emerald-300 text-xs font-bold">
            {done ? "Mining Complete" : "Mining Active"}
          </span>
        </div>
        <span className="text-slate-400 text-[10px]">{timeLeft}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-1.5 rounded-full transition-all duration-1000"
          style={{
            width: `${pct}%`,
            background: done
              ? "linear-gradient(90deg,#10b981,#34d399)"
              : "linear-gradient(90deg,#10b981,rgba(16,185,129,0.5))",
          }}
        />
      </div>
    </div>
  );
}

// ─── WITHDRAW MODAL ───────────────────────────────────────────────────────────
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

  const available = Math.max(0, liveEarned - (alloc.total_withdrawn ?? 0));
  const isContract = alloc.payment_model === "contract";
  const maturityDate = alloc.maturity_date
    ? new Date(alloc.maturity_date)
    : null;
  const contractMature = maturityDate
    ? Date.now() >= maturityDate.getTime()
    : false;
  const miningComplete = alloc.mining_completed || alloc.status === "matured";
  const canWithdraw = isContract ? contractMature : miningComplete;
  const daysLeft = maturityDate
    ? Math.max(0, Math.ceil((maturityDate.getTime() - Date.now()) / 86400000))
    : 0;
  const minW = 10;
  const amt = parseFloat(amount) || 0;
  const expectedDays = amt < 500 ? 1 : amt < 5000 ? 2 : amt < 50000 ? 5 : 7;
  const expectedDate = new Date(Date.now() + expectedDays * 86400000);
  const bizMsg = getBusinessDayMessage();
  const isBizDay = isBusinessDay();

  useEffect(() => {
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

  const kycOk = !!(
    payoutInfo?.kyc_verified || payoutInfo?.kyc_status === "approved"
  );
  const hasPayout = !!(
    payoutInfo?.payout_registered && payoutInfo?.payout_account_number
  );

  async function handleWithdraw() {
    setError("");
    if (!isBizDay) {
      const d = new Date().getDay();
      setError(
        `Withdrawals are only on business days (Mon–Fri). Today is ${d === 0 ? "Sunday" : "Saturday"}.`,
      );
      return;
    }
    if (!pin || pin.length < 4) {
      setError("Enter your PIN (4–6 digits)");
      return;
    }

    const encoder = new TextEncoder();
    const hashBuf = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(pin + userId),
    );
    const pinHash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { data: ud } = await supabase
      .from("users")
      .select("pin_hash")
      .eq("id", userId)
      .single();
    if (!ud?.pin_hash || pinHash !== ud.pin_hash) {
      setError("Invalid PIN.");
      return;
    }

    if (!kycOk) {
      setError("KYC verification required before withdrawing.");
      return;
    }
    if (!hasPayout) {
      setError(
        "No payout account registered. Go to Verification → Payout Setup.",
      );
      return;
    }
    if (amt < minW) {
      setError(`Minimum withdrawal is $${minW}`);
      return;
    }
    if (amt > available) {
      setError(`Amount exceeds available balance ($${available.toFixed(2)}).`);
      return;
    }

    setLoading(true);
    try {
      const { data: freshBal } = await supabase
        .from("users")
        .select("balance_available")
        .eq("id", userId)
        .single();
      const serverBal = (freshBal as any)?.balance_available ?? 0;
      if (amt > serverBal) {
        setError(
          `Amount exceeds confirmed server balance ($${serverBal.toFixed(2)}).`,
        );
        setLoading(false);
        return;
      }

      if (isContract && !contractMature) {
        throw new Error(
          `Contract locked until ${maturityDate?.toLocaleDateString()}. ${daysLeft} days remaining.`,
        );
      }

      const now = new Date().toISOString();
      const acct = payoutInfo!.payout_account_number!;
      const gw = payoutInfo!.payout_gateway || "manual";
      const aname = payoutInfo!.payout_account_name || "";
      const bank = payoutInfo!.payout_bank_name || null;

      const payload: Record<string, any> = {
        user_id: userId,
        amount: amt,
        status: "queued",
        created_at: now,
        payout_method: gw,
        payout_account_name: aname,
        payout_bank_name: bank,
        tracking_status: "queued",
        node_allocation_id: alloc.id,
        expected_date: expectedDate.toISOString(),
        wallet_address: acct,
      };

      let insErr: any = null;
      const r1 = await supabase.from("withdrawals").insert(payload);
      insErr = r1.error;
      if (insErr?.message?.includes("wallet_address")) {
        const { wallet_address, ...noWallet } = payload;
        insErr = (await supabase.from("withdrawals").insert(noWallet)).error;
      }
      if (insErr)
        throw new Error(insErr.message || "Withdrawal insert failed.");

      const { error: deductErr } = await supabase
        .from("users")
        .update({
          balance_available: Math.max(0, serverBal - amt),
          last_withdrawal_at: now,
        })
        .eq("id", userId)
        .gte("balance_available", amt);

      if (deductErr) {
        setError("Balance update failed. Please try again.");
        setLoading(false);
        return;
      }

      await supabase
        .from("node_allocations")
        .update({
          total_withdrawn: (alloc.total_withdrawn ?? 0) + amt,
          updated_at: now,
        })
        .eq("id", alloc.id);

      const { data: fw } = await supabase
        .from("users")
        .select("wallet_balance,total_withdrawn")
        .eq("id", userId)
        .single();
      if (fw) {
        await supabase
          .from("users")
          .update({
            wallet_balance: Math.max(
              0,
              ((fw as any).wallet_balance ?? 0) - amt,
            ),
            total_withdrawn: ((fw as any).total_withdrawn ?? 0) + amt,
          })
          .eq("id", userId);
      }

      try {
        await recordWithdrawalLedger(supabase, userId, amt, acct, gw);
      } catch {}
      try {
        await logWithdrawalEvent(supabase, userId, "withdrawal_requested", {
          amount: amt,
          payout_method: gw,
          payout_account: acct.slice(0, 12) + "...",
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
              <p className="text-white font-black text-sm">Withdraw Earnings</p>
              <p className="text-slate-500 text-[10px]">
                {isContract ? "Contract" : "Pay-As-You-Go Mining"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-white ml-2"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!isContract && !miningComplete ? (
            <div
              className="rounded-2xl p-5 text-center"
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.25)",
              }}
            >
              <Pickaxe size={24} className="text-amber-400 mx-auto mb-2" />
              <p className="text-amber-300 font-black text-sm">
                Mining Still Active
              </p>
              <p className="text-amber-400/70 text-xs mt-2">
                Withdraw unlocks when your mining period completes.
              </p>
              {alloc.mining_ends_at && (
                <p className="text-amber-300 text-xs mt-2 font-bold">
                  Completes: {new Date(alloc.mining_ends_at).toLocaleString()}
                </p>
              )}
            </div>
          ) : isContract && !contractMature ? (
            <div
              className="rounded-2xl p-5 text-center"
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.25)",
              }}
            >
              <Lock size={24} className="text-amber-400 mx-auto mb-2" />
              <p className="text-amber-300 font-black text-sm">
                Capital Locked Until Maturity
              </p>
              <p className="text-amber-400/70 text-xs mt-2">
                Contract matures on {maturityDate?.toLocaleDateString()}.
              </p>
              <p className="text-amber-300 text-xs mt-1 font-bold">
                {daysLeft} days remaining
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
                  <RefreshCw size={13} className="text-blue-400 animate-spin" />
                  <p className="text-slate-400 text-sm">
                    Loading payout account…
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
                    <Shield size={9} className="text-blue-400" /> Registered
                    Payout Account
                  </p>
                  {hasPayout ? (
                    <div className="space-y-0.5">
                      <p className="text-white font-bold text-sm">
                        {payoutInfo!.payout_account_name ?? "—"}
                      </p>
                      {payoutInfo!.payout_bank_name && (
                        <p className="text-slate-400 text-xs">
                          {payoutInfo!.payout_bank_name}
                        </p>
                      )}
                      <p className="text-slate-500 text-xs font-mono">
                        {payoutInfo!.payout_account_number}
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
                    <AlertTriangle size={13} /> KYC verification required
                  </p>
                  <p className="text-red-400/70 text-xs mt-1">
                    Complete identity verification in the Verification section.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div
                  className="rounded-xl p-3"
                  style={{
                    background: "rgba(16,185,129,0.08)",
                    border: "1px solid rgba(16,185,129,0.2)",
                  }}
                >
                  <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">
                    Total Earned
                  </p>
                  <p className="text-emerald-400 font-black text-lg tabular-nums">
                    ${liveEarned.toFixed(4)}
                  </p>
                </div>
                <div
                  className="rounded-xl p-3"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">
                    Available Now
                  </p>
                  <p className="text-white font-black text-lg">
                    ${available.toFixed(4)}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-slate-300 text-sm font-bold block mb-2">
                  Amount to Withdraw (min ${minW})
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">
                    $
                  </span>
                  <input
                    type="number"
                    min={minW}
                    max={available}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-9 pr-4 py-3 rounded-xl text-lg font-black text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {[25, 50, 75, 100].map((p) => (
                    <button
                      key={p}
                      onClick={() =>
                        setAmount(((available * p) / 100).toFixed(2))
                      }
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
                  className={`text-sm font-bold flex items-center gap-2 ${isBizDay ? "text-emerald-400" : "text-red-400"}`}
                >
                  <Clock size={13} />
                  {bizMsg}
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
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter your 4–6 digit PIN"
                  className="w-full px-4 py-3 rounded-xl text-lg font-bold text-center tracking-widest text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {error && (
                <div
                  className="rounded-xl p-3 flex items-start gap-2"
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.25)",
                  }}
                >
                  <AlertTriangle
                    size={13}
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
                  !hasPayout ||
                  !kycOk ||
                  loadingPayout ||
                  pin.length < 4 ||
                  !isBizDay
                }
                className="w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg,#10b981,#059669)",
                }}
              >
                {loading ? (
                  <>
                    <RefreshCw size={15} className="animate-spin" /> Processing…
                  </>
                ) : !isBizDay ? (
                  <>
                    <Clock size={15} /> Business days only
                  </>
                ) : pin.length < 4 ? (
                  <>
                    <Lock size={15} /> Enter PIN to continue
                  </>
                ) : (
                  <>
                    <Send size={15} /> Withdraw ${amount || "0.00"}
                  </>
                )}
              </button>
              <p className="text-slate-600 text-[11px] text-center pb-1">
                Funds sent to your registered payout account.
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

  const cs = plan ? (CS[plan.tier_color] ?? CS.slate) : CS.slate;
  const isContract = alloc.payment_model === "contract";
  const now = new Date();
  const startDate = new Date(alloc.created_at);
  const maturityDate = alloc.maturity_date
    ? new Date(alloc.maturity_date)
    : null;
  const isMatured = maturityDate ? now >= maturityDate : false;
  const miningDone = alloc.mining_completed || alloc.status === "matured";
  const miningEndsAt = alloc.mining_ends_at
    ? new Date(alloc.mining_ends_at)
    : null;
  const withdrawn = alloc.total_withdrawn ?? 0;
  const available = Math.max(0, liveEarned - withdrawn);
  const canWithdraw = isContract ? isMatured : miningDone;

  const isExpiredUnclaimed =
    !miningDone &&
    !isContract &&
    miningEndsAt !== null &&
    miningEndsAt <= new Date();
  const [claiming, setClaiming] = useState(false);
  const [claimDone, setClaimDone] = useState(false);

  async function claimEarnings() {
    if (claiming || claimDone) return;
    setClaiming(true);
    try {
      const res = await fetch("/api/mining/claim-session", { method: "POST" });
      if (res.ok) {
        setClaimDone(true);
        onWithdrawSuccess();
      }
    } catch {}
    setClaiming(false);
  }

  const daysElapsed = Math.floor(
    (now.getTime() - startDate.getTime()) / 86400000,
  );
  const totalDays = maturityDate
    ? Math.ceil((maturityDate.getTime() - startDate.getTime()) / 86400000)
    : 0;
  const progressPct =
    totalDays > 0 ? Math.min(100, (daysElapsed / totalDays) * 100) : 0;
  const daysLeft = maturityDate
    ? Math.max(
        0,
        Math.ceil((maturityDate.getTime() - now.getTime()) / 86400000),
      )
    : 0;

  // Per-second rate for display (using exact ROI)
  const period = alloc.mining_period ?? "daily";
  const safePlan2 = plan ?? { tier_index: 0, price_min: 5, short_name: "", name: "", gpu_model: "" } as unknown as Plan;
  const totalProfit = calcProfit(alloc.amount_invested, safePlan2, period);
  const pMs = PERIOD_DURATIONS_MS[period] ?? PERIOD_DURATIONS_MS.daily;
  const perSec = miningDone ? 0 : totalProfit / (pMs / 1000);
  const perHour = perSec * 3600;

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
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: cs.bg, borderBottom: `1px solid ${cs.border}` }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "rgba(0,0,0,0.3)",
                border: `1px solid ${cs.border}`,
              }}
            >
              {isContract ? (
                <Cpu size={14} className={cs.accent} />
              ) : (
                <Pickaxe size={14} className={cs.accent} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-white font-black text-sm truncate">
                {plan?.name ?? alloc.plan_id}
              </p>
              <p className="text-slate-500 text-[10px]">
                {plan?.gpu_model ?? ""} · {startDate.toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5 items-center shrink-0 ml-2 flex-wrap justify-end">
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${isContract ? "bg-violet-900/20 border-violet-800/40 text-violet-400" : "bg-emerald-900/20 border-emerald-800/40 text-emerald-400"}`}
            >
              {isContract ? "📋 Contract" : "⛏️ Pay-As-You-Go"}
            </span>
            {(miningDone || isMatured || claimDone) && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-emerald-900/30 border-emerald-700/50 text-emerald-400">
                Done ✓
              </span>
            )}
            {isExpiredUnclaimed && !claimDone && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-amber-900/30 border-amber-700/50 text-amber-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />{" "}
                CLAIM READY
              </span>
            )}
            {!miningDone && !isExpiredUnclaimed && !isContract && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-emerald-900/20 border-emerald-800/40 text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{" "}
                LIVE
              </span>
            )}
          </div>
        </div>

        <div
          className="px-4 py-4"
          style={{
            background:
              "linear-gradient(135deg,rgba(16,185,129,0.06),rgba(0,0,0,0))",
            borderBottom: `1px solid ${cs.border}`,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                {miningDone || claimDone
                  ? "Total Earned (Final)"
                  : isExpiredUnclaimed
                    ? "Mining Complete — Pending Claim"
                    : "Earning Right Now (Live)"}
              </p>
              <p className="text-emerald-400 font-black text-2xl tabular-nums">
                ${liveEarned.toFixed(6)}
              </p>
              {!miningDone &&
                !claimDone &&
                !isContract &&
                !isExpiredUnclaimed && (
                  <p className="text-emerald-500/60 text-[10px] mt-1">
                    +${perSec.toFixed(8)}/sec · +${perHour.toFixed(6)}/hr
                  </p>
                )}
              {isExpiredUnclaimed && !claimDone && (
                <p className="text-amber-400/80 text-[10px] mt-1">
                  Session ended · Tap Claim to credit your wallet
                </p>
              )}
              {(miningDone || claimDone) && (
                <p className="text-emerald-400/60 text-[10px] mt-1">
                  Session complete · Capital returned to wallet
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                Available
              </p>
              <p className="text-white font-black text-xl">
                ${available.toFixed(4)}
              </p>
              {withdrawn > 0 && (
                <p className="text-slate-600 text-[10px]">
                  after ${withdrawn.toFixed(2)} out
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {!isContract && <MiningProgressBadge alloc={alloc} />}

          <div className="grid grid-cols-2 gap-2">
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
                value: `$${withdrawn.toFixed(2)}`,
                icon: ArrowUpRight,
                color: "text-blue-400",
              },
              {
                label: isContract
                  ? "Locked Until"
                  : miningDone
                    ? "Status"
                    : "Mining Until",
                value:
                  isContract && maturityDate
                    ? maturityDate.toLocaleDateString()
                    : miningDone
                      ? "Complete ✓"
                      : miningEndsAt
                        ? miningEndsAt.toLocaleDateString()
                        : "—",
                icon: isContract ? Lock : miningDone ? CheckCircle : Pickaxe,
                color: miningDone ? "text-emerald-400" : "text-amber-400",
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
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon size={10} className="text-slate-600" />
                  <p className="text-slate-500 text-[10px]">{label}</p>
                </div>
                <p className={`font-black text-sm ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {!isContract && !miningDone && (
            <div
              className="flex items-center justify-between rounded-xl px-3 py-2.5"
              style={{
                background: "rgba(16,185,129,0.06)",
                border: "1px solid rgba(16,185,129,0.15)",
              }}
            >
              <div className="flex items-center gap-2">
                <Pickaxe size={12} className="text-emerald-400" />
                <span className="text-slate-400 text-xs">Session Type</span>
              </div>
              <span className="text-emerald-400 font-black text-sm capitalize">
                {alloc.mining_period ?? "Daily"}
              </span>
            </div>
          )}

          {isContract && maturityDate && (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5">
                  <Timer size={11} className="text-slate-500" />
                  <span className="text-slate-400 text-xs font-semibold">
                    Contract Progress
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {isMatured ? (
                    <span className="text-emerald-400 font-bold">Matured</span>
                  ) : (
                    `${daysLeft}d remaining`
                  )}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800/80 overflow-hidden">
                <div
                  className="h-1.5 rounded-full transition-all duration-700"
                  style={{
                    width: `${progressPct}%`,
                    background: isMatured
                      ? "linear-gradient(90deg,#10b981,#34d399)"
                      : `linear-gradient(90deg,${cs.border},rgba(16,185,129,0.5))`,
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-600">
                <span>{startDate.toLocaleDateString()}</span>
                <span>{progressPct.toFixed(1)}%</span>
                <span>{maturityDate.toLocaleDateString()}</span>
              </div>
            </div>
          )}

          {isContract && !isMatured && (
            <div className="rounded-xl px-3 py-2.5 flex items-start gap-2 bg-amber-900/10 border border-amber-800/20">
              <Lock size={11} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-amber-400 text-xs">
                Capital locked until {maturityDate?.toLocaleDateString()}.
                Earnings accruing live.
              </p>
            </div>
          )}
          {isContract && isMatured && (
            <div className="rounded-xl px-3 py-2.5 flex items-start gap-2 bg-emerald-900/15 border border-emerald-800/30">
              <CheckCircle
                size={11}
                className="text-emerald-400 mt-0.5 shrink-0"
              />
              <p className="text-emerald-300 text-xs">
                Contract matured. Withdraw capital + all earnings.
              </p>
            </div>
          )}
          {!isContract && miningDone && (
            <div className="rounded-xl px-3 py-2.5 flex items-start gap-2 bg-emerald-900/15 border border-emerald-800/30">
              <CheckCircle
                size={11}
                className="text-emerald-400 mt-0.5 shrink-0"
              />
              <p className="text-emerald-300 text-xs">
                Mining complete. Capital + earnings credited to wallet.
              </p>
            </div>
          )}
          {!isContract && !miningDone && (
            <div className="rounded-xl px-3 py-2.5 flex items-start gap-2 bg-emerald-900/15 border border-emerald-800/30">
              <Pickaxe size={11} className="text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-emerald-300 text-xs">
                Mining active. Capital + profits returned when session ends.
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {isExpiredUnclaimed && !claimDone ? (
              <button
                onClick={claimEarnings}
                disabled={claiming}
                className="flex-1 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg,#f59e0b,#d97706)",
                  color: "#020b04",
                }}
              >
                {claiming ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Claiming…
                  </>
                ) : (
                  <>
                    <Coins size={14} /> Claim Earnings + Capital
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => setShowWithdraw(true)}
                disabled={(!canWithdraw && !claimDone) || available < 10}
                className="flex-1 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background:
                    (canWithdraw || claimDone) && available >= 10
                      ? "linear-gradient(135deg,#10b981,#059669)"
                      : "rgba(100,116,139,0.2)",
                  color: "white",
                }}
              >
                <ArrowUpRight size={14} />
                {!isContract && !miningDone && !claimDone
                  ? "Mining in Progress…"
                  : isContract && !isMatured
                    ? `Locked · ${daysLeft}d left`
                    : available < 10
                      ? "Min $10 to withdraw"
                      : `Withdraw $${available.toFixed(2)}`}
              </button>
            )}
            {!isContract && (miningDone || claimDone) && (
              <button
                onClick={onStartNewMining}
                className="px-3 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 transition-all"
                style={{
                  background:
                    "linear-gradient(135deg,rgba(16,185,129,0.3),rgba(16,185,129,0.1))",
                  border: "1px solid rgba(16,185,129,0.4)",
                  color: "#10b981",
                }}
              >
                <RotateCcw size={13} /> New
              </button>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="px-3 py-3 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-sm font-bold transition-all flex items-center gap-1"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
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
                Full Details
              </p>
              {(
                [
                  ["Plan", plan?.name ?? alloc.plan_id],
                  ["GPU", plan?.gpu_model ?? alloc.instance_type ?? "—"],
                  ["VRAM", plan?.vram ?? "—"],
                  ["Capital Staked", `$${alloc.amount_invested.toFixed(2)}`],
                  [
                    "Payment Model",
                    isContract
                      ? `Contract — ${alloc.contract_label}`
                      : `Pay-As-You-Go — ${alloc.mining_period ?? "daily"}`,
                  ],
                  ...(!isContract
                    ? [
                        ["Mining Period", alloc.mining_period ?? "daily"],
                        ["Started", startDate.toLocaleString()],
                        ...(miningEndsAt
                          ? [["Ends", miningEndsAt.toLocaleString()]]
                          : []),
                        ["Status", miningDone ? "Complete ✓" : "Active ⛏️"],
                      ]
                    : []),
                  ...(isContract && maturityDate
                    ? [
                        ["Maturity Date", maturityDate.toLocaleString()],
                        [
                          "Days Remaining",
                          isMatured ? "Matured ✅" : `${daysLeft} days`,
                        ],
                      ]
                    : []),
                  ["Total Earned (Live)", `$${liveEarned.toFixed(6)}`],
                  ["Total Withdrawn", `$${withdrawn.toFixed(2)}`],
                  ["Available to Withdraw", `$${available.toFixed(6)}`],
                  ...(miningDone
                    ? [
                        [
                          "Final Profit",
                          `$${(alloc.final_profit ?? liveEarned).toFixed(6)}`,
                        ],
                      ]
                    : []),
                ] as [string, string][]
              ).map(([l, v]) => (
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
  const dim = isPending
    ? "rgba(245,158,11,0.08)"
    : isRejected
      ? "rgba(239,68,68,0.08)"
      : "rgba(16,185,129,0.08)";
  const brd = isPending
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
        style={{ background: "rgb(10,15,26)", border: `1px solid ${brd}` }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg,transparent,${accent},transparent)`,
          }}
        />
        <div
          className="px-6 pt-6 pb-5"
          style={{ background: dim, borderBottom: `1px solid ${brd}` }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center"
          >
            <X size={14} className="text-slate-400" />
          </button>
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: dim, border: `1px solid ${brd}` }}
            >
              {isPending ? (
                <Clock size={22} style={{ color: accent }} />
              ) : isRejected ? (
                <AlertTriangle size={22} style={{ color: accent }} />
              ) : (
                <UserCheck size={22} style={{ color: accent }} />
              )}
            </div>
            <div>
              <p
                className="text-[10px] font-black uppercase tracking-widest mb-1"
                style={{ color: accent }}
              >
                {isPending
                  ? "Verification In Progress"
                  : isRejected
                    ? "Verification Rejected"
                    : "Identity Verification Required"}
              </p>
              <h3 className="text-white font-black text-lg leading-tight">
                {isPending
                  ? "KYC Under Review"
                  : isRejected
                    ? "Resubmit Your Documents"
                    : "Verify to Withdraw"}
              </h3>
              <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                {isPending
                  ? "Our team is reviewing your documents (24–48 hrs). Withdrawals unlock automatically once approved."
                  : isRejected
                    ? "Your previous submission was rejected. Resubmit with clear, valid government-issued documents."
                    : "Withdrawals require identity verification. Takes less than 5 minutes."}
              </p>
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 pt-5 space-y-2">
          {!isPending && (
            <button
              onClick={onGoVerify}
              className="w-full py-3.5 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
              style={{
                background: `linear-gradient(135deg,${accent},${accent}cc)`,
              }}
            >
              <FileCheck size={16} />
              {isRejected
                ? "Resubmit Verification Documents"
                : "Start Identity Verification"}
              <ArrowRight size={14} />
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-2 text-slate-600 text-xs hover:text-slate-400 transition-colors"
          >
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
    model: "flexible" | "contract",
    period?: string,
    term?: (typeof CONTRACT_TERMS)[0],
  ) => void;
  waitlisted: boolean;
  kycStatus: KYCStatus;
  onNeedKYC: () => void;
}) {
  const cs = CS[plan.tier_color] ?? CS.slate;
  const cap = useCapacity(index);
  const [amountStr, setAmountStr] = useState(String(plan.price_min));
  const amount = parseFloat(amountStr) || 0;
  const [section, setSection] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const showFlex =
    plan.payment_model === "flexible" || plan.payment_model === "both";
  const showContract =
    plan.payment_model === "contract" || plan.payment_model === "both";
  const [tab, setTab] = useState<"flexible" | "contract">(
    showFlex ? "flexible" : "contract",
  );
  const [minPeriod, setMinPeriod] = useState<MiningPeriodInfo>(
    MINING_PERIODS[1],
  );
  const [term, setTerm] = useState(CONTRACT_TERMS[0]);

  const isSurge = event?.event_type === "surge" && event.is_active;
  const locked = plan.is_admin_locked;
  const waitOnly = plan.is_waitlist || plan.is_invite_only;

  const amountErr =
    !amount || amount < plan.price_min
      ? `Minimum stake is $${plan.price_min.toLocaleString()}`
      : amount > plan.price_max
        ? `Maximum is $${plan.price_max.toLocaleString()}`
        : null;

  // Issue #12: Only show quick-select values within plan's valid range
  const quickVals = [5, 50, 100, 250, 500, 1000, 5000].filter(
    (v) => v >= plan.price_min && v <= plan.price_max,
  ).slice(0, 4);

  // ── Estimated profit — single amount, no range, no % shown ────────────────
  // Flexible: capital × exact ROI for selected period
  const flexEstProfit = !amountErr && amount > 0
    ? calcProfit(amount, plan, minPeriod.key)
    : 0;

  // Contract: use monthly ROI as the base, scale by contract months
  // 6m = 6 × monthly rate, 12m = 12 × monthly rate, 24m = 24 × monthly rate
  const monthlyRate = getPlanRoi(plan, "monthly");
  const contractMonths = term.months;
  const contractEstProfit = !amountErr && amount > 0
    ? amount * monthlyRate * contractMonths
    : 0;
  // ────────────────────────────────────────────────────────────────────────────

  const INFO_SECTIONS: Array<{ id: string; lbl: string; Icon: IconComponent }> =
    [
      { id: "specs", lbl: "GPU Specs", Icon: Server },
      { id: "usecases", lbl: "Use Cases", Icon: Layers },
      { id: "risk", lbl: "Risk", Icon: AlertTriangle },
      { id: "legal", lbl: "Legal", Icon: BookOpen },
    ];
  const SPEC_ROWS: Array<{ lbl: string; val: string; Icon: IconComponent }> = [
    { lbl: "Model", val: plan.gpu_model, Icon: Cpu },
    { lbl: "VRAM", val: plan.vram, Icon: HardDrive },
    { lbl: "TDP", val: plan.tdp, Icon: Thermometer },
    { lbl: "Architecture", val: plan.architecture, Icon: Layers },
    { lbl: "TFLOPS", val: `${plan.tflops} TF`, Icon: Gauge },
    { lbl: "Node Type", val: plan.instance_type, Icon: Server },
  ];

  function handleMine() {
    if (amountErr) return;
    if (tab === "flexible" || !showContract)
      onMine(amount, plan.instance_type, "flexible", minPeriod.key);
    else onMine(amount, plan.instance_type, "contract", undefined, term);
  }

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        background: cs.bg,
        border: `1px solid ${cs.border}`,
        boxShadow: `0 0 30px ${cs.glow}`,
      }}
    >
      {isSurge && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold"
          style={{
            background: "rgba(16,185,129,0.12)",
            borderBottom: "1px solid rgba(16,185,129,0.2)",
          }}
        >
          <Zap size={11} className="text-emerald-400 animate-pulse" />
          <span className="text-emerald-300">
            ⚡ {event!.title} — Output boosted {event!.multiplier}×
          </span>
        </div>
      )}

      <div className="flex items-start gap-3 p-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: cs.bg, border: `1px solid ${cs.border}` }}
        >
          <Cpu size={16} className={cs.accent} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <h3 className="text-white font-black text-sm">{plan.name}</h3>
            {locked && (
              <Pill className="border-rose-700/50 text-rose-400 bg-rose-900/20">
                Institutional
              </Pill>
            )}
            {waitOnly && !locked && (
              <Pill className="border-amber-700/50 text-amber-400 bg-amber-900/20">
                Waitlist
              </Pill>
            )}
            {userAlloc && (
              <Pill className="border-emerald-700/50 text-emerald-400 bg-emerald-900/20">
                ● Active
              </Pill>
            )}
            {showFlex && (
              <Pill className="border-blue-700/50 text-blue-400 bg-blue-900/20">
                Pay-As-You-Go
              </Pill>
            )}
            {showContract && (
              <Pill className="border-violet-700/50 text-violet-400 bg-violet-900/20">
                Contract
              </Pill>
            )}
          </div>
          <p className="text-slate-500 text-[11px]">
            {plan.subtitle} · {plan.gpu_model}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-xs font-black ${cs.accent}`}>
              GPU Cloud Mining
            </span>
            <span className="text-slate-600 text-[10px]">·</span>
            <span className="text-slate-400 text-[11px]">
              Min ${plan.price_min.toLocaleString()}
            </span>
            <span className="text-slate-600 text-[10px]">{plan.vram} VRAM</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-white font-black text-sm">${plan.price_min.toLocaleString()}</p>
          <p className="text-slate-600 text-[10px]">min stake</p>
        </div>
      </div>

      <div className="px-4 pb-3">
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

      <div
          className="border-t px-4 py-4 space-y-4"
          style={{ borderColor: "rgba(255,255,255,0.06)" }}
        >
          {showFlex && showContract && (
            <div className="flex gap-2">
              <button
                onClick={() => setTab("flexible")}
                className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${tab === "flexible" ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300" : "border-slate-800 text-slate-500 hover:border-slate-600"}`}
              >
                ⛏️ Pay-As-You-Go
              </button>
              <button
                onClick={() => setTab("contract")}
                className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${tab === "contract" ? "bg-violet-500/10 border-violet-500/40 text-violet-300" : "border-slate-800 text-slate-500 hover:border-slate-600"}`}
              >
                📋 Contract
              </button>
            </div>
          )}

          {/* ── PAY-AS-YOU-GO TAB ── */}
          {(tab === "flexible" || !showContract) && showFlex && (
            <div
              className="rounded-xl p-4 space-y-4"
              style={{
                background: "rgba(16,185,129,0.04)",
                border: "1px solid rgba(16,185,129,0.15)",
              }}
            >
              <div>
                <p className="text-emerald-300 font-black text-sm mb-1">
                  ⛏️ Pay-As-You-Go Mining
                </p>
                <p className="text-slate-400 text-xs leading-relaxed">
                  Stake for as little as 1 hour. Your GPU node earns from the moment it activates — capital plus all profits land in your wallet the instant the session ends.
                </p>
              </div>

              <div>
                <label className="text-slate-400 text-xs font-bold block mb-2">
                  How much would you like to stake?
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
                    className="w-full pl-9 pr-4 py-3.5 rounded-xl text-xl font-black text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-emerald-500 transition-colors"
                    style={{ appearance: "textfield" }}
                  />
                </div>
                {amountErr && amount > 0 && (
                  <p className="text-red-400 text-xs mt-1.5">{amountErr}</p>
                )}
                {quickVals.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {quickVals.map((v) => (
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

              {/* Period selector */}
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-2">
                  Choose your earning period
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {MINING_PERIODS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setMinPeriod(p)}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${minPeriod.key === p.key ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300" : "border-slate-800 text-slate-500 hover:border-slate-600"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <p className="text-slate-600 text-[10px] mt-2">
                  Mining runs for {minPeriod.durationLabel}. Stake + earnings
                  returned automatically when done.
                </p>
              </div>

              {/* Single estimated profit amount — no % shown */}
              {!amountErr && amount > 0 && (
                <>
                  <EstimatedProfitBanner
                    profit={flexEstProfit}
                    periodLabel={minPeriod.label}
                    isContract={false}
                  />

                  <div className="flex items-center gap-3 py-2">
                    {[
                      { icon: "⚡", text: "Mines immediately" },
                      { icon: "📊", text: "Live earnings tracker" },
                      { icon: "💰", text: "Capital returned on completion" },
                    ].map(s => (
                      <div key={s.icon} className="flex-1 text-center p-2 rounded-xl" style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.12)" }}>
                        <p className="text-base mb-0.5">{s.icon}</p>
                        <p className="text-emerald-300/80 text-[10px] font-semibold leading-tight">{s.text}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── CONTRACT TAB ── */}
          {(tab === "contract" || !showFlex) && showContract && (
            <div
              className="rounded-xl p-4 space-y-4"
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
                  Commit for 6–24 months and earn at our highest rates. Watch your balance grow every second in your portfolio. Capital and all earnings are released in full at maturity. <strong className="text-slate-300">Earnings not guaranteed.</strong>
                </p>
              </div>

              {/* Term selector — no % shown */}
              <div>
                <label className="text-slate-400 text-xs font-bold block mb-2">
                  Select Contract Term
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CONTRACT_TERMS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTerm(t)}
                      className={`p-3 rounded-xl border text-left transition-all ${term.key === t.key ? "bg-violet-500/10 border-violet-500/40" : "bg-slate-900/40 border-slate-800/60 hover:border-slate-700"}`}
                    >
                      <p
                        className={`text-sm font-black ${term.key === t.key ? "text-violet-300" : "text-slate-300"}`}
                      >
                        {t.label}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {t.key === "6m"
                          ? "Short term"
                          : t.key === "12m"
                            ? "Medium term"
                            : "Long term"}
                      </p>
                    </button>
                  ))}
                </div>
                <p className="text-slate-600 text-[11px] mt-2">{term.desc}</p>
              </div>

              {/* Capital amount */}
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
                    className="w-full pl-9 pr-4 py-3.5 rounded-xl text-xl font-black text-white bg-slate-900 border border-slate-700 focus:outline-none focus:border-violet-500 transition-colors"
                    style={{ appearance: "textfield" }}
                  />
                </div>
                {amountErr && amount > 0 && (
                  <p className="text-red-400 text-xs mt-1.5">{amountErr}</p>
                )}
                {quickVals.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {quickVals.map((v) => (
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

              {/* Single estimated profit amount — no % shown */}
              {!amountErr && amount > 0 && (
                <>
                  <EstimatedProfitBanner
                    profit={contractEstProfit}
                    periodLabel={`${term.label} total`}
                    isContract={true}
                  />

                  <div className="flex items-center gap-3 py-2">
                    {[
                      { icon: "🔒", text: `Locked ${term.label}` },
                      { icon: "📈", text: "Earns every second" },
                      { icon: "💰", text: "Full payout at maturity" },
                    ].map(s => (
                      <div key={s.icon} className="flex-1 text-center p-2 rounded-xl" style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.12)" }}>
                        <p className="text-base mb-0.5">{s.icon}</p>
                        <p className="text-violet-300/80 text-[10px] font-semibold leading-tight">{s.text}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {showDetails && (
  <div className="flex gap-1.5 flex-wrap">
    {INFO_SECTIONS.map(({ id, lbl, Icon }) => (
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
)}

{showDetails && section && (
  <div
    className="rounded-xl overflow-hidden"
    style={{ border: "1px solid rgba(255,255,255,0.07)" }}
  >
    <div className="p-4 space-y-3" style={{ background: "rgba(8,13,24,0.85)" }}>
      {section === "specs" && (
        <div className="grid grid-cols-2 gap-2">
          {SPEC_ROWS.map(({ lbl, val, Icon }) => (
            <div key={lbl} className="rounded-lg p-2.5 space-y-1" style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex items-center gap-1">
                <Icon size={10} className="text-slate-600" />
                <span className="text-slate-600 text-[9px] uppercase tracking-wider">{lbl}</span>
              </div>
              <p className={`text-xs font-bold leading-tight ${cs.accent}`}>{val}</p>
            </div>
          ))}
        </div>
      )}
      {section === "usecases" && (
        <div className="space-y-2">
          {plan.use_cases.map((uc) => (
            <div key={uc} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: "rgba(15,23,42,0.7)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: cs.bg, border: `1px solid ${cs.border}` }}>
                <Zap size={11} className={cs.accent} />
              </div>
              <div>
                <p className="text-white text-xs font-bold">{uc}</p>
                <p className="text-slate-500 text-[11px] mt-0.5">{UC_DESC[uc] ?? "High-performance GPU compute allocation."}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {section === "risk" && (
        <div className="space-y-3">
          <Disclaimer />
          <p className="text-slate-400 text-xs leading-relaxed">GPU compute demand is variable. Mining rewards fluctuate with network load and are not guaranteed.</p>
        </div>
      )}
      {section === "legal" && (
        <div className="space-y-2">
          {[
            ["Not a Security", "Node allocations are not classified as securities under applicable regulations."],
            ["No Guaranteed Returns", "All projected figures are estimates. We make no guarantee of minimum returns."],
            ["AML / KYC", "Withdrawals require identity verification. KYC must be approved before any payout is processed."],
          ].map(([t, d]) => (
            <div key={t} className="flex gap-2.5 p-3 rounded-lg" style={{ background: "rgba(15,23,42,0.7)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <BookOpen size={11} className="text-slate-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-white text-xs font-bold">{t}</p>
                <p className="text-slate-400 text-[11px] mt-0.5">{d}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
)}

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
                    {SPEC_ROWS.map(({ lbl, val, Icon }) => (
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
                          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            background: cs.bg,
                            border: `1px solid ${cs.border}`,
                          }}
                        >
                          <Zap size={11} className={cs.accent} />
                        </div>
                        <div>
                          <p className="text-white text-xs font-bold">{uc}</p>
                          <p className="text-slate-500 text-[11px] mt-0.5">
                            {UC_DESC[uc] ??
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
                        "Withdrawals require identity verification. KYC must be approved before any payout is processed.",
                      ],
                    ].map(([t, d]) => (
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

          </div>}

          {/* CTA */}
          <div
            className="pt-1 border-t"
            style={{ borderColor: "rgba(255,255,255,0.06)" }}
          >
            {locked ? (
              <button
                disabled
                className="w-full py-3 rounded-xl text-sm font-black bg-slate-800/60 text-slate-600 flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <Lock size={14} /> Institutional Access Only
              </button>
            ) : waitOnly && !userAlloc ? (
              waitlisted ? (
                <div className="text-center py-3 rounded-xl text-sm font-bold text-amber-400 bg-amber-900/10 border border-amber-800/20">
                  ✓ You're on the waitlist
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
              <button
                disabled={!!amountErr || !amount}
                onClick={handleMine}
                className="w-full py-4 rounded-xl text-base font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background:
                    amountErr || !amount
                      ? undefined
                      : tab === "contract"
                        ? "linear-gradient(135deg,rgba(139,92,246,0.9),rgba(99,102,241,0.7))"
                        : `linear-gradient(135deg,${cs.hex},rgba(16,185,129,0.7))`,
                }}
              >
                {tab === "contract" ? (
                  <>
                    <FileCheck size={14} /> Lock In $
                    {amount > 0 ? amount.toLocaleString() : "—"} · {term.label}{" "}
                    <ArrowRight size={13} />
                  </>
                ) : (
                  <>
                    <Pickaxe size={14} /> Start Mining · $
                    {amount > 0 ? amount.toLocaleString() : "—"} ·{" "}
                    {minPeriod.label} <ArrowRight size={13} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
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
  const [showKYC, setShowKYC] = useState(false);
  const [activeTab, setActiveTab] = useState<"plans" | "portfolio">("plans");
  const networkEarnings = useLiveNetworkEarnings();
  const { kycStatus } = useKycStatus(userId);
  // Track if we've synced plan rates to DB this session
  const [ratesSynced, setRatesSynced] = useState(false);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  function goToVerification() {
    setShowKYC(false);
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
    const u = session.user;
    setUserId(u.id);
    setUserEmail(u.email ?? "");

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
        .eq("user_id", u.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("gpu_waitlist")
        .select("plan_id,status")
        .eq("user_id", u.id),
      supabase
        .from("user_notifications")
        .select("*")
        .eq("user_id", u.id)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    setPlans(p ?? []);
    setEvents(ev ?? []);
    setAllocations(al ?? []);
    setWaitlist(wl ?? []);
    if (notifs?.length) setActiveNotif(notifs[0]);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── SYNC PLAN RATES TO DB ON FIRST LOAD ───────────────────────────────────
  // Pushes the new ROI rates and minimum deposits to gpu_plans table.
  // Runs once per session, silently in background.
  useEffect(() => {
    if (!userId || ratesSynced) return;
    setRatesSynced(true);
    syncPlanRatesToDB().catch((e) =>
      console.warn("[plan-sync] Could not sync rates:", e),
    );
  }, [userId, ratesSynced]);

  const [autoCompleting, setAutoCompleting] = useState(false);
  const autoCompleteExpiredSessions = useCallback(async () => {
    if (!userId || autoCompleting) return;
    const expired = allocations.filter(
      (a) =>
        !a.mining_completed &&
        a.payment_model === "flexible" &&
        a.mining_ends_at &&
        new Date(a.mining_ends_at) <= new Date(),
    );
    if (!expired.length) return;
    setAutoCompleting(true);
    try {
      const res = await fetch("/api/mining/claim-session", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const n = data.completed ?? data.processed ?? 0;
        if (n > 0) {
          showToast(
            `✅ ${n} session${n > 1 ? "s" : ""} completed — earnings credited to your wallet!`,
          );
          await loadAll();
        }
      }
    } catch {}
    setAutoCompleting(false);
  }, [userId, allocations, autoCompleting, loadAll]); // eslint-disable-line

  useEffect(() => {
    if (activeTab === "portfolio") {
      autoCompleteExpiredSessions();
    }
  }, [activeTab]); // eslint-disable-line

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel("allocs_rt")
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
      supabase.removeChannel(ch);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || !allocations.length || !plans.length) return;
    const iv = setInterval(async () => {
      const now = Date.now();
      for (const alloc of allocations.filter(
        (a) => a.status === "active" && !a.mining_completed,
      )) {
        const plan = plans.find((p) => p.id === alloc.plan_id);
        const period = alloc.mining_period ?? "daily";
  // planSlug removed — use safePlan object directly
        const base = alloc.total_earned ?? 0;
        const elapsed = Math.max(
          0,
          (now - new Date(alloc.updated_at ?? alloc.created_at).getTime()) /
            1000,
        );

        // planObj is the resolved Plan — calcProfit uses tier_index for correct ROI
        const planObj = plan ?? { tier_index: 0, price_min: 5, short_name: "", name: "", gpu_model: "" } as unknown as Plan;
        let newEarned: number;
        if (alloc.payment_model === "flexible") {
          const totalProfit = calcProfit(alloc.amount_invested, planObj, period);
          const pMs = PERIOD_DURATIONS_MS[period] ?? PERIOD_DURATIONS_MS.daily;
          newEarned = Math.min(
            base + (totalProfit / (pMs / 1000)) * elapsed,
            totalProfit,
          );
        } else {
          // Contract: daily ROI per second
          const dailyProfit = calcProfit(alloc.amount_invested, planObj, "daily");
          newEarned = base + (dailyProfit / 86400) * elapsed;
        }

        await supabase
          .from("node_allocations")
          .update({
            total_earned: Math.round(newEarned * 1_000_000) / 1_000_000,
            updated_at: new Date().toISOString(),
          })
          .eq("id", alloc.id)
          .eq("mining_completed", false);
      }
    }, 60_000);
    return () => clearInterval(iv);
  }, [userId, allocations, plans]);

  async function joinWaitlist(planId: string) {
    if (!userId) return;
    const { error } = await supabase.from("gpu_waitlist").upsert(
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
      const monthlyRoi = getPlanRoi(plan, "monthly");
      const contractMonths = contractTerm?.months ?? 6;
      const estProfit = amount * monthlyRoi * contractMonths;
      const ps = new URLSearchParams({
        node: planId,
        name: plan.name,
        price: amount.toString(),
        daily: (calcProfit(amount, plan, "daily")).toFixed(6),
        itype,
        gpu: plan.gpu_model,
        vram: plan.vram,
        paymentModel: "contract",
        contractMonths: String(contractMonths),
        contractLabel: contractTerm?.label ?? "6 Months",
        // Pass est profit (not %) — checkout page can display this
        contractEstProfit: estProfit.toFixed(2),
        lockInMonths: String(contractMonths),
        lockInLabel: contractTerm?.label ?? "6 Months",
        lockInMultiplier: "1",
      });
      if (typeof window !== "undefined")
        sessionStorage.setItem("checkout_redirect", "/dashboard/gpu-plans");
      router.push(`/dashboard/checkout?${ps.toString()}`);
    } else {
      const period = miningPeriod ?? "daily";
      const estProfit = calcProfit(amount, plan, period);
      const ps = new URLSearchParams({
        node: planId,
        name: plan.name,
        price: amount.toString(),
        itype,
        gpu: plan.gpu_model,
        vram: plan.vram,
        paymentModel: "flexible",
        miningPeriod: period,
        miningEstProfit: estProfit.toFixed(2),
        lockInMonths: "0",
        lockInLabel: "Flexible",
        lockInMultiplier: "1",
      });
      if (typeof window !== "undefined")
        sessionStorage.setItem("checkout_redirect", "/dashboard/gpu-plans");
      router.push(`/dashboard/checkout?${ps.toString()}`);
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
    events.find((e) => e.plan_id === id && e.is_active) ?? null;
  const allocByPlan = (id: string) =>
    allocations.find((a) => a.plan_id === id) ?? null;
  const isOnWaitlist = (id: string) => waitlist.some((w) => w.plan_id === id);
  const activeAllocs = allocations.filter(
    (a) => a.status === "active" || a.status === "matured",
  );
  const kycVerified = kycStatus === "approved";

  return (
    <div
      className="flex min-h-screen text-white"
      style={{ background: "#06080f" }}
    >
      <DashboardNavigation />

      {showKYC && (
        <KYCGateModal
          kycStatus={kycStatus}
          onClose={() => setShowKYC(false)}
          onGoVerify={goToVerification}
        />
      )}

      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-2xl flex items-center gap-2 max-w-xs ${toast.ok ? "bg-emerald-500 text-slate-950" : "bg-red-500 text-white"}`}
        >
          {toast.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}{" "}
          {toast.msg}
        </div>
      )}

      {activeNotif && (
        <div
          className="fixed bottom-24 md:bottom-6 right-4 z-50 max-w-xs w-full rounded-2xl p-4 shadow-2xl"
          style={{
            background: "rgb(10,16,28)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Bell size={13} className="text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-bold">
                {activeNotif.title}
              </p>
              {activeNotif.body && (
                <p className="text-slate-400 text-xs mt-0.5 line-clamp-2">
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
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 pt-5 pb-28 md:pb-12 space-y-8">
          {/* HERO */}
          <div>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{" "}
                Live Network
              </span>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-800/60 border border-slate-700/40 px-2.5 py-1 rounded-full">
                24h: ${networkEarnings}
              </span>
              {kycVerified ? (
                <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <CheckCircle size={9} /> KYC Verified
                </span>
              ) : (
                <span
                  className="text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1.5"
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
                  <Shield size={9} />{" "}
                  {kycStatus === "pending" ? "KYC Reviewing" : "KYC Needed"}
                </span>
              )}
            </div>
            <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-tight">
              Put Your Capital
              <br />
              <span className="text-emerald-400">To Work 24/7</span>
            </h1>
            <p className="text-slate-400 mt-3 leading-relaxed text-sm">
              Stake capital into enterprise-grade GPU nodes. Your node earns
              around the clock processing real AI workloads — and you watch every
              dollar appear in real time.
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {MARKET_STATS.map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 bg-slate-900/60 border border-slate-800/60 rounded-xl px-3 py-2.5"
                >
                  <Icon size={12} className="text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-white font-black text-sm">{value}</p>
                    <p className="text-slate-600 text-[9px] leading-tight">
                      {label}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!kycVerified && (
            <div
              className="rounded-2xl p-4 flex items-start gap-3"
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
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
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
                  <Clock size={16} className="text-amber-400" />
                ) : (
                  <Info size={16} className="text-blue-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`font-black text-sm ${kycStatus === "pending" ? "text-amber-300" : "text-blue-300"}`}
                >
                  {kycStatus === "pending"
                    ? "KYC Under Review — Mining available now"
                    : kycStatus === "rejected"
                      ? "KYC Rejected — Resubmit to enable withdrawals"
                      : "KYC required for withdrawals only"}
                </p>
                <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                  {kycStatus === "pending"
                    ? "Documents being reviewed. Start mining now — withdrawals unlock automatically once approved."
                    : kycStatus === "rejected"
                      ? "Mining continues normally. Resubmit documents to enable withdrawals."
                      : "Start mining immediately without verification. KYC only required when withdrawing."}
                </p>
                {kycStatus !== "pending" && (
                  <button
                    onClick={goToVerification}
                    className="mt-2 font-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:opacity-90 w-fit"
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
                    <FileCheck size={11} />
                    {kycStatus === "rejected"
                      ? "Resubmit Documents"
                      : "Complete Verification"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TABS */}
          <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-1">
            <button
              onClick={() => setActiveTab("plans")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "plans" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
            >
              <Server size={13} /> Mining Nodes
            </button>
            <button
              onClick={() => setActiveTab("portfolio")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "portfolio" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}
            >
              <BarChart2 size={13} /> My Portfolio
              {activeAllocs.length > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                  {activeAllocs.length}
                </span>
              )}
            </button>
          </div>

          {/* ── PORTFOLIO TAB ── */}
          {activeTab === "portfolio" && (
            <section>
              <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-white font-black text-xl">
                    Active Mining Sessions
                  </h2>
                  <p className="text-slate-500 text-sm mt-1">
                    Real-time earnings, progress &amp; withdrawals
                  </p>
                </div>
                {allocations.some(
                  (a) =>
                    !a.mining_completed &&
                    a.mining_ends_at &&
                    new Date(a.mining_ends_at) <= new Date() &&
                    a.payment_model === "flexible",
                ) && (
                  <button
                    onClick={autoCompleteExpiredSessions}
                    disabled={autoCompleting}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition-all"
                    style={{
                      background: "rgba(245,158,11,0.15)",
                      border: "1px solid rgba(245,158,11,0.4)",
                      color: "#f59e0b",
                    }}
                  >
                    {autoCompleting ? (
                      <>
                        <RefreshCw size={11} className="animate-spin" />{" "}
                        Processing…
                      </>
                    ) : (
                      <>
                        <Coins size={11} /> Claim All Expired
                      </>
                    )}
                  </button>
                )}
              </div>

              {activeAllocs.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    {
                      label: "Total Staked",
                      value: `$${activeAllocs.reduce((s, a) => s + a.amount_invested, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
                      icon: Wallet,
                      color: "text-white",
                    },
                    {
                      label: "Active Sessions",
                      value: String(
                        activeAllocs.filter(
                          (a) =>
                            !a.mining_completed &&
                            a.payment_model === "flexible",
                        ).length,
                      ),
                      icon: Pickaxe,
                      color: "text-emerald-400",
                    },
                    {
                      label: "Completed",
                      value: String(
                        activeAllocs.filter((a) => a.mining_completed).length,
                      ),
                      icon: CheckCircle,
                      color: "text-blue-400",
                    },
                    {
                      label: "Contracts",
                      value: String(
                        activeAllocs.filter(
                          (a) => a.payment_model === "contract",
                        ).length,
                      ),
                      icon: Lock,
                      color: "text-violet-400",
                    },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div
                      key={label}
                      className="rounded-xl p-3"
                      style={{
                        background: "rgba(15,23,42,0.8)",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        <Icon size={11} className="text-slate-600" />
                        <p className="text-slate-500 text-[10px] uppercase tracking-wide">
                          {label}
                        </p>
                      </div>
                      <p
                        className={`font-black text-base leading-none ${color}`}
                      >
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {activeAllocs.length === 0 ? (
                <div
                  className="rounded-2xl p-8 text-center"
                  style={{
                    background: "rgba(15,23,42,0.5)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <Pickaxe size={28} className="text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-500 font-semibold text-sm">
                    No active mining sessions yet
                  </p>
                  <p className="text-slate-600 text-xs mt-1">
                    Select a GPU node to start
                  </p>
                  <button
                    onClick={() => setActiveTab("plans")}
                    className="mt-4 px-4 py-2 rounded-xl font-black text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all flex items-center gap-2 mx-auto"
                  >
                    <Pickaxe size={12} /> Browse Mining Nodes
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeAllocs.map((alloc) => (
                    <PortfolioCard
                      key={alloc.id}
                      alloc={alloc}
                      plan={plans.find((p) => p.id === alloc.plan_id)}
                      userId={userId ?? ""}
                      onWithdrawSuccess={() => {
                        showToast(
                          "Withdrawal queued! Track in Financials → Withdrawals.",
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

              <section>
                <h2 className="text-white font-black text-xl mb-1">
                  Choose Your GPU Node
                </h2>
                <p className="text-slate-500 text-sm mb-4">
                  Enter your stake amount and start earning in 30 seconds
                </p>
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
                      onNeedKYC={() => setShowKYC(true)}
                      onWaitlist={() => joinWaitlist(plan.id)}
                      onMine={(amount, itype, model, period, term) =>
                        mine(plan.id, amount, itype, model, period, term)
                      }
                    />
                  ))}
                </div>
              </section>

              <div className="rounded-2xl p-4 mt-4" style={{ background: "rgba(16,185,129,0.04)", border: "1px solid rgba(16,185,129,0.12)" }}>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Avg. Payout Time", value: "Within 2 business days", icon: "⚡" },
                    { label: "Node Uptime SLA", value: "99.7% guaranteed", icon: "🟢" },
                    { label: "Capital Protection", value: "Returned at session end", icon: "🔒" },
                    { label: "Withdrawals", value: "Mon–Fri business days", icon: "💳" },
                  ].map(s => (
                    <div key={s.label} className="flex items-start gap-2.5">
                      <span className="text-xl shrink-0 mt-0.5">{s.icon}</span>
                      <div>
                        <p className="text-white text-xs font-black">{s.value}</p>
                        <p className="text-slate-500 text-[10px]">{s.label}</p>
                      </div>
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