// app/api/mining/claim-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const PERIOD_MULT: Record<string, number> = {
  hourly: 0.8 / 24,
  daily: 1.0,
  weekly: 7 * 1.1,
  monthly: 30 * 1.25,
};

export async function POST(req: NextRequest) {
  try {
    // ── Authenticate via Supabase session cookie ──────────────────────────────
    // Next.js 15: cookies() is async — must be awaited
    const cookieStore = await cookies();

    const userSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      },
    );

    const {
      data: { user },
      error: authErr,
    } = await userSupabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json(
        { error: "Unauthorized — please sign in" },
        { status: 401 },
      );
    }

    const userId = user.id;
    const supabase = getAdminSupabase();
    const nowIso = new Date().toISOString();

    // ── Find expired-but-unclaimed flexible sessions for this user ────────────
    const { data: expired, error: queryErr } = await supabase
      .from("node_allocations")
      .select(
        `
        id, user_id, plan_id, amount_invested, total_earned,
        mining_period, mining_ends_at, rate_factor_used, mining_completed,
        payment_model, status,
        gpu_plans ( base_daily_profit_min, base_daily_profit_max, roi_tier_multiplier )
      `,
      )
      .eq("user_id", userId)
      .eq("payment_model", "flexible")
      .eq("mining_completed", false)
      .eq("status", "active")
      .not("mining_ends_at", "is", null)
      .lte("mining_ends_at", nowIso);

    if (queryErr) {
      console.error("[claim-session] Query error:", queryErr.message);
      return NextResponse.json({ error: queryErr.message }, { status: 500 });
    }

    if (!expired || expired.length === 0) {
      return NextResponse.json({
        success: true,
        completed: 0,
        message: "No expired sessions found",
      });
    }

    let completed = 0;
    let totalCredited = 0;

    for (const alloc of expired) {
      const plan = (alloc as any).gpu_plans;
      const rf = (alloc as any).rate_factor_used ?? 0.86;

      const rawMin =
        ((plan?.base_daily_profit_min ?? 0.29) / 100) *
        (plan?.roi_tier_multiplier ?? 1.0);
      const rawMax =
        ((plan?.base_daily_profit_max ?? 0.4) / 100) *
        (plan?.roi_tier_multiplier ?? 1.0);
      const dailyDec = rawMin + rf * (rawMax - rawMin);
      const period = (alloc as any).mining_period ?? "daily";
      const mult = PERIOD_MULT[period] ?? 1.0;
      const maxProfit = (alloc as any).amount_invested * dailyDec * mult;

      const finalProfit = Math.min(
        Math.max((alloc as any).total_earned ?? 0, maxProfit * 0.72),
        maxProfit,
      );
      const rounded = Math.round(finalProfit * 1_000_000) / 1_000_000;

      // ATOMIC UPDATE — .eq("mining_completed", false) prevents double-credit
      const { data: updated, error: updateErr } = await supabase
        .from("node_allocations")
        .update({
          mining_completed: true,
          status: "matured",
          final_profit: rounded,
          total_earned: rounded,
          updated_at: nowIso,
        })
        .eq("id", (alloc as any).id)
        .eq("mining_completed", false)
        .select("id");

      if (updateErr) {
        console.error(
          "[claim-session] Update error:",
          (alloc as any).id,
          updateErr.message,
        );
        continue;
      }
      if (!updated || updated.length === 0) continue; // Already claimed

      const credit = (alloc as any).amount_invested + rounded;

      // Try RPC first, fall back to direct update
      const { error: walletErr } = await supabase.rpc(
        "increment_user_balance",
        {
          p_user_id: userId,
          p_amount: credit,
          p_earned: rounded,
        },
      );

      if (walletErr) {
        // RPC not found — fall back to direct balance update
        const { data: u } = await supabase
          .from("users")
          .select("balance_available, wallet_balance, total_earned")
          .eq("id", userId)
          .single();

        const { error: directErr } = await supabase
          .from("users")
          .update({
            balance_available: Math.max(
              0,
              ((u as any)?.balance_available ?? 0) + credit,
            ),
            wallet_balance: Math.max(
              0,
              ((u as any)?.wallet_balance ?? 0) + credit,
            ),
            total_earned: ((u as any)?.total_earned ?? 0) + rounded,
            updated_at: nowIso,
          })
          .eq("id", userId);

        if (directErr) {
          console.error(
            "[claim-session] Wallet update error:",
            directErr.message,
          );
          // Rollback so user can retry
          await supabase
            .from("node_allocations")
            .update({
              mining_completed: false,
              status: "active",
              updated_at: nowIso,
            })
            .eq("id", (alloc as any).id);
          continue;
        }
      }

      // Ledger entry (non-blocking — failure doesn't abort the claim)
      const { error: ledgerErr } = await supabase
        .from("transaction_ledger")
        .insert({
          user_id: userId,
          type: "mining_payout",
          amount: credit,
          description: `Mining session complete — ${period} session. $${rounded.toFixed(4)} profit + $${Number((alloc as any).amount_invested).toFixed(2)} capital returned.`,
          reference_id: (alloc as any).id,
          created_at: nowIso,
        });
      if (ledgerErr) {
        console.error("[claim-session] Ledger insert error:", ledgerErr.code);
      }

      // In-app notification (non-blocking)
      const { error: notifErr } = await supabase
        .from("user_notifications")
        .insert({
          user_id: userId,
          type: "mining_complete",
          title: "⛏️ Mining Payout Received!",
          body: `Your ${period} session finished. $${rounded.toFixed(4)} profit + $${Number((alloc as any).amount_invested).toFixed(2)} capital — $${credit.toFixed(2)} total credited to your wallet.`,
          created_at: nowIso,
        });
      if (notifErr) {
        console.error(
          "[claim-session] Notification insert error:",
          notifErr.code,
        );
      }

      completed++;
      totalCredited += credit;
      console.log(
        "[claim-session] Completed:",
        (alloc as any).id,
        "credit:",
        credit,
      );
    }

    return NextResponse.json({
      success: true,
      completed,
      totalCredited: Math.round(totalCredited * 100) / 100,
      message:
        completed > 0
          ? `${completed} session${completed > 1 ? "s" : ""} completed. $${totalCredited.toFixed(2)} credited to your wallet.`
          : "No sessions needed claiming",
    });
  } catch (err: any) {
    console.error("[claim-session] Unhandled error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
