// app/api/financials/route.ts
import { createSupabaseServer } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: txs }, { data: license }, { data: profile }] =
    await Promise.all([
      supabase.rpc("get_transaction_history", {
        p_user_id: user.id,
        p_limit: 100,
        p_offset: 0,
      }),
      supabase
        .from("operator_licenses")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("users")
        .select(
          "tier, balance_available, balance_pending, total_earned, has_operator_license, license_expires_at",
        )
        .eq("id", user.id)
        .single(),
    ]);

  return NextResponse.json({
    transactions: txs || [],
    license: license || null,
    profile,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.action === "buy_license" || body.action === "renew_license") {
    const { data, error } = await supabase.rpc("purchase_operator_license", {
      p_user_id: user.id,
      p_is_renewal: body.action === "renew_license",
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    const r = data as any;
    if (!r.success)
      return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
