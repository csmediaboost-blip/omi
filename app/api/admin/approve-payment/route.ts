// app/api/admin/approve-payment/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL FIX: Removed node_activated_at from userUpdate object.
//   That column does not exist in the users table and was crashing every
//   approval silently — licenses and nodes never activated after admin click.
//
// All other fixes from previous version retained:
//  1. Accepts paymentId OR reference
//  2. Does NOT overwrite gateway_reference with txHash
//  3. Creates node_allocation with all mining fields via shared helper
//  4. has_operator_license only set for license purchases
//  5. balance_locked only incremented for contracts
//  6. Sends in-app notification after activation
//  7. Full transaction_ledger entry written
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  createNodeAllocation,
  activateLicense,
  writeLedgerEntry,
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
    const adminSupabase = getAdminSupabase();
    const body = await req.json();

    const {
      paymentId,
      reference,
      txHash,
      cryptoAmount,
      cryptoType,
      walletAddress,
    } = body;

    if (!paymentId && !reference) {
      return NextResponse.json(
        { error: "paymentId or reference required" },
        { status: 400 },
      );
    }

    // Load transaction by ID or reference
    let txQuery = adminSupabase.from("payment_transactions").select("*");
    if (paymentId) {
      txQuery = txQuery.eq("id", Number(paymentId));
    } else {
      txQuery = txQuery.eq("gateway_reference", reference);
    }
    const { data: txn, error: txErr } = await txQuery.single();

    if (txErr || !txn) {
      console.error(
        "[approve-payment] Transaction not found:",
        { paymentId, reference },
        txErr,
      );
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 },
      );
    }

    // Idempotency: if already confirmed, return success without re-processing
    if (txn.status === "confirmed" || txn.status === "completed") {
      console.log("[approve-payment] Already confirmed:", txn.id);
      return NextResponse.json({
        success: true,
        message: "Already confirmed",
        allocationCreated: false,
      });
    }

    const now = new Date().toISOString();
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

    // Update payment status — do NOT overwrite gateway_reference
    const updatePayload: Record<string, any> = {
      status: "confirmed",
      verified_by_admin: true,
      confirmed_at: now,
      updated_at: now,
    };
    if (txHash) updatePayload.crypto_tx_hash = txHash;
    if (walletAddress) updatePayload.crypto_wallet = walletAddress;

    await adminSupabase
      .from("payment_transactions")
      .update(updatePayload)
      .eq("id", txn.id);

    let allocationId: string | undefined;

    if (purchaseType === "license") {
      const licenseType =
        metadata.licenseType || txn.node_key || "operator_license";
      const result = await activateLicense(
        adminSupabase,
        userId,
        licenseType,
        txn.amount,
        String(txn.id),
      );
      if (!result.success) {
        console.error(
          "[approve-payment] License activation failed:",
          result.error,
        );
        return NextResponse.json(
          { error: "License activation failed: " + result.error },
          { status: 500 },
        );
      }
    } else {
      // Create GPU node allocation with ALL mining fields
      const result = await createNodeAllocation(adminSupabase, {
        userId,
        planId: txn.node_key,
        amount: txn.amount,
        metadata,
        transactionRef: String(txn.id),
      });

      if (!result.success && !result.alreadyExisted) {
        console.error(
          "[approve-payment] Allocation creation failed:",
          result.error,
        );
        return NextResponse.json(
          { error: "Failed to create mining allocation: " + result.error },
          { status: 500 },
        );
      }

      allocationId = result.allocationId;
    }

    // CRITICAL FIX: Removed node_activated_at — column does not exist.
    // Only update has_operator_license for license purchases (not GPU plans).
    // For GPU plans: no user table update needed here (createNodeAllocation handles balance).
    if (purchaseType === "license") {
      try {
        await adminSupabase
          .from("users")
          .update({ has_operator_license: true, updated_at: now })
          .eq("id", userId);
      } catch (e: any) {
        console.warn(
          "[approve-payment] User flag update failed (non-fatal):",
          e?.message,
        );
      }
    }

    // Write ledger entry
    await writeLedgerEntry(adminSupabase, {
      userId,
      type: purchaseType === "license" ? "license_purchase" : "investment",
      amount: txn.amount,
      currency: metadata.currency || txn.currency || "USD",
      description:
        purchaseType === "license"
          ? `Operator License approved by admin (${metadata.licenseType || txn.node_key})`
          : `GPU Node approved by admin (${txn.node_key}) — ${metadata.miningPeriod || "daily"} session`,
      referenceId: String(txn.id),
      metadata: {
        ...metadata,
        approvedByAdmin: true,
        ...(txHash ? { cryptoTxHash: txHash } : {}),
        ...(cryptoAmount ? { cryptoAmount } : {}),
        ...(cryptoType ? { cryptoType } : {}),
      },
    });

    // In-app notification to user
    try {
      await adminSupabase.from("user_notifications").insert({
        user_id: userId,
        type:
          purchaseType === "license" ? "license_activated" : "mining_started",
        title:
          purchaseType === "license"
            ? "🏆 License Activated!"
            : "⛏️ Mining Session Started!",
        body:
          purchaseType === "license"
            ? "Your payment has been verified and your operator license is now active. Head to Tasks to start earning."
            : `Your payment has been verified. Your ${metadata.miningPeriod || "daily"} GPU mining session is now live. Watch your earnings grow in real time.`,
        created_at: now,
      });
    } catch {}

    // Send email receipt if email service available
    try {
      const { data: userData } = await adminSupabase
        .from("users")
        .select("email, full_name")
        .eq("id", userId)
        .single();

      if (userData?.email) {
        const emailModule = await import("@/lib/email-service").catch(
          () => null,
        );
        if (emailModule?.sendCryptoPaymentReceipt) {
          await emailModule
            .sendCryptoPaymentReceipt(
              userData.email,
              userData.full_name || "User",
              cryptoAmount || 0,
              cryptoType || "CRYPTO",
              txn.amount,
              walletAddress || "",
              txHash || String(txn.id),
              txn.node_key,
              String(txn.id),
              now,
            )
            .catch((e: any) =>
              console.error("[approve-payment] Email failed (non-fatal):", e),
            );
        }
      }
    } catch {}

    console.log("[approve-payment] ✓ Approved:", {
      txnId: txn.id,
      userId: userId.slice(0, 8),
      purchaseType,
      allocationId,
      amount: txn.amount,
    });

    return NextResponse.json({
      success: true,
      type: purchaseType,
      allocationId,
      nodeKey: txn.node_key,
      message:
        purchaseType === "license"
          ? "License activated successfully"
          : "GPU mining session started successfully",
    });
  } catch (err: any) {
    console.error("[approve-payment] Unhandled error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
