// app/api/mining/complete-sessions/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Checks for flexible mining sessions whose period has ended.
// When expired:
//   1. Marks allocation as mining_completed = true, status = 'matured'
//   2. Credits capital + final profit to user's balance_available
//   3. Sends in-app notification to user
//
// Set up as Vercel Cron:
//   { "crons": [{ "path": "/api/mining/complete-sessions", "schedule": "*/5 * * * *" }] }
// Or Supabase pg_cron:
//   SELECT cron.schedule('complete-mining', '*/5 * * * *', 'SELECT complete_expired_mining()');
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date().toISOString();

    // Find all flexible allocations whose mining window has expired but not yet completed
    const { data: expiredAllocs, error: fetchErr } = await supabaseAdmin
      .from("node_allocations")
      .select(
        "id, user_id, plan_id, amount_invested, total_earned, mining_period, mining_ends_at",
      )
      .eq("payment_model", "flexible")
      .eq("status", "active")
      .eq("mining_completed", false)
      .lte("mining_ends_at", now)
      .not("mining_ends_at", "is", null);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!expiredAllocs || expiredAllocs.length === 0) {
      return NextResponse.json({ success: true, completed: 0 });
    }

    const completed: string[] = [];

    for (const alloc of expiredAllocs) {
      const finalProfit = alloc.total_earned ?? 0;

      // 1. Mark allocation complete
      const { error: updateAllocErr } = await supabaseAdmin
        .from("node_allocations")
        .update({
          mining_completed: true,
          status: "matured",
          final_profit: finalProfit,
          updated_at: now,
        })
        .eq("id", alloc.id);

      if (updateAllocErr) {
        console.error(
          `[complete-sessions] Failed to update alloc ${alloc.id}:`,
          updateAllocErr.message,
        );
        continue;
      }

      // 2. Credit capital + profit to user wallet
      const { data: user, error: userErr } = await supabaseAdmin
        .from("users")
        .select("balance_available, total_earned")
        .eq("id", alloc.user_id)
        .single();

      if (!userErr && user) {
        const newBalance =
          (user.balance_available ?? 0) + alloc.amount_invested + finalProfit;
        const newTotalEarned = (user.total_earned ?? 0) + finalProfit;

        await supabaseAdmin
          .from("users")
          .update({
            balance_available: newBalance,
            total_earned: newTotalEarned,
            updated_at: now,
          })
          .eq("id", alloc.user_id);
      }

      // 3. Send in-app notification
      await supabaseAdmin.from("user_notifications").insert({
        user_id: alloc.user_id,
        type: "mining_complete",
        title: "⛏️ Mining Session Complete!",
        body: `Your ${alloc.mining_period ?? "daily"} mining session has finished. $${finalProfit.toFixed(4)} profit + $${Number(alloc.amount_invested).toFixed(2)} capital have been credited to your wallet. Withdraw or start a new session anytime.`,
        created_at: now,
      });

      completed.push(alloc.id);
    }

    return NextResponse.json({
      success: true,
      completed: completed.length,
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
