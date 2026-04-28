import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/api-security";

export const dynamic = "force-dynamic";

const getDb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

export async function GET(req: NextRequest) {
  try {
    // SECURITY: Verify user authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { userId: authenticatedUserId } = authResult;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // SECURITY: Users can only view their own stats
    if (userId !== authenticatedUserId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot view another user's stats" },
        { status: 403 }
      );
    }

    const db = getDb();

    // Fetch user profile with all earnings fields
    const { data: user, error } = await db
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
      console.error("Dashboard stats error:", error.message);
      // Return safe defaults instead of crashing — dashboard still works
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

    // Fetch referral count
    const { count: referralCount } = await db
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", userId);

    // Fetch referral commissions total
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
      user,
      network: {
        referrals: referralCount || 0,
        totalCommissions: totalCommissions,
      },
    });
  } catch (err: any) {
    console.error("Dashboard stats fatal:", err.message);
    // Always return something so dashboard doesn't break
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
