// lib/mining-service.ts
// ─────────────────────────────────────────────────────────────────────────────
// FINAL FIXED VERSION
// Issue #2 FIX: base_daily_profit_min/max = % of capital per day (e.g. 0.29 = 0.29%/day)
//               Consumers divide by 100 then multiply by amount_invested
// Issue #6 FIX: All earnings scale with amount_invested — no flat $ rates
// Issue #7 FIX: completeMiningSession has atomic idempotency guard
// Issue #8 FIX: Double-credit blocked by .eq("mining_completed", false)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── PERIOD DURATIONS ─────────────────────────────────────────────────────────
export const PERIOD_DURATIONS_MS: Record<string, number> = {
  hourly: 1 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

// ─── PROFIT % CONSTANTS ───────────────────────────────────────────────────────
// IMPORTANT: These are PERCENT of capital per day — NOT flat dollar amounts.
// Example: BASE_DAILY_MIN = 0.29 means 0.29% of amount_invested per day.
//   $1,000 invested → $2.90/day min (Foundation)
//   $500,000 invested → $1,450/day min (Foundation)
// This is what fixes the capital scaling bug (#2 and #6).
export const BASE_DAILY_MIN = 0.29; // 0.29% per day — stored as-is in DB
export const BASE_DAILY_MAX = 0.4; // 0.40% per day — stored as-is in DB

// Period multipliers applied to daily % profit
export const PERIOD_PROFIT_MULTIPLIERS: Record<string, number> = {
  hourly: 0.8 / 24, // (daily/24) × 0.80 — slight discount for short sessions
  daily: 1.0, // baseline
  weekly: 7 * 1.1, // +10% bonus for weekly commitment
  monthly: 30 * 1.25, // +25% bonus for monthly commitment
};

// ROI tier multipliers — higher tier GPU = higher multiplier on daily %
export const TIER_MULTIPLIERS: Record<number, number> = {
  0: 1.0, // Foundation Node    → 0.29%–0.40%/day
  1: 1.1, // Accelerator Node   → 0.319%–0.44%/day
  2: 1.2, // Pro Node           → 0.348%–0.48%/day
  3: 1.3, // Enterprise Node    → 0.377%–0.52%/day
  4: 1.4, // H100 PCIe Node     → 0.406%–0.56%/day
};

// ─── TYPES ────────────────────────────────────────────────────────────────────
export type RateSnapshot = {
  plan_id: string;
  period: string;
  rate_factor: number; // INTERNAL ONLY — never shown to users
  daily_profit_min: number; // % value e.g. 0.29 — divide by 100 × capital for $
  daily_profit_max: number; // % value e.g. 0.40 — divide by 100 × capital for $
  investor_count: number;
  valid_until: string;
};

export type MiningPeriodInfo = {
  key: string;
  label: string;
  durationLabel: string;
  durationMs: number;
};

export const MINING_PERIODS: MiningPeriodInfo[] = [
  {
    key: "hourly",
    label: "1 Hour",
    durationLabel: "1 hour",
    durationMs: PERIOD_DURATIONS_MS.hourly,
  },
  {
    key: "daily",
    label: "1 Day",
    durationLabel: "24 hours",
    durationMs: PERIOD_DURATIONS_MS.daily,
  },
  {
    key: "weekly",
    label: "1 Week",
    durationLabel: "7 days",
    durationMs: PERIOD_DURATIONS_MS.weekly,
  },
  {
    key: "monthly",
    label: "1 Month",
    durationLabel: "30 days",
    durationMs: PERIOD_DURATIONS_MS.monthly,
  },
];

// ─── CORE PROFIT CALCULATION (capital-scaled) ─────────────────────────────────
// FIX #2 & #6: profit is proportional to amount_invested
export function computeMiningProfit(params: {
  amountInvested: number;
  planDailyPctMin: number; // e.g. 0.29 (from DB) × roi_tier_multiplier, then /100 inside
  planDailyPctMax: number; // e.g. 0.40 (from DB) × roi_tier_multiplier, then /100 inside
  rateFactor: number; // 0.72–1.00, internal only
  period: string;
}): number {
  const {
    amountInvested,
    planDailyPctMin,
    planDailyPctMax,
    rateFactor,
    period,
  } = params;
  // Convert stored % value to decimal multiplier
  const dailyDecMin = planDailyPctMin / 100;
  const dailyDecMax = planDailyPctMax / 100;
  const dailyDec = dailyDecMin + rateFactor * (dailyDecMax - dailyDecMin);
  const mult = PERIOD_PROFIT_MULTIPLIERS[period] ?? 1.0;
  return parseFloat((amountInvested * dailyDec * mult).toFixed(6));
}

// ─── PER-SECOND EARNINGS for live ticker ─────────────────────────────────────
export function computePerSecondEarnings(params: {
  amountInvested: number;
  planDailyPctMin: number;
  planDailyPctMax: number;
  rateFactor: number;
  period: string;
}): number {
  const total = computeMiningProfit(params);
  const ms = PERIOD_DURATIONS_MS[params.period] ?? PERIOD_DURATIONS_MS.daily;
  return total / (ms / 1000);
}

// ─── DISPLAY PROFIT RANGE (used internally/admin only — NOT shown pre-purchase) ─
// FIX #1 & #5: This is never called from the plan card pre-purchase UI
export function getDisplayProfitRange(params: {
  amountInvested: number;
  planDailyMin: number; // raw DB value e.g. 0.29
  planDailyMax: number; // raw DB value e.g. 0.40
  period: string;
}): { min: number; max: number } {
  const { amountInvested, planDailyMin, planDailyMax, period } = params;
  const mult = PERIOD_PROFIT_MULTIPLIERS[period] ?? 1.0;
  return {
    min: parseFloat((amountInvested * (planDailyMin / 100) * mult).toFixed(4)),
    max: parseFloat((amountInvested * (planDailyMax / 100) * mult).toFixed(4)),
  };
}

// ─── GET CURRENT RATE SNAPSHOT ────────────────────────────────────────────────
export async function getCurrentRateSnapshot(
  supabase: SupabaseClient,
  planId: string,
  period: string,
): Promise<RateSnapshot | null> {
  const { data, error } = await supabase
    .from("current_mining_rates")
    .select("*")
    .eq("plan_id", planId)
    .eq("period", period)
    .single();
  if (error || !data) return null;
  return data as RateSnapshot;
}

// ─── COMPLETE A MINING SESSION (atomic, idempotent) ───────────────────────────
// FIX #7 & #8: Atomic guard prevents double-credit on concurrent cron runs
export async function completeMiningSession(
  supabase: SupabaseClient,
  allocationId: string,
): Promise<{ success: boolean; error?: string; profit?: number }> {
  const { data: alloc, error: fetchErr } = await supabase
    .from("node_allocations")
    .select("*")
    .eq("id", allocationId)
    .single();
  if (fetchErr || !alloc)
    return { success: false, error: "Allocation not found" };

  // Idempotency: already completed — return without double-crediting
  if (alloc.mining_completed) {
    return {
      success: true,
      profit: alloc.final_profit ?? alloc.total_earned ?? 0,
    };
  }

  const plan = alloc as any;
  const rateFactor = plan.rate_factor_used ?? 0.86;
  const dailyPctMin =
    ((plan.base_daily_profit_min ?? 0.29) / 100) *
    (plan.roi_tier_multiplier ?? 1.0);
  const dailyPctMax =
    ((plan.base_daily_profit_max ?? 0.4) / 100) *
    (plan.roi_tier_multiplier ?? 1.0);
  const dailyDec = dailyPctMin + rateFactor * (dailyPctMax - dailyPctMin);
  const mult = PERIOD_PROFIT_MULTIPLIERS[plan.mining_period ?? "daily"] ?? 1.0;
  const maxPeriodProfit = plan.amount_invested * dailyDec * mult;
  const finalProfit = Math.min(
    plan.total_earned ?? maxPeriodProfit,
    maxPeriodProfit,
  );
  const rounded = Math.round(finalProfit * 1_000_000) / 1_000_000;

  // ATOMIC UPDATE — only proceeds if mining_completed is still false (FIX #7 #8)
  const { data: updated, error: updateErr } = await supabase
    .from("node_allocations")
    .update({
      mining_completed: true,
      status: "matured",
      final_profit: rounded,
      total_earned: rounded,
      updated_at: new Date().toISOString(),
    })
    .eq("id", allocationId)
    .eq("mining_completed", false) // ATOMIC GUARD
    .select("id");

  if (updateErr) return { success: false, error: updateErr.message };
  if (!updated || updated.length === 0) {
    // Another process already completed it — skip wallet credit
    return { success: true, profit: rounded };
  }

  // Credit wallet only when atomic update succeeded
  const { data: user } = await supabase
    .from("users")
    .select("balance_available, wallet_balance, total_earned")
    .eq("id", plan.user_id)
    .single();

  if (user) {
    const credit = plan.amount_invested + rounded;
    await supabase
      .from("users")
      .update({
        balance_available: Math.max(
          0,
          ((user as any).balance_available ?? 0) + credit,
        ),
        wallet_balance: Math.max(
          0,
          ((user as any).wallet_balance ?? 0) + credit,
        ),
        total_earned: ((user as any).total_earned ?? 0) + rounded,
        updated_at: new Date().toISOString(),
      })
      .eq("id", plan.user_id);
  }

  await supabase.from("user_notifications").insert({
    user_id: plan.user_id,
    type: "mining_complete",
    title: "⛏️ Mining Session Complete!",
    body: `Your ${plan.mining_period ?? "daily"} session finished. $${rounded.toFixed(4)} profit + $${Number(plan.amount_invested).toFixed(2)} capital credited to your wallet.`,
    created_at: new Date().toISOString(),
  });

  return { success: true, profit: rounded };
}

// ─── ASSIGN RATE TO NEW ALLOCATION ────────────────────────────────────────────
export async function assignRateToAllocation(
  supabase: SupabaseClient,
  allocationId: string,
  planId: string,
  period: string,
): Promise<number> {
  const snapshot = await getCurrentRateSnapshot(supabase, planId, period);
  const rateFactor = snapshot?.rate_factor ?? 0.86;
  await supabase
    .from("node_allocations")
    .update({ rate_factor_used: rateFactor })
    .eq("id", allocationId);
  return rateFactor;
}
