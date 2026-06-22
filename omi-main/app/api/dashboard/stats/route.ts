// app/api/dashboard/stats/route.ts
// SECURITY FIX: Was accepting userId from query param with service role —
// any user could read any other user's data (IDOR). Now uses session userId only.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  try {
    // ── Verify session — userId comes from the token, NOT the query param ──
    const cookieStore = await cookies();
    const userSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      },
    );

    const {
      data: { user },
      error: authErr,
    } = await userSupabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id; // Always from session — never from query string
    const db = getDb();

    const { data: profile, error } = await db
      .from("users")
      .select(
        "id, email, full_name, tier, earnings, balance_available, balance_pending, " +
          "balance_locked, total_earned, total_withdrawn, referral_earnings, " +
          "total_task_completed, approved_count, rejected_count, quality_score, " +
          "node_expiry_date, node_activated_at, kyc_verified, payout_registered",
      )
      .eq("id", userId)
      .single();

    if (error) {
      console.error("[dashboard/stats] Profile fetch error:", error.code);
      return NextResponse.json({
        user: {
          id: userId,
          tier: "observer",
          earnings: 0,
          referral_earnings: 0,
          total_task_completed: 0,
        },
        network: { referrals: 0, totalCommissions: 0 },
      });
    }

    const { count: referralCount } = await db
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", userId);

    const { data: commissions } = await db
      .from("referral_commissions")
      .select("amount")
      .eq("referrer_id", userId)
      .eq("status", "paid");

    const totalCommissions = (commissions || []).reduce(
      (sum: number, c: any) => sum + (Number(c.amount) || 0),
      0,
    );

    return NextResponse.json({
      user: profile,
      network: { referrals: referralCount || 0, totalCommissions },
    });
  } catch (err: any) {
    console.error("[dashboard/stats] Fatal:", err.code || "unknown");
    return NextResponse.json({
      user: {
        tier: "observer",
        earnings: 0,
        referral_earnings: 0,
        total_task_completed: 0,
      },
      network: { referrals: 0, totalCommissions: 0 },
    });
  }
}
