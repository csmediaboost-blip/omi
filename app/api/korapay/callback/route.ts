// app/api/korapay/callback/route.ts
// FIXED: uses gateway_reference (not transaction_id), full error handling,
// handles both license and gpu_plan purchase types

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://omnitaskpro.online";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reference = searchParams.get("reference");
  const userId = searchParams.get("userId");

  console.log(
    "[korapay/callback] reference:",
    reference,
    "userId:",
    userId?.slice(0, 8),
  );

  if (!reference || !userId) {
    return NextResponse.redirect(
      `${APP_URL}/dashboard/checkout?error=invalid_params`,
    );
  }

  const supabase = getSupabase();

  try {
    // ── Load KoraPay key ──────────────────────────────────────
    const { data: configData } = await supabase
      .from("payment_config")
      .select("key, value");

    const cfg: Record<string, string> = {};
    (configData || []).forEach((r: any) => {
      cfg[r.key] = r.value;
    });

    const korapayKey =
      cfg["korapay_secret_key"] ||
      cfg["korapay_api_key"] ||
      process.env.KORAPAY_SECRET_KEY ||
      "";

    if (!korapayKey) {
      console.error("[korapay/callback] No API key");
      return NextResponse.redirect(
        `${APP_URL}/dashboard/checkout?error=config`,
      );
    }

    // ── Verify with KoraPay ───────────────────────────────────
    const verifyRes = await fetch(
      `https://api.korapay.com/merchant/api/v1/charges/${reference}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${korapayKey}` },
      },
    );

    let verifyData: any;
    try {
      verifyData = await verifyRes.json();
    } catch {
      verifyData = {};
    }

    console.log(
      "[korapay/callback] Verify status:",
      verifyRes.status,
      "charge status:",
      verifyData?.data?.status,
    );

    if (!verifyRes.ok) {
      console.error("[korapay/callback] Verify failed:", verifyData);
      await supabase
        .from("payment_transactions")
        .update({ status: "declined", updated_at: new Date().toISOString() })
        .eq("gateway_reference", reference);

      return NextResponse.redirect(
        `${APP_URL}/dashboard/checkout?status=declined&reference=${reference}`,
      );
    }

    const chargeStatus = verifyData?.data?.status;

    if (chargeStatus === "success" || chargeStatus === "completed") {
      // ── Get transaction ───────────────────────────────────
      const { data: txData, error: txErr } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("gateway_reference", reference)
        .single();

      if (txErr || !txData) {
        console.error("[korapay/callback] Tx not found:", reference, txErr);
        return NextResponse.redirect(
          `${APP_URL}/dashboard/checkout?error=tx_not_found`,
        );
      }

      // Skip if already processed (idempotency)
      if (txData.status === "confirmed" || txData.status === "completed") {
        console.log("[korapay/callback] Already processed:", reference);
        return NextResponse.redirect(
          `${APP_URL}/dashboard/checkout?status=success&reference=${reference}`,
        );
      }

      const metadata =
        typeof txData.metadata === "string"
          ? JSON.parse(txData.metadata)
          : txData.metadata || {};

      const now = new Date().toISOString();
      const fourYears = new Date(
        Date.now() + 4 * 365 * 24 * 3600 * 1000,
      ).toISOString();

      // ── Mark transaction confirmed ────────────────────────
      await supabase
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
        // ── Activate license ──────────────────────────────
        const licenseType =
          metadata.licenseType || txData.node_key || "operator_license";
        const resolvedType =
          licenseType === "operator_license" ? "all" : licenseType;

        await supabase.from("operator_licenses").upsert(
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

        await supabase
          .from("users")
          .update({
            has_operator_license: true,
            license_expires_at: fourYears,
            node_activated_at: now,
          })
          .eq("id", userId);
      } else {
        // ── Activate GPU node ─────────────────────────────
        const isContract = metadata.paymentModel === "contract";
        const maturityDate =
          isContract && metadata.contractMonths
            ? new Date(
                Date.now() + metadata.contractMonths * 30 * 24 * 3600 * 1000,
              ).toISOString()
            : null;

        await supabase.from("node_allocations").insert({
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

        // Update user balance_locked
        const { data: u } = await supabase
          .from("users")
          .select("balance_locked")
          .eq("id", userId)
          .single();
        await supabase
          .from("users")
          .update({
            balance_locked: (u?.balance_locked || 0) + txData.amount,
            node_activated_at: now,
          })
          .eq("id", userId);
      }

      // ── Write to transaction_ledger ───────────────────────
      try {
        await supabase.from("transaction_ledger").insert({
          user_id: userId,
          type: purchaseType === "license" ? "license_purchase" : "investment",
          amount: txData.amount,
          currency: metadata.currency || "USD",
          description:
            purchaseType === "license"
              ? `Operator License (${metadata.licenseType || txData.node_key}) via Bank Transfer`
              : `GPU Node (${txData.node_key}) via Bank Transfer — ${metadata.lockInLabel || "flexible"}`,
          reference_id: String(txData.id),
          metadata: { ...metadata, gateway: "korapay" },
          created_at: now,
        });
      } catch (e) {
        console.error("[korapay/callback] Ledger write failed (non-fatal):", e);
      }

      return NextResponse.redirect(
        `${APP_URL}/dashboard/checkout?status=success&reference=${reference}`,
      );
    } else {
      // Declined / pending / failed
      console.log("[korapay/callback] Charge not successful:", chargeStatus);
      await supabase
        .from("payment_transactions")
        .update({ status: "declined", updated_at: new Date().toISOString() })
        .eq("gateway_reference", reference);

      return NextResponse.redirect(
        `${APP_URL}/dashboard/checkout?status=declined&reference=${reference}`,
      );
    }
  } catch (err: any) {
    console.error("[korapay/callback] Unhandled error:", err);
    return NextResponse.redirect(
      `${APP_URL}/dashboard/checkout?error=callback_error`,
    );
  }
}
