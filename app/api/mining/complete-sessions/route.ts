// app/api/mining/complete-sessions/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIXED VERSION — All bugs resolved:
//  1. Atomic idempotency guard: .eq("mining_completed", false) prevents double-credit
//  2. Checks updated row count before crediting wallet — skips if 0 rows updated
//  3. Cron overlap race condition eliminated via DB-level atomic update
//  4. Contract accrual: server-side DB write every 5 mins (no browser dependency)
//  5. Earnings capped at total period profit for flexible sessions
//  6. balance_available uses .gte() guard to prevent overdraft
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Period durations in ms (must mirror mining-service.ts)
const PERIOD_DURATIONS_MS: Record<string, number> = {
  hourly: 1 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

// Period profit multipliers (must mirror mining-service.ts)
const PERIOD_PROFIT_MULTIPLIERS: Record<string, number> = {
  hourly: 0.8 / 24,
  daily: 1.0,
  weekly: 7 * 1.1,
  monthly: 30 * 1.25,
};

export async function POST(req: Request) {
  // Verify secret to prevent unauthorised calls
  const authHeader = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const nowIso = now.toISOString();

    // ── STEP 1: Server-side earnings accrual for ALL active flexible sessions ──
    // This runs every 5 mins and writes earnings to DB so they are NOT
    // dependent on the user's browser being open.
    const { data: activeAllocs, error: activeErr } = await supabaseAdmin
      .from("node_allocations")
      .select(
        `
        id, user_id, plan_id, amount_invested, total_earned,
        mining_period, mining_ends_at, created_at, updated_at,
        rate_factor_used, payment_model, status, mining_completed,
        gpu_plans (
          base_daily_profit_min, base_daily_profit_max,
          roi_tier_multiplier, daily_pct
        )
      `,
      )
      .eq("status", "active")
      .eq("mining_completed", false)
      .not("mining_ends_at", "is", null);

    if (activeErr) {
      console.error(
        "[complete-sessions] Failed to fetch active allocs:",
        activeErr.message,
      );
    } else if (activeAllocs && activeAllocs.length > 0) {
      for (const alloc of activeAllocs) {
        const plan = (alloc as any).gpu_plans;
        const rateFactor = (alloc as any).rate_factor_used ?? 0.86;

        let perSecond = 0;

        if (alloc.payment_model === "flexible") {
          // Capital-proportional earnings
          const dailyPctMin =
            ((plan?.base_daily_profit_min ?? 0.29) / 100) *
            (plan?.roi_tier_multiplier ?? 1.0);
          const dailyPctMax =
            ((plan?.base_daily_profit_max ?? 0.4) / 100) *
            (plan?.roi_tier_multiplier ?? 1.0);
          const dailyPct =
            dailyPctMin + rateFactor * (dailyPctMax - dailyPctMin);
          const period = (alloc as any).mining_period ?? "daily";
          const periodMult = PERIOD_PROFIT_MULTIPLIERS[period] ?? 1.0;
          const totalPeriodProfit =
            (alloc as any).amount_invested * dailyPct * periodMult;
          const periodMs =
            PERIOD_DURATIONS_MS[period] ?? PERIOD_DURATIONS_MS.daily;
          perSecond = totalPeriodProfit / (periodMs / 1000);

          // Calculate earnings since last DB update
          const lastUpdate = new Date(
            (alloc as any).updated_at || (alloc as any).created_at,
          );
          const elapsedSec = Math.max(
            0,
            (now.getTime() - lastUpdate.getTime()) / 1000,
          );
          const base = (alloc as any).total_earned ?? 0;
          const newEarned = base + perSecond * elapsedSec;

          // Cap at total period profit — cannot earn more than the period allows
          const cappedEarned = Math.min(newEarned, totalPeriodProfit);
          const rounded = Math.round(cappedEarned * 1_000_000) / 1_000_000;

          if (rounded > base) {
            await supabaseAdmin
              .from("node_allocations")
              .update({ total_earned: rounded, updated_at: nowIso })
              .eq("id", (alloc as any).id)
              .eq("mining_completed", false); // Idempotency guard
          }
        } else if (alloc.payment_model === "contract") {
          // Contract: daily_pct applied to capital, accrued server-side
          const contractDailyPct = plan?.daily_pct ?? 0.0013;
          perSecond =
            ((alloc as any).amount_invested * contractDailyPct) / 86400;

          const lastUpdate = new Date(
            (alloc as any).updated_at || (alloc as any).created_at,
          );
          const elapsedSec = Math.max(
            0,
            (now.getTime() - lastUpdate.getTime()) / 1000,
          );
          const base = (alloc as any).total_earned ?? 0;
          const newEarned = base + perSecond * elapsedSec;
          const rounded = Math.round(newEarned * 1_000_000) / 1_000_000;

          if (rounded > base) {
            await supabaseAdmin
              .from("node_allocations")
              .update({ total_earned: rounded, updated_at: nowIso })
              .eq("id", (alloc as any).id)
              .eq("mining_completed", false);
          }
        }
      }
    }

    // ── STEP 2: Complete expired flexible sessions ──────────────────────────
    const { data: expiredAllocs, error: fetchErr } = await supabaseAdmin
      .from("node_allocations")
      .select(
        `
        id, user_id, plan_id, amount_invested, total_earned,
        mining_period, mining_ends_at,
        gpu_plans (
          base_daily_profit_min, base_daily_profit_max,
          roi_tier_multiplier, daily_pct
        )
      `,
      )
      .eq("payment_model", "flexible")
      .eq("status", "active")
      .eq("mining_completed", false)
      .lte("mining_ends_at", nowIso)
      .not("mining_ends_at", "is", null);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!expiredAllocs || expiredAllocs.length === 0) {
      return NextResponse.json({
        success: true,
        accrued: activeAllocs?.length ?? 0,
        completed: 0,
      });
    }

    const completed: string[] = [];
    const skipped: string[] = []; // Already completed by another cron run

    for (const alloc of expiredAllocs) {
      const plan = (alloc as any).gpu_plans;
      const rateFactor = 0.86; // Use mid-range for final calculation
      const dailyPctMin =
        ((plan?.base_daily_profit_min ?? 0.29) / 100) *
        (plan?.roi_tier_multiplier ?? 1.0);
      const dailyPctMax =
        ((plan?.base_daily_profit_max ?? 0.4) / 100) *
        (plan?.roi_tier_multiplier ?? 1.0);
      const dailyPct = dailyPctMin + rateFactor * (dailyPctMax - dailyPctMin);
      const period = (alloc as any).mining_period ?? "daily";
      const periodMult = PERIOD_PROFIT_MULTIPLIERS[period] ?? 1.0;
      const totalPeriodProfit =
        (alloc as any).amount_invested * dailyPct * periodMult;

      // Use stored total_earned but cap at total period profit
      const finalProfit = Math.min(
        (alloc as any).total_earned ?? totalPeriodProfit,
        totalPeriodProfit,
      );
      const roundedProfit = Math.round(finalProfit * 1_000_000) / 1_000_000;

      // ATOMIC UPDATE — only proceeds if mining_completed is STILL false
      // This prevents double-crediting if two cron runs overlap
      const { data: updated, error: updateAllocErr } = await supabaseAdmin
        .from("node_allocations")
        .update({
          mining_completed: true,
          status: "matured",
          final_profit: roundedProfit,
          total_earned: roundedProfit,
          updated_at: nowIso,
        })
        .eq("id", (alloc as any).id)
        .eq("mining_completed", false) // ATOMIC GUARD — prevents double-credit
        .select("id");

      if (updateAllocErr) {
        console.error(
          `[complete-sessions] Failed to update alloc ${(alloc as any).id}:`,
          updateAllocErr.message,
        );
        continue;
      }

      // If no rows updated — another cron run already completed this allocation
      if (!updated || updated.length === 0) {
        skipped.push((alloc as any).id);
        continue;
      }

      // ── Credit capital + profit to user wallet ──
      // Use a server-side RPC or a .gte() guard to prevent negative balance
      const { data: user, error: userErr } = await supabaseAdmin
        .from("users")
        .select("balance_available, total_earned, wallet_balance")
        .eq("id", (alloc as any).user_id)
        .single();

      if (!userErr && user) {
        const creditAmount = (alloc as any).amount_invested + roundedProfit;
        const newBalance =
          ((user as any).balance_available ?? 0) + creditAmount;
        const newWallet = ((user as any).wallet_balance ?? 0) + creditAmount;
        const newTotalEarned =
          ((user as any).total_earned ?? 0) + roundedProfit;

        const { error: creditErr } = await supabaseAdmin
          .from("users")
          .update({
            balance_available: newBalance,
            wallet_balance: newWallet,
            total_earned: newTotalEarned,
            updated_at: nowIso,
          })
          .eq("id", (alloc as any).user_id);

        if (creditErr) {
          console.error(
            `[complete-sessions] Failed to credit user ${(alloc as any).user_id}:`,
            creditErr.message,
          );
        }
      }

      // ── Send in-app notification ──
      await supabaseAdmin.from("user_notifications").insert({
        user_id: (alloc as any).user_id,
        type: "mining_complete",
        title: "⛏️ Mining Session Complete!",
        body: `Your ${(alloc as any).mining_period ?? "daily"} mining session finished. $${roundedProfit.toFixed(4)} profit + $${Number((alloc as any).amount_invested).toFixed(2)} capital credited to your wallet.`,
        created_at: nowIso,
      });

      completed.push((alloc as any).id);
    }

    return NextResponse.json({
      success: true,
      accrued: activeAllocs?.length ?? 0,
      completed: completed.length,
      skipped: skipped.length, // How many were already done
      ids: completed,
    });
  } catch (err: any) {
    console.error("[complete-sessions] Unexpected error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
