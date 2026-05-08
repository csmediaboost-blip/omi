// lib/mining-service.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIXED VERSION
//  - Profit scales with amount_invested (capital-proportional earnings)
//  - Daily profit expressed as % of capital (not flat $/day)
//  - Foundation baseline: 0.29%–0.40% per day of capital invested
//  - Rate factor: 0.72–1.00 (internal only — users see $ amounts only)
//  - No % shown in any UI-facing export
//  - computePerSecondEarnings now requires amount_invested
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── PERIOD DURATIONS ─────────────────────────────────────────────────────────
export const PERIOD_DURATIONS_MS: Record<string, number> = {
  hourly: 1 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

// ─── PROFIT CONSTANTS ─────────────────────────────────────────────────────────
// IMPORTANT: These are % of capital per day (not flat $ per day).
// Foundation Node baseline: 0.29% – 0.40% of amount_invested per day.
// This ensures capital scales correctly.
//
// Example: $1,000 invested, Foundation Node (1x), daily session:
//   Min = $1,000 × 0.0029 × 1.0 = $2.90/day
//   Max = $1,000 × 0.0040 × 1.0 = $4.00/day
//
// Example: $500,000 invested, H100 PCIe (1.4x), monthly session:
//   Min = $500,000 × 0.0029 × 1.4 × 30 × 1.25 = $76,125/month
//   Max = $500,000 × 0.0040 × 1.4 × 30 × 1.25 = $105,000/month
//
// The values in DB (base_daily_profit_min/max) store the % as a decimal:
//   base_daily_profit_min = 0.29  → interpreted as 0.29% per day
//   base_daily_profit_max = 0.40  → interpreted as 0.40% per day
// Divide by 100 to get the multiplier applied to amount_invested.
export const BASE_DAILY_PCT_MIN = 0.0029; // 0.29% per day
export const BASE_DAILY_PCT_MAX = 0.004; // 0.40% per day

// Legacy constants kept for backward compatibility with existing imports
export const BASE_DAILY_MIN = 0.29; // stored in DB as-is, divide by 100 before use
export const BASE_DAILY_MAX = 0.4; // stored in DB as-is, divide by 100 before use

// Period multipliers (applied AFTER daily % calculation)
// Hourly: (daily / 24) × 0.80  → slight discount for short sessions
// Daily:  1.0                   → baseline
// Weekly: 7 × 1.10              → +10% bonus for weekly commitment
// Monthly: 30 × 1.25            → +25% bonus for monthly commitment
export const PERIOD_PROFIT_MULTIPLIERS: Record<string, number> = {
  hourly: 0.8 / 24,
  daily: 1.0,
  weekly: 7 * 1.1,
  monthly: 30 * 1.25,
};

// ROI tier multipliers (applied to daily % before period multiplier)
export const TIER_MULTIPLIERS: Record<number, number> = {
  0: 1.0, // Foundation Node    → 0.29%–0.40%/day base
  1: 1.1, // Accelerator Node   → 0.319%–0.44%/day
  2: 1.2, // Pro Node           → 0.348%–0.48%/day
  3: 1.3, // Enterprise Node    → 0.377%–0.52%/day
  4: 1.4, // H100 PCIe Node     → 0.406%–0.56%/day
};

// ─── RATE SNAPSHOT TYPE ───────────────────────────────────────────────────────
export type RateSnapshot = {
  plan_id: string;
  period: string;
  rate_factor: number; // INTERNAL ONLY — never shown to users
  daily_profit_min: number; // stored as % (e.g. 0.29), divide by 100 to use
  daily_profit_max: number; // stored as % (e.g. 0.40), divide by 100 to use
  investor_count: number;
  valid_until: string;
};

// ─── Get current rate snapshot ────────────────────────────────────────────────
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

// ─── Compute total profit for a mining session (capital-scaled) ───────────────
// This is the CORRECT calculation — profit scales with amount_invested.
// All values in $ — no % exposed externally.
export function computeMiningProfit(params: {
  amountInvested: number; // capital staked by user
  dailyPctMin: number; // from DB: base_daily_profit_min / 100 × roi_multiplier
  dailyPctMax: number; // from DB: base_daily_profit_max / 100 × roi_multiplier
  rateFactor: number; // internal 0.72–1.00 factor
  period: string; // 'hourly' | 'daily' | 'weekly' | 'monthly'
}): number {
  const { amountInvested, dailyPctMin, dailyPctMax, rateFactor, period } =
    params;

  // Pick actual daily % using the rate factor (internal)
  const dailyPct = dailyPctMin + rateFactor * (dailyPctMax - dailyPctMin);

  // Apply period multiplier
  const multiplier = PERIOD_PROFIT_MULTIPLIERS[period] ?? 1.0;

  // Capital-proportional profit
  return parseFloat((amountInvested * dailyPct * multiplier).toFixed(6));
}

// ─── Compute per-second earnings for live ticker (capital-scaled) ─────────────
export function computePerSecondEarnings(params: {
  amountInvested: number;
  dailyPctMin: number; // already scaled by roi_tier_multiplier
  dailyPctMax: number;
  rateFactor: number;
  period: string;
}): number {
  const totalProfit = computeMiningProfit(params);
  const periodMs =
    PERIOD_DURATIONS_MS[params.period] ?? PERIOD_DURATIONS_MS.daily;
  return totalProfit / (periodMs / 1000);
}

// ─── Mining Period Labels ─────────────────────────────────────────────────────
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

// ─── Display profit range ($ amounts, capital-scaled, used POST-purchase only) ─
// IMPORTANT: This should only be called in the PORTFOLIO view after mining starts.
// PRE-PURCHASE: do NOT call this — show no earnings estimates.
// POST-PURCHASE: show live ticking $ earned (not this range).
// This function is kept for internal admin/debugging use only.
export function getDisplayProfitRange(params: {
  amountInvested: number;
  planDailyMin: number; // from DB (e.g. 0.29) — divide by 100 inside
  planDailyMax: number; // from DB (e.g. 0.40) — divide by 100 inside
  period: string;
}): { min: number; max: number } {
  const { amountInvested, planDailyMin, planDailyMax, period } = params;
  const multiplier = PERIOD_PROFIT_MULTIPLIERS[period] ?? 1.0;

  return {
    min: parseFloat(
      (amountInvested * (planDailyMin / 100) * multiplier).toFixed(4),
    ),
    max: parseFloat(
      (amountInvested * (planDailyMax / 100) * multiplier).toFixed(4),
    ),
  };
}

// ─── Complete a mining session (server action) ────────────────────────────────
// FIX: Added idempotency check — if already completed, skip and return.
// FIX: Uses atomic update with .eq("mining_completed", false) guard.
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

  // Idempotency: if already completed, return success without double-crediting
  if (alloc.mining_completed)
    return {
      success: true,
      profit: alloc.final_profit ?? alloc.total_earned ?? 0,
    };

  const finalProfit = alloc.total_earned ?? 0;

  // Atomic update — only proceeds if mining_completed is still false
  const { error: updateErr, data: updated } = await supabase
    .from("node_allocations")
    .update({
      mining_completed: true,
      status: "matured",
      final_profit: finalProfit,
      updated_at: new Date().toISOString(),
    })
    .eq("id", allocationId)
    .eq("mining_completed", false) // Atomic guard
    .select();

  if (updateErr) return { success: false, error: updateErr.message };

  // If nothing was updated (race condition — another process already completed it), skip crediting
  if (!updated || updated.length === 0) {
    return { success: true, profit: finalProfit }; // Already handled by another process
  }

  // Credit capital + profit to user wallet (only if update succeeded)
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
      updated_at: new Date().toISOString(),
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

// ─── Assign rate to new allocation ───────────────────────────────────────────
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
