// app/api/admin/activate-node/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// RESCUE FALLBACK — only needed for payments that were confirmed BEFORE the
// approve-payment fix was deployed (no allocation was created at that time).
//
// For ALL new payments, allocation is created INSTANTLY by approve-payment/
// korapay callback/korapay webhook. This route is only a safety net.
//
// Idempotent: safe to call multiple times — checks for existing allocation first.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createNodeAllocation,
  activateLicense,
} from "@/lib/allocation-creator";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getAdminSupabase();
    const body = await req.json();
    const { paymentId, reference } = body;

    if (!paymentId && !reference) {
      return NextResponse.json(
        { error: "paymentId or reference required" },
        { status: 400 },
      );
    }

    // Load the payment transaction
    let q = supabase.from("payment_transactions").select("*");
    if (paymentId) q = q.eq("id", Number(paymentId));
    else q = q.eq("gateway_reference", reference);
    const { data: txn, error: txErr } = await q.single();

    if (txErr || !txn) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 },
      );
    }

    const metadata = (() => {
      try {
        return typeof txn.metadata === "string"
          ? JSON.parse(txn.metadata)
          : txn.metadata || {};
      } catch {
        return {};
      }
    })();

    const purchaseType = metadata.purchaseType || "gpu_plan";
    const userId = txn.user_id;

    let allocationId: string | undefined;

    if (purchaseType === "license") {
      const licenseType =
        metadata.licenseType || txn.node_key || "operator_license";
      const result = await activateLicense(
        supabase,
        userId,
        licenseType,
        txn.amount,
        String(txn.id),
      );
      if (!result.success) {
        return NextResponse.json(
          { error: "License activation failed: " + result.error },
          { status: 500 },
        );
      }
    } else {
      // Create node allocation — idempotency inside createNodeAllocation prevents duplicates
      const result = await createNodeAllocation(supabase, {
        userId,
        planId: txn.node_key,
        amount: txn.amount,
        metadata,
        transactionRef: String(txn.id),
      });

      if (!result.success && !result.alreadyExisted) {
        return NextResponse.json(
          { error: "Allocation creation failed: " + result.error },
          { status: 500 },
        );
      }
      allocationId = result.allocationId;
      if (result.alreadyExisted) {
        return NextResponse.json({
          success: true,
          message: "Allocation already exists — no duplicate created",
          allocationId,
          alreadyExisted: true,
        });
      }
    }

    // Ensure payment marked confirmed
    await supabase
      .from("payment_transactions")
      .update({
        status: "confirmed",
        verified_by_admin: true,
        confirmed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", txn.id)
      .eq("status", "pending"); // only update if still pending (idempotent)

    // Notify user
    try {
      await supabase.from("user_notifications").insert({
        user_id: userId,
        type:
          purchaseType === "license" ? "license_activated" : "mining_started",
        title:
          purchaseType === "license"
            ? "🏆 License Activated!"
            : "⛏️ Mining Session Started!",
        body:
          purchaseType === "license"
            ? "Your payment has been verified and your operator license is now active."
            : `Your ${metadata.miningPeriod || "daily"} GPU mining session is now live. Watch your earnings grow.`,
        created_at: new Date().toISOString(),
      });
    } catch {}

    return NextResponse.json({
      success: true,
      allocationId,
      purchaseType,
      message:
        purchaseType === "license"
          ? "License activated successfully"
          : `Mining session started (${metadata.miningPeriod || "daily"})`,
    });
  } catch (err: any) {
    console.error("[activate-node] Unhandled error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
