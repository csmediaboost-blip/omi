import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    let query = supabaseAdmin
      .from("withdrawals")
      .select(
        `id, user_id, amount, amount_gross, amount_fee, amount_net,
         wallet_address, payout_method, payout_account_name, payout_bank_name,
         payout_currency, status, tracking_status, gateway_reference,
         auto_processed, reference, created_at, paid_at, flagged, fraud_flag`
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (status) query = query.eq("status", status);

    const { data: wds, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!wds?.length) {
      return NextResponse.json({ withdrawals: [] });
    }

    const userIds = [...new Set(wds.map((w: any) => w.user_id))];
    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, email, full_name")
      .in("id", userIds);

    const userMap: Record<string, { email: string; full_name: string }> = {};
    (users ?? []).forEach((u: any) => {
      userMap[u.id] = { email: u.email, full_name: u.full_name };
    });

    const withdrawals = wds.map((w: any) => ({
      ...w,
      user_email: userMap[w.user_id]?.email ?? "-",
      user_full_name: userMap[w.user_id]?.full_name ?? "-",
    }));

    return NextResponse.json({ withdrawals });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}