// app/api/admin/withdrawals/reject/route.ts
// Rejects a queued withdrawal and refunds the user's balance atomically.
// Uses SERVICE ROLE key — bypasses RLS, never bounces to sign-in.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

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
    // ── 1. Admin auth ─────────────────────────────────────────────────────────
    const cookieStore = await cookies();
    const anonClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    if (!(await isAdmin(anonClient))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // ── 2. Parse ──────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { withdrawal_id, reason } = body;
    if (!withdrawal_id) {
      return NextResponse.json(
        { error: "withdrawal_id is required." },
        { status: 400 },
      );
    }
    if (!reason?.trim()) {
      return NextResponse.json(
        { error: "Rejection reason is required." },
        { status: 400 },
      );
    }

    // ── 3. Service-role client ────────────────────────────────────────────────
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
        {
          error: `Cannot reject a withdrawal with status "${wd.status}". Only queued or processing withdrawals can be rejected.`,
        },
        { status: 400 },
      );
    }

    // ── 5. Refund balance atomically via RPC ──────────────────────────────────
    // atomic_refund_balance must be a Postgres function that:
    //   UPDATE users SET balance_available = balance_available + p_amount WHERE id = p_user_id
    // wrapped in a transaction so it's safe under concurrent load.
    const { error: refundErr } = await admin.rpc("atomic_refund_balance", {
      p_user_id: wd.user_id,
      p_amount: wd.amount,
    });
    if (refundErr) {
      console.error("[admin/reject] refund error:", refundErr.message);
      return NextResponse.json(
        { error: `Refund failed: ${refundErr.message}` },
        { status: 500 },
      );
    }

    // ── 6. Mark rejected ──────────────────────────────────────────────────────
    const { error: updateErr } = await admin
      .from("withdrawals")
      .update({
        status: "rejected",
        tracking_status: "rejected",
        rejection_reason: reason.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", withdrawal_id);

    if (updateErr) {
      // Refund already went through — log for manual reconciliation.
      console.error(
        "[admin/reject] status update failed after refund — MANUAL RECONCILE NEEDED:",
        withdrawal_id,
        updateErr.message,
      );
      return NextResponse.json(
        {
          error:
            "Refund processed but status update failed. Check server logs for manual reconciliation.",
        },
        { status: 500 },
      );
    }

    // ── 7. Ledger note (non-blocking) ─────────────────────────────────────────
    await admin.from("transaction_ledger").insert({
      user_id: wd.user_id,
      type: "withdrawal_refund",
      amount: wd.amount,
      description: `Withdrawal ${wd.reference} rejected by admin: ${reason.trim()}`,
      reference_id: wd.reference,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: `Withdrawal rejected. $${wd.amount.toFixed(2)} refunded to user balance.`,
    });
  } catch (err: any) {
    console.error("[admin/reject] unhandled:", err.message);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}