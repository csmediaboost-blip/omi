// app/api/admin/withdrawals/reject/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

async function isAdmin(supabase: SupabaseClient<any>): Promise<boolean> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return false;
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  return data?.role === "admin" || data?.role === "superadmin";
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Verify admin
    const cookieStore = await cookies();
    const anonClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    if (!(await isAdmin(anonClient))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // 2. Parse body
    const { withdrawal_id, reason } = await req.json().catch(() => ({}));
    if (!withdrawal_id) {
      return NextResponse.json({ error: "withdrawal_id is required." }, { status: 400 });
    }
    if (!reason?.trim()) {
      return NextResponse.json({ error: "Rejection reason is required." }, { status: 400 });
    }

    // 3. Service-role client
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // 4. Fetch withdrawal
    const { data: wd, error: fetchErr } = await admin
      .from("withdrawals")
      .select("id, status, amount, amount_gross, user_id, reference, payout_account_name, payout_bank_name")
      .eq("id", withdrawal_id)
      .single();

    if (fetchErr || !wd) {
      return NextResponse.json({ error: "Withdrawal not found." }, { status: 404 });
    }

    if (!["queued", "processing"].includes(wd.status)) {
      return NextResponse.json(
        { error: `Cannot reject withdrawal with status "${wd.status}".` },
        { status: 400 }
      );
    }

    // 5. Refund amount (use gross so fee is also returned)
    const refundAmount = Number(wd.amount_gross ?? wd.amount ?? 0);

    // 6. Get current balance safely (avoid .single() crash)
    const { data: balRows } = await admin
      .from("user_balances")
      .select("balance")
      .eq("user_id", wd.user_id)
      .limit(1);

    const currentBalance = Number(balRows?.[0]?.balance ?? 0);
    const newBalance = currentBalance + refundAmount;

    if (balRows && balRows.length > 0) {
      // Update existing balance row
      const { error: balUpdateErr } = await admin
        .from("user_balances")
        .update({ balance: newBalance })
        .eq("user_id", wd.user_id);

      if (balUpdateErr) {
        return NextResponse.json(
          { error: `Refund failed: ${balUpdateErr.message}` },
          { status: 500 }
        );
      }
    } else {
      // No balance row exists — create one
      const { error: insertErr } = await admin
        .from("user_balances")
        .insert({ user_id: wd.user_id, balance: refundAmount });

      if (insertErr) {
        return NextResponse.json(
          { error: `Refund failed: ${insertErr.message}` },
          { status: 500 }
        );
      }
    }

    // 7. Mark withdrawal as rejected
    await admin
      .from("withdrawals")
      .update({
        status: "rejected",
        failure_reason: reason.trim(),
        processing_notes: `Rejected by admin: ${reason.trim()}`,
      })
      .eq("id", withdrawal_id);

    // 8. Notify user with reason
    await admin.from("user_notifications").insert({
      user_id: wd.user_id,
      type: "withdrawal_rejected",
      title: "Withdrawal Rejected",
      message: `Your withdrawal of $${refundAmount.toFixed(2)} was rejected. Reason: ${reason.trim()}. Your balance has been refunded.`,
      is_read: false,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: `Withdrawal rejected. $${refundAmount.toFixed(2)} refunded to user.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[reject] unhandled:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}