// app/api/admin/withdrawals/mark-paid/route.ts
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
    const cookieStore = await cookies();
    const anonClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    if (!(await isAdmin(anonClient))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const { withdrawal_id, korapay_reference } = await req.json().catch(() => ({}));
    if (!withdrawal_id) {
      return NextResponse.json({ error: "withdrawal_id is required." }, { status: 400 });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // Fetch withdrawal
    const { data: wd, error: fetchErr } = await admin
      .from("withdrawals")
      .select("id, status, amount, user_id, payout_account_name, payout_bank_name")
      .eq("id", withdrawal_id)
      .single();

    if (fetchErr || !wd) {
      return NextResponse.json({ error: "Withdrawal not found." }, { status: 404 });
    }

    if (wd.status === "paid") {
      return NextResponse.json({ error: "Withdrawal is already marked as paid." }, { status: 400 });
    }

    // Mark as paid
    await admin
      .from("withdrawals")
      .update({
        status: "paid",
        tracking_status: "paid",
        gateway_reference: korapay_reference ?? null,
        paid_at: new Date().toISOString(),
        processing_notes: `Manually marked paid by admin${korapay_reference ? `. KoraPay ref: ${korapay_reference}` : ""}`,
      })
      .eq("id", withdrawal_id);

    // Notify user
    await admin.from("user_notifications").insert({
      user_id: wd.user_id,
      type: "withdrawal_paid",
      title: "Withdrawal Processed",
      message: `Your withdrawal of $${Number(wd.amount).toFixed(2)} has been sent to ${wd.payout_account_name} (${wd.payout_bank_name}).`,
      is_read: false,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: `Withdrawal marked as paid successfully.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}