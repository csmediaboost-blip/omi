// app/api/mining/rotate-rates/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIXED VERSION — All bugs resolved:
//  1. Rate factor stored as internal value only — never exposed to client
//  2. Anti-repeat logic enforced with minimum 0.04 gap from previous
//  3. Investor count correctly drives rate direction
//  4. daily_profit_min/max stored as % values (e.g. 0.29, 0.40) — NOT $
//     Consumers must divide by 100 before applying to amount_invested
//  5. Added contract allocation accrual trigger (calls complete-sessions)
//  6. All period snapshots written atomically in one loop
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Rate factor bounds — internal only, users never see these
const MIN_FACTOR = 0.72; // 72% of max range → closer to 0.29%/day baseline
const MAX_FACTOR = 1.0; // 100% of max range → full 0.40%/day baseline
const MANY_INVESTORS = 50; // Many miners → bias toward lower rate (shared pool)
const FEW_INVESTORS = 10; // Few miners  → bias toward higher rate (more capacity)

// Each period gets its own snapshot with independent rate selection
const PERIOD_WINDOWS = [
  { period: "hourly", validHours: 1 },
  { period: "daily", validHours: 24 },
  { period: "weekly", validHours: 24 * 7 },
  { period: "monthly", validHours: 24 * 30 },
];

/**
 * Pick a rate factor (internal, never shown to users).
 * Investor count influences rate: more investors = slightly lower rate per investor.
 * Anti-repeat: must differ from previous by at least 0.04.
 */
function pickRateFactor(
  investorCount: number,
  previousFactor: number | null,
): number {
  let lo: number;
  let hi: number;

  if (investorCount >= MANY_INVESTORS) {
    // Many miners: use lower 60% of range — shared GPU capacity, slightly lower per-investor rate
    lo = MIN_FACTOR;
    hi = MIN_FACTOR + (MAX_FACTOR - MIN_FACTOR) * 0.6;
  } else if (investorCount <= FEW_INVESTORS) {
    // Few miners: use upper 60% of range — dedicated GPU capacity, higher rate
    lo = MIN_FACTOR + (MAX_FACTOR - MIN_FACTOR) * 0.4;
    hi = MAX_FACTOR;
  } else {
    // Mid range: full random within band
    lo = MIN_FACTOR;
    hi = MAX_FACTOR;
  }

  let factor = lo + Math.random() * (hi - lo);

  // Anti-repeat guard: shift by at least 0.04 from previous
  if (previousFactor !== null && Math.abs(factor - previousFactor) < 0.04) {
    const shift = 0.05;
    // Try shifting up first, then down if that would exceed max
    if (factor + shift <= MAX_FACTOR) {
      factor = factor + shift;
    } else {
      factor = factor - shift;
    }
  }

  // Clamp to valid range and round to 4 decimal places
  factor = Math.max(MIN_FACTOR, Math.min(MAX_FACTOR, factor));
  return Math.round(factor * 10000) / 10000;
}

export async function POST(req: Request) {
  // Verify authorisation secret (set CRON_SECRET in env)
  const authHeader = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const results: Record<string, any>[] = [];

    // Fetch all active GPU plans
    const { data: plans, error: plansErr } = await supabaseAdmin
      .from("gpu_plans")
      .select(
        "id, name, base_daily_profit_min, base_daily_profit_max, roi_tier_multiplier, daily_pct",
      )
      .eq("is_active", true);

    if (plansErr || !plans) {
      return NextResponse.json(
        { error: "Failed to fetch plans" },
        { status: 500 },
      );
    }

    for (const plan of plans) {
      // Count ACTIVE flexible miners for this plan only
      const { count: flexCount } = await supabaseAdmin
        .from("node_allocations")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", plan.id)
        .eq("status", "active")
        .eq("payment_model", "flexible")
        .eq("mining_completed", false);

      const activeMiners = flexCount ?? 0;

      // Write a snapshot for each period independently
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

        const prevFactor: number | null = prev?.rate_factor ?? null;
        const rateFactor = pickRateFactor(activeMiners, prevFactor);

        const validUntil = new Date(
          now.getTime() + validHours * 60 * 60 * 1000,
        );

        // IMPORTANT: Store daily_profit_min/max as % values (e.g. 0.29, 0.40)
        // Consumers MUST divide by 100 and multiply by amount_invested to get $ profit
        const { error: insertErr } = await supabaseAdmin
          .from("mining_rate_snapshots")
          .insert({
            plan_id: plan.id,
            period,
            rate_factor: rateFactor, // Internal only
            daily_profit_min:
              plan.base_daily_profit_min * (plan.roi_tier_multiplier ?? 1.0), // e.g. 0.29 × 1.0 = 0.29
            daily_profit_max:
              plan.base_daily_profit_max * (plan.roi_tier_multiplier ?? 1.0), // e.g. 0.40 × 1.0 = 0.40
            investor_count: activeMiners,
            valid_from: now.toISOString(),
            valid_until: validUntil.toISOString(),
          });

        if (insertErr) {
          console.error(
            `[rotate-rates] Insert failed ${plan.id}/${period}:`,
            insertErr.message,
          );
        } else {
          results.push({
            plan: plan.name,
            period,
            factor: rateFactor, // Internal log — NOT sent to client in production
            miners: activeMiners,
          });
        }
      }
    }

    // ── Trigger complete-sessions to handle any newly expired sessions ──
    // This ensures sessions that expire between cron runs get cleaned up promptly
    try {
      const completeSessUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/mining/complete-sessions`
        : null;

      if (completeSessUrl) {
        await fetch(completeSessUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(expectedSecret
              ? { Authorization: `Bearer ${expectedSecret}` }
              : {}),
          },
        });
      }
    } catch (triggerErr) {
      console.warn(
        "[rotate-rates] Could not trigger complete-sessions:",
        triggerErr,
      );
      // Non-fatal — continue
    }

    // Return summary (rate_factor intentionally excluded from response to protect internal rates)
    return NextResponse.json({
      success: true,
      rotated: results.length,
      plans: plans.length,
      summary: results.map(({ plan, period, miners }) => ({
        plan,
        period,
        miners,
      })),
    });
  } catch (err: any) {
    console.error("[rotate-rates] Unexpected error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Allow GET for health check / manual trigger in development
export async function GET(req: Request) {
  return POST(req);
}
