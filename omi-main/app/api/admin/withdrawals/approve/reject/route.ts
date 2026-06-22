import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const anonClient = createServerClient(
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
  } = await anonClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();

  const { data: adminProfile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (adminProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { withdrawal_id?: string | number; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.withdrawal_id) {
    return NextResponse.json(
      { error: "withdrawal_id required" },
      { status: 400 },
    );
  }

  // Load withdrawal to get amount for refund
  const { data: wd } = await supabase
    .from("withdrawals")
    .select("id, user_id, amount, amount_gross, status")
    .eq("id", body.withdrawal_id)
    .single();

  if (!wd) {
    return NextResponse.json(
      { error: "Withdrawal not found" },
      { status: 404 },
    );
  }

  if (!["queued", "flagged", "processing"].includes(wd.status)) {
    return NextResponse.json(
      { error: `Cannot reject a withdrawal with status "${wd.status}".` },
      { status: 409 },
    );
  }

  const reason = body.reason ?? "Rejected by admin";

  // Refund balance atomically
  const refundAmount = wd.amount_gross ?? wd.amount;
  const { error: refundErr } = await supabase.rpc("atomic_refund_balance", {
    p_user_id: wd.user_id,
    p_amount: refundAmount,
  });

  if (refundErr) {
    console.error("[reject] Refund RPC failed:", refundErr);
    // Still reject, but log the failure — manual refund needed
  }

  await supabase
    .from("withdrawals")
    .update({
      status: "rejected",
      tracking_status: "rejected",
      failure_reason: reason,
      rejected_by: user.id,
      rejected_at: new Date().toISOString(),
    })
    .eq("id", wd.id);

  // Ledger entry
  await supabase.from("transaction_ledger").insert({
    user_id: wd.user_id,
    type: "withdrawal_refund",
    amount: refundAmount,
    description: `Withdrawal #${wd.id} rejected — ${reason}. Balance refunded.`,
    reference_id: String(wd.id),
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({
    success: true,
    withdrawal_id: wd.id,
    refunded: !refundErr,
    message: `Withdrawal #${wd.id} rejected and $${refundAmount} refunded to user.`,
  });
}
