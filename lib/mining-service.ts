// lib/mining-service.ts
// ─────────────────────────────────────────────────────────────────────────────
// Backend-facing mining service.
// Handles:
//  - Fetching current rate snapshot for a plan/period from DB
//  - Computing live earnings ($ amount only — NO % shown to users)
//  - Completing mining sessions and crediting wallets
//  - Profit calculation per period with proper multipliers
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── PERIOD DURATIONS ─────────────────────────────────────────────────────────
export const PERIOD_DURATIONS_MS: Record<string, number> = {
  hourly: 1 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

// ─── PROFIT RANGE CONSTANTS (Foundation Node baseline in $) ───────────────────
// Daily profit range: $0.29 – $0.40 (Foundation Node, 1x multiplier)
export const BASE_DAILY_MIN = 0.29;
export const BASE_DAILY_MAX = 0.4;

// Period multipliers applied to daily profit:
//  Hourly  = (daily / 24) × 0.80   (−20%)
//  Daily   = daily × 1.00
//  Weekly  = (daily × 7) × 1.10    (+10%)
//  Monthly = (daily × 30) × 1.25   (+25%)
export const PERIOD_PROFIT_MULTIPLIERS: Record<string, number> = {
  hourly: 0.8 / 24, // proportion of daily profit per hour, with -20%
  daily: 1.0,
  weekly: 7 * 1.1,
  monthly: 30 * 1.25,
};

// ROI tier multipliers by tier_index (matches gpu_plans.tier_index)
export const TIER_MULTIPLIERS: Record<number, number> = {
  0: 1.0, // Foundation Node
  1: 1.1, // Accelerator Node
  2: 1.2, // Pro Node
  3: 1.3, // Enterprise Node
  4: 1.4, // H100 PCIe Node
};

// ─── RATE SNAPSHOT TYPE ───────────────────────────────────────────────────────
export type RateSnapshot = {
  plan_id: string;
  period: string;
  rate_factor: number; // internal only — NEVER sent to client
  daily_profit_min: number;
  daily_profit_max: number;
  investor_count: number;
  valid_until: string;
};

// ─── Get current rate snapshot for a plan+period ──────────────────────────────
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

// ─── Compute total profit for a completed mining session ─────────────────────
// Returns the $ profit earned — no % exposed.
export function computeMiningProfit(params: {
  dailyProfitMin: number; // from plan (base × tier_multiplier)
  dailyProfitMax: number;
  rateFactor: number; // internal 0.72–1.00 factor
  period: string; // 'hourly' | 'daily' | 'weekly' | 'monthly'
}): number {
  const { dailyProfitMin, dailyProfitMax, rateFactor, period } = params;

  // Pick actual daily profit using the rate factor
  const dailyProfit =
    dailyProfitMin + rateFactor * (dailyProfitMax - dailyProfitMin);

  // Apply period multiplier
  const multiplier = PERIOD_PROFIT_MULTIPLIERS[period] ?? 1.0;
  return parseFloat((dailyProfit * multiplier).toFixed(6));
}

// ─── Compute live earnings tick (per-second) for display ─────────────────────
// Only shows $ amount — no rate %, no percentage visible.
export function computePerSecondEarnings(params: {
  totalPeriodProfit: number; // total $ profit for the whole period
  periodMs: number; // total duration in ms
}): number {
  const { totalPeriodProfit, periodMs } = params;
  const periodSec = periodMs / 1000;
  return totalPeriodProfit / periodSec;
}

// ─── Mining Period Labels (user-facing — no % shown) ─────────────────────────
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

// ─── Get display-safe profit range ($ amounts only) ──────────────────────────
// This is what the UI shows in the selector — a range of $ earnings.
// We intentionally do NOT show what % this represents.
export function getDisplayProfitRange(params: {
  planDailyMin: number; // plan's base_daily_profit_min × roi_tier_multiplier
  planDailyMax: number; // plan's base_daily_profit_max × roi_tier_multiplier
  period: string;
}): { min: number; max: number } {
  const { planDailyMin, planDailyMax, period } = params;
  const multiplier = PERIOD_PROFIT_MULTIPLIERS[period] ?? 1.0;

  return {
    min: parseFloat((planDailyMin * multiplier).toFixed(4)),
    max: parseFloat((planDailyMax * multiplier).toFixed(4)),
  };
}

// ─── Complete a mining session (server action / API route) ───────────────────
export async function completeMiningSession(
  supabase: SupabaseClient,
  allocationId: string,
): Promise<{ success: boolean; error?: string; profit?: number }> {
  // Fetch allocation
  const { data: alloc, error: fetchErr } = await supabase
    .from("node_allocations")
    .select("*")
    .eq("id", allocationId)
    .single();

  if (fetchErr || !alloc)
    return { success: false, error: "Allocation not found" };
  if (alloc.mining_completed)
    return { success: false, error: "Already completed" };

  const finalProfit = alloc.total_earned ?? 0;

  // Mark allocation as completed
  const { error: updateErr } = await supabase
    .from("node_allocations")
    .update({
      mining_completed: true,
      status: "matured",
      final_profit: finalProfit,
      updated_at: new Date().toISOString(),
    })
    .eq("id", allocationId);

  if (updateErr) return { success: false, error: updateErr.message };

  // Credit capital + profit to user wallet
  const { data: user, error: userErr } = await supabase
    .from("users")
    .select("balance_available, total_earned")
    .eq("id", alloc.user_id)
    .single();

  if (userErr || !user) return { success: false, error: "User not found" };

  const newBalance =
    (user.balance_available ?? 0) + alloc.amount_invested + finalProfit;
  const newTotalEarned = (user.total_earned ?? 0) + finalProfit;

  await supabase
    .from("users")
    .update({
      balance_available: newBalance,
      total_earned: newTotalEarned,
    })
    .eq("id", alloc.user_id);

  // Notify user
  await supabase.from("user_notifications").insert({
    user_id: alloc.user_id,
    type: "mining_complete",
    title: "⛏️ Mining Complete!",
    body: `Your ${alloc.mining_period} mining session finished. $${finalProfit.toFixed(4)} profit + $${alloc.amount_invested.toFixed(2)} capital returned to your wallet.`,
    created_at: new Date().toISOString(),
  });

  return { success: true, profit: finalProfit };
}

// ─── Fetch rate snapshot to use when a new mining session starts ──────────────
// Assigns the current rate to the allocation so it stays consistent
// for the duration of its mining period.
export async function assignRateToAllocation(
  supabase: SupabaseClient,
  allocationId: string,
  planId: string,
  period: string,
): Promise<number | null> {
  const snapshot = await getCurrentRateSnapshot(supabase, planId, period);
  if (!snapshot) return null;

  await supabase
    .from("node_allocations")
    .update({ rate_factor_used: snapshot.rate_factor })
    .eq("id", allocationId);

  return snapshot.rate_factor;
}
