// app/api/admin/withdrawals/approve/route.ts
// Marks a queued/processing withdrawal as paid.
// Uses SERVICE ROLE key — bypasses RLS, never bounces to sign-in.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// ─── ADMIN AUTH CHECK ─────────────────────────────────────────────────────────
async function isAdmin(supabase: any): Promise<boolean> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return false;

  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  return data?.role === "admin" || data?.role === "superadmin";
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Verify caller is an admin (anon client, reads session cookie) ──────
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

    if (!(await isAdmin(anonClient))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // ── 2. Parse body ─────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { withdrawal_id, gateway_reference } = body;

    if (!withdrawal_id) {
      return NextResponse.json(
        { error: "withdrawal_id is required." },
        { status: 400 },
      );
    }

    // ── 3. Service-role client — bypasses RLS for all writes ──────────────────
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    // ── 4. Fetch withdrawal ───────────────────────────────────────────────────
    const { data: wd, error: fetchErr } = await admin
      .from("withdrawals")
      .select("id, status, amount, user_id, reference")
      .eq("id", withdrawal_id)
      .single();

    if (fetchErr || !wd) {
      return NextResponse.json(
        { error: "Withdrawal not found." },
        { status: 404 },
      );
    }

    if (!["queued", "processing"].includes(wd.status)) {
      return NextResponse.json(
        { error: `Cannot approve a withdrawal with status "${wd.status}".` },
        { status: 400 },
      );
    }

    // ── 5. Update to paid ──────────────────────────────────────────────────────
    const { error: updateErr } = await admin
      .from("withdrawals")
      .update({
        status: "paid",
        tracking_status: "paid",
        gateway_reference: gateway_reference ?? wd.reference,
        updated_at: new Date().toISOString(),
      })
      .eq("id", withdrawal_id);

    if (updateErr) {
      console.error("[admin/approve] update error:", updateErr.message);
      return NextResponse.json(
        { error: "Failed to update withdrawal." },
        { status: 500 },
      );
    }

    // ── 6. Ledger note (non-blocking) ─────────────────────────────────────────
    await admin.from("transaction_ledger").insert({
      user_id: wd.user_id,
      type: "withdrawal_paid",
      amount: 0,
      description: `Withdrawal ${wd.reference} marked paid by admin`,
      reference_id: wd.reference,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: `Withdrawal $${wd.amount.toFixed(2)} marked as paid.`,
    });
  } catch (err: any) {
    console.error("[admin/approve] unhandled:", err.message);
    return NextResponse.json(
      { error: "Unexpected error." },
      { status: 500 },
    );
  }
}