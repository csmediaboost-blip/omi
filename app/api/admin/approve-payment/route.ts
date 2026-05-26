// app/api/admin/approve-crypto-payment/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIXES applied vs the old route:
//
//  FIX 1 — "undefined" banner: response now returns `message`, `type`, and
//           `miningPeriod` so the frontend toast has real values to display.
//
//  FIX 2 — gateway_reference was being overwritten with txHash. Crypto tx hash
//           is now stored in `crypto_tx_hash` only — original reference
//           is never touched.
//
//  FIX 3 — `has_operator_license: true` was set for ALL purchase types,
//           including GPU plans. It is now only set for `purchaseType === "license"`.
//
//  All other behaviour retained: email receipt, idempotency guard, user lookup.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendCryptoPaymentReceipt } from "@/lib/email-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  try {
    const adminSupabase = getAdminSupabase();
    const { reference, txHash, cryptoAmount, cryptoType, walletAddress } =
      await req.json();

    if (!reference) {
      return NextResponse.json(
        { error: "reference is required" },
        { status: 400 },
      );
    }

    const { data: txn, error } = await adminSupabase
      .from("payment_transactions")
      .select("*")
      .eq("gateway_reference", reference)
      .single();

    if (error || !txn) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 },
      );
    }

    // Idempotency: already confirmed — return success without re-processing
    if (txn.status === "confirmed" || txn.status === "completed") {
      return NextResponse.json({
        success: true,
        message: "Already confirmed",
        nodeKey: txn.node_key,
        type: "already_confirmed",
        miningPeriod: null,
      });
    }

    // Parse metadata so we can use purchaseType and miningPeriod
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
    const miningPeriod = metadata.miningPeriod || "daily";
    const now = new Date().toISOString();

    // ── FIX 2: Never overwrite gateway_reference.
    //    Store the on-chain hash in its own column only.
    const updatePayload: Record<string, unknown> = {
      status: "confirmed",
      confirmed_at: now,
      updated_at: now,
    };
    if (txHash) updatePayload.crypto_tx_hash = txHash;
    if (walletAddress) updatePayload.crypto_wallet = walletAddress;

    await adminSupabase
      .from("payment_transactions")
      .update(updatePayload)
      .eq("gateway_reference", reference);

    // Upgrade user node / license
    await adminSupabase
      .from("users")
      .update({
        tier: txn.node_key,
        // ── FIX 3: Only set has_operator_license for actual license purchases.
        ...(purchaseType === "license" ? { has_operator_license: true } : {}),
        updated_at: now,
      })
      .eq("id", txn.user_id);

    // Get user details for email
    const { data: userData } = await adminSupabase
      .from("users")
      .select("email, full_name")
      .eq("id", txn.user_id)
      .single();

    // Send receipt email if available
    if (userData?.email) {
      await sendCryptoPaymentReceipt(
        userData.email,
        userData.full_name || "User",
        cryptoAmount || 0,
        cryptoType || "CRYPTO",
        txn.amount,
        walletAddress || "",
        txHash || reference,
        txn.node_key,
        String(txn.id),
        now,
      ).catch((e: unknown) =>
        console.error("[approve-crypto] Email failed (non-fatal):", e),
      );
    }

    // ── FIX 1: Return all fields the frontend banner needs.
    //    Previously only { success, nodeKey } was returned, so any field
    //    other than nodeKey came back undefined and broke the toast message.
    return NextResponse.json({
      success: true,
      nodeKey: txn.node_key,
      type: purchaseType,
      miningPeriod,
      message:
        purchaseType === "license"
          ? "License activated successfully"
          : `GPU mining session started (${miningPeriod})`,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    console.error("[approve-crypto] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
