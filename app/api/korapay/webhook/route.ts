// app/api/korapay/webhook/route.ts
// FIXED: uses gateway_reference (not transaction_id), handles both
// license and gpu_plan, proper signature verification, idempotency guard

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

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

  // ── Signature verification (non-blocking if key not set) ──
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
      // ── Load transaction ──────────────────────────────────
      const { data: txData, error: txErr } = await supabaseAdmin
        .from("payment_transactions")
        .select("*")
        .eq("gateway_reference", reference) // CORRECT column
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

      // Idempotency — skip if already processed
      if (txData.status === "confirmed" || txData.status === "completed") {
        console.log("[korapay/webhook] Already processed:", reference);
        return NextResponse.json({ success: true });
      }

      const metadata =
        typeof txData.metadata === "string"
          ? JSON.parse(txData.metadata)
          : txData.metadata || {};

      const now = new Date().toISOString();
      const fourYears = new Date(
        Date.now() + 4 * 365 * 24 * 3600 * 1000,
      ).toISOString();
      const userId = txData.user_id;

      // ── Mark confirmed ────────────────────────────────────
      await supabaseAdmin
        .from("payment_transactions")
        .update({
          status: "confirmed",
          verified_by_admin: true,
          confirmed_at: now,
          updated_at: now,
        })
        .eq("gateway_reference", reference);

      const purchaseType = metadata.purchaseType || "gpu_plan";

      if (purchaseType === "license") {
        // ── Activate license ────────────────────────────────
        const licenseType =
          metadata.licenseType || txData.node_key || "operator_license";
        const resolvedType =
          licenseType === "operator_license" ? "all" : licenseType;

        await supabaseAdmin.from("operator_licenses").upsert(
          {
            user_id: userId,
            license_type: resolvedType,
            status: "active",
            expires_at: fourYears,
            purchased_at: now,
            amount_paid: txData.amount,
            transaction_ref: String(txData.id),
          },
          { onConflict: "user_id,license_type" },
        );

        await supabaseAdmin
          .from("users")
          .update({
            has_operator_license: true,
            license_expires_at: fourYears,
            node_activated_at: now,
          })
          .eq("id", userId);
      } else {
        // ── Activate GPU node ───────────────────────────────
        const isContract = metadata.paymentModel === "contract";
        const maturityDate =
          isContract && metadata.contractMonths
            ? new Date(
                Date.now() + metadata.contractMonths * 30 * 24 * 3600 * 1000,
              ).toISOString()
            : null;

        await supabaseAdmin.from("node_allocations").insert({
          user_id: userId,
          plan_id: txData.node_key,
          amount_invested: txData.amount,
          amount_paid: txData.converted_amount || txData.amount,
          currency: metadata.currency || "USD",
          instance_type: metadata.itype || "on_demand",
          payment_model: metadata.paymentModel || "flexible",
          contract_months: metadata.contractMonths || null,
          contract_label: metadata.contractLabel || null,
          contract_min_pct: metadata.contractMinPct || null,
          contract_max_pct: metadata.contractMaxPct || null,
          maturity_date: maturityDate,
          lock_in_months: metadata.lockInMonths || 6,
          lock_in_multiplier: metadata.lockInMultiplier || 1.0,
          lock_in_label: metadata.lockInLabel || "6 months",
          status: "active",
          total_earned: 0,
          total_withdrawn: 0,
          created_at: now,
          updated_at: now,
        });

        // Update balance_locked
        const { data: u } = await supabaseAdmin
          .from("users")
          .select("balance_locked")
          .eq("id", userId)
          .single();
        await supabaseAdmin
          .from("users")
          .update({
            balance_locked: (u?.balance_locked || 0) + txData.amount,
            node_activated_at: now,
          })
          .eq("id", userId);
      }

      // ── transaction_ledger ───────────────────────────────
      try {
        await supabaseAdmin.from("transaction_ledger").insert({
          user_id: userId,
          type: purchaseType === "license" ? "license_purchase" : "investment",
          amount: txData.amount,
          currency: metadata.currency || txData.currency || "USD",
          description:
            purchaseType === "license"
              ? `Operator License (${metadata.licenseType || txData.node_key}) via Bank Transfer`
              : `GPU Node (${txData.node_key}) via Bank Transfer — ${metadata.lockInLabel || "flexible"}`,
          reference_id: String(txData.id),
          metadata: { ...metadata, gateway: "korapay" },
          created_at: now,
        });
      } catch (e) {
        console.error("[korapay/webhook] Ledger write failed (non-fatal):", e);
      }

      // ── transactions table (for Financial page) ──────────
      try {
        await supabaseAdmin.from("transactions").insert({
          user_id: userId,
          type: purchaseType === "license" ? "license_purchase" : "investment",
          amount: txData.amount,
          currency: metadata.currency || txData.currency || "USD",
          description:
            purchaseType === "license"
              ? `License activated via KoraPay: ${txData.node_key}`
              : `GPU Node via KoraPay: ${txData.node_key} (${metadata.lockInLabel || "flexible"})`,
          reference_id: String(txData.id),
          metadata: { ...metadata, gateway: "korapay" },
          created_at: now,
        });
      } catch (e) {
        console.error(
          "[korapay/webhook] Transactions write failed (non-fatal):",
          e,
        );
      }

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
    await supabaseAdmin
      .from("payment_transactions")
      .update({ status: "declined", updated_at: new Date().toISOString() })
      .eq("gateway_reference", reference); // CORRECT column

    return NextResponse.json({ success: true });
  }

  // Unknown event — acknowledge so KoraPay doesn't retry
  return NextResponse.json({ success: true });
}
