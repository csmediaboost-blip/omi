// app/api/admin/withdrawals/reject/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { withdrawal_id, reason } = await req.json();
    if (!withdrawal_id) return NextResponse.json({ error: "withdrawal_id required" }, { status: 400 });
    if (!reason?.trim()) return NextResponse.json({ error: "reason required" }, { status: 400 });

    // Fetch withdrawal
    const { data: wd, error: wdErr } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("id", withdrawal_id)
      .single();

    if (wdErr || !wd) return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
    if (!["queued", "processing"].includes(wd.status)) {
      return NextResponse.json({ error: `Cannot reject withdrawal with status: ${wd.status}` }, { status: 400 });
    }

    // Refund user balance
    const refundAmount = wd.amount_gross ?? wd.amount;
    const { error: refundErr } = await supabase.rpc("adjust_user_balance", {
  p_user_id: wd.user_id,
  p_amount: refundAmount,
  p_type: "withdrawal_refund",
  p_description: `Withdrawal rejected: ${reason}`,
  p_reference: wd.reference ?? withdrawal_id,
});

if (refundErr) {
  // Fallback: direct balance update
  const { data: bal } = await supabase
    .from("user_balances")
    .select("balance")
    .eq("user_id", wd.user_id)
    .single();

  const { error: balErr } = await supabase
    .from("user_balances")
    .update({ balance: (bal?.balance ?? 0) + refundAmount })
    .eq("user_id", wd.user_id);

  if (balErr) {
    return NextResponse.json({ error: `Refund failed: ${balErr.message}` }, { status: 500 });
  }
}

    if (refundErr) {
      console.error("[reject] refund failed:", refundErr.message);
      return NextResponse.json({ error: `Refund failed: ${refundErr.message}` }, { status: 500 });
    }

    // Mark rejected
    await supabase.from("withdrawals").update({
      status: "rejected",
      failure_reason: reason,
      processing_notes: `Rejected by admin: ${reason}`,
    }).eq("id", withdrawal_id);

    // Notify user
    await supabase.from("user_notifications").insert({
      user_id: wd.user_id,
      type: "withdrawal_rejected",
      title: "Withdrawal Rejected",
      message: `Your withdrawal of $${refundAmount.toFixed(2)} was rejected. Reason: ${reason}. Your balance has been refunded.`,
      is_read: false,
    }).select().maybeSingle();

    return NextResponse.json({ message: "Withdrawal rejected and balance refunded." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}