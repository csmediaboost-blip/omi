// app/api/mining/rotate-rates/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Rotates mining rate snapshots for all active GPU plans.
// Called by Supabase pg_cron OR Vercel Cron (vercel.json):
//   { "crons": [{ "path": "/api/mining/rotate-rates", "schedule": "0 * * * *" }] }
//
// Logic:
//   - Counts active investors per plan
//   - More investors → rate biased toward lower end of range (fair to all)
//   - Fewer investors → rate can go higher
//   - Rate never repeats consecutively (shifts by at least 0.04)
//   - Rate factor is INTERNAL ONLY — users only ever see $ earned
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service-role key so this bypasses RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const MIN_FACTOR = 0.72; // Closest to $0.29 daily (72% of max range)
const MAX_FACTOR = 1.0; // Full $0.40 daily
const MANY_INVESTORS = 50; // Threshold: many miners = lower rate
const FEW_INVESTORS = 10; // Threshold: few miners = higher rate

// Periods and their validity windows
const PERIOD_WINDOWS = [
  { period: "hourly", validHours: 1 },
  { period: "daily", validHours: 24 },
  { period: "weekly", validHours: 24 * 7 },
  { period: "monthly", validHours: 24 * 30 },
];

function pickRateFactor(
  investorCount: number,
  previousFactor: number | null,
): number {
  let lo: number, hi: number;

  if (investorCount >= MANY_INVESTORS) {
    // Many miners: bias toward lower 60% of range
    lo = MIN_FACTOR;
    hi = MIN_FACTOR + (MAX_FACTOR - MIN_FACTOR) * 0.6;
  } else if (investorCount <= FEW_INVESTORS) {
    // Few miners: bias toward upper 60% of range
    lo = MIN_FACTOR + (MAX_FACTOR - MIN_FACTOR) * 0.4;
    hi = MAX_FACTOR;
  } else {
    // Mid range: full random
    lo = MIN_FACTOR;
    hi = MAX_FACTOR;
  }

  let factor = lo + Math.random() * (hi - lo);

  // Anti-repeat: must differ from previous by at least 0.04
  if (previousFactor !== null && Math.abs(factor - previousFactor) < 0.04) {
    const shift = 0.05;
    factor = factor + shift > hi ? factor - shift : factor + shift;
  }

  // Clamp and round to 4dp
  return (
    Math.round(Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, factor)) * 10000) /
    10000
  );
}

export async function POST(req: Request) {
  // Verify secret to prevent unauthorised calls
  const authHeader = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch all active plans
    const { data: plans, error: plansErr } = await supabaseAdmin
      .from("gpu_plans")
      .select(
        "id, base_daily_profit_min, base_daily_profit_max, roi_tier_multiplier",
      )
      .eq("is_active", true);

    if (plansErr || !plans) {
      return NextResponse.json(
        { error: "Failed to fetch plans" },
        { status: 500 },
      );
    }

    const now = new Date();
    const results: string[] = [];

    for (const plan of plans) {
      // Count active flexible miners for this plan
      const { count: investorCount } = await supabaseAdmin
        .from("node_allocations")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", plan.id)
        .eq("status", "active")
        .eq("payment_model", "flexible")
        .eq("mining_completed", false);

      const activeMiners = investorCount ?? 0;

      for (const { period, validHours } of PERIOD_WINDOWS) {
        // Get previous rate for anti-repeat check
        const { data: prev } = await supabaseAdmin
          .from("mining_rate_snapshots")
          .select("rate_factor")
          .eq("plan_id", plan.id)
          .eq("period", period)
          .order("valid_from", { ascending: false })
          .limit(1)
          .single();

        const prevFactor = prev?.rate_factor ?? null;
        const rateFactor = pickRateFactor(activeMiners, prevFactor);

        const validUntil = new Date(
          now.getTime() + validHours * 60 * 60 * 1000,
        );

        const { error: insertErr } = await supabaseAdmin
          .from("mining_rate_snapshots")
          .insert({
            plan_id: plan.id,
            period,
            rate_factor: rateFactor,
            daily_profit_min:
              plan.base_daily_profit_min * plan.roi_tier_multiplier,
            daily_profit_max:
              plan.base_daily_profit_max * plan.roi_tier_multiplier,
            investor_count: activeMiners,
            valid_from: now.toISOString(),
            valid_until: validUntil.toISOString(),
          });

        if (insertErr) {
          console.error(
            `[rotate-rates] Insert failed for ${plan.id}/${period}:`,
            insertErr.message,
          );
        } else {
          results.push(
            `${plan.id}/${period}: factor=${rateFactor}, miners=${activeMiners}`,
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      rotated: results.length,
      results,
    });
  } catch (err: any) {
    console.error("[rotate-rates] Unexpected error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Allow GET for manual trigger during development
export async function GET(req: Request) {
  return POST(req);
}
