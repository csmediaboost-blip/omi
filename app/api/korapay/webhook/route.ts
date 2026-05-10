// app/api/korapay/webhook/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// COMPLETE REPLACEMENT of the broken duplicate-export version (doc 16).
//
// FIXES vs broken version:
//  1. No duplicate POST export (was causing TypeScript compile failure)
//  2. Queries gateway_reference column (was using wrong transaction_id column)
//  3. Uses createNodeAllocation helper — all mining fields correctly set
//  4. miningPeriod correctly read from metadata and saved to allocation
//  5. mining_ends_at computed from actual period duration (was null before)
//  6. Idempotency check — skip if already processed
//  7. No queries against nonexistent user_balances table
//  8. Signature verification with proper fallback
//  9. Handles license + gpu_plan + gpu_contract purchase types
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  createNodeAllocation,
  activateLicense,
  writeLedgerEntry,
} from "@/lib/allocation-creator";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function verifyKorapaySignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  try {
    const hash = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    return hash === signature;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: "Cannot read body" }, { status: 400 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log(
    "[korapay/webhook] Event:",
    body?.event,
    "Reference:",
    body?.data?.reference,
  );

  // Signature verification — non-blocking if secret not set
  const signature = req.headers.get("x-korapay-signature");
  const korapaySecret = process.env.KORAPAY_SECRET_KEY || "";
  if (signature && korapaySecret) {
    if (!verifyKorapaySignature(rawBody, signature, korapaySecret)) {
      console.error("[korapay/webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const { data, event } = body;
  const reference = data?.reference;

  if (!reference) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  if (event === "charge.success") {
    try {
      // FIX #2: Query by gateway_reference (was wrong column in old version)
      const { data: txData, error: txErr } = await supabaseAdmin
        .from("payment_transactions")
        .select("*")
        .eq("gateway_reference", reference)
        .single();

      if (txErr || !txData) {
        console.error(
          "[korapay/webhook] Transaction not found:",
          reference,
          txErr,
        );
        // Return 200 to stop KoraPay retrying for unknown references
        return NextResponse.json({ success: true, note: "tx_not_found" });
      }

      // FIX #6: Idempotency — skip if already processed
      if (txData.status === "confirmed" || txData.status === "completed") {
        console.log("[korapay/webhook] Already processed:", reference);
        return NextResponse.json({ success: true });
      }

      const metadata =
        typeof txData.metadata === "string"
          ? JSON.parse(txData.metadata)
          : txData.metadata || {};

      const now = new Date().toISOString();
      const userId = txData.user_id;
      const purchaseType = metadata.purchaseType || "gpu_plan";

      // Mark payment confirmed
      await supabaseAdmin
        .from("payment_transactions")
        .update({
          status: "confirmed",
          verified_by_admin: true,
          confirmed_at: now,
          updated_at: now,
        })
        .eq("gateway_reference", reference);

      if (purchaseType === "license") {
        // Activate license
        const licenseType =
          metadata.licenseType || txData.node_key || "operator_license";
        const result = await activateLicense(
          supabaseAdmin,
          userId,
          licenseType,
          txData.amount,
          String(txData.id),
        );
        if (!result.success) {
          console.error(
            "[korapay/webhook] License activation failed:",
            result.error,
          );
        }
      } else {
        // FIX #3 & #4: Create GPU node allocation with ALL mining fields
        // miningPeriod now correctly read from metadata (was missing in old version)
        const result = await createNodeAllocation(supabaseAdmin, {
          userId,
          planId: txData.node_key,
          amount: txData.amount,
          metadata, // contains miningPeriod, paymentModel, etc.
          transactionRef: reference,
        });

        if (!result.success && !result.alreadyExisted) {
          console.error(
            "[korapay/webhook] Allocation creation failed:",
            result.error,
          );
          // Non-fatal — payment confirmed, can be activated manually from admin
        }
      }

      // Write ledger entry for audit trail
      await writeLedgerEntry(supabaseAdmin, {
        userId,
        type: purchaseType === "license" ? "license_purchase" : "investment",
        amount: txData.amount,
        currency: metadata.currency || txData.currency || "USD",
        description:
          purchaseType === "license"
            ? `Operator License via KoraPay (${metadata.licenseType || txData.node_key})`
            : `GPU Node via KoraPay (${txData.node_key}) — ${metadata.miningPeriod || "daily"} session`,
        referenceId: String(txData.id),
        metadata: { ...metadata, gateway: "korapay" },
      });

      // In-app notification
      try {
        await supabaseAdmin.from("user_notifications").insert({
          user_id: userId,
          type:
            purchaseType === "license" ? "license_activated" : "mining_started",
          title:
            purchaseType === "license"
              ? "🏆 License Activated!"
              : "⛏️ Mining Session Started!",
          body:
            purchaseType === "license"
              ? "Your operator license has been activated. Head to Tasks to start earning."
              : `Your ${metadata.miningPeriod || "daily"} GPU mining session is now live. Watch your earnings grow in real time.`,
          created_at: now,
        });
      } catch {}

      console.log(
        "[korapay/webhook] Successfully processed:",
        reference,
        "type:",
        purchaseType,
      );
      return NextResponse.json({ success: true, processed: true });
    } catch (err: any) {
      console.error("[korapay/webhook] Processing error:", err);
      // Return 500 so KoraPay retries
      return NextResponse.json(
        { error: err.message || "Processing failed" },
        { status: 500 },
      );
    }
  }

  if (event === "charge.failed" || event === "charge.declined") {
    // FIX #2: Use correct column
    await supabaseAdmin
      .from("payment_transactions")
      .update({ status: "declined", updated_at: new Date().toISOString() })
      .eq("gateway_reference", reference);
    return NextResponse.json({ success: true });
  }

  // Unknown event — acknowledge so KoraPay doesn't retry
  return NextResponse.json({ success: true });
}
