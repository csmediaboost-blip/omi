// app/api/korapay/callback/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIXES:
//  1. Uses createNodeAllocation helper — all mining fields correctly set
//  2. miningPeriod, mining_ends_at, rate_factor_used now saved to allocation
//  3. Idempotency: if allocation already exists, skip creation silently
//  4. lockInMonths = 0 for flexible (was 6 before)
//  5. balance_locked only incremented for contracts (not flexible mining)
//  6. Sends in-app notification after activation
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  createNodeAllocation,
  activateLicense,
  writeLedgerEntry,
} from "@/lib/allocation-creator";

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
    // Load KoraPay config
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

    // Verify with KoraPay
    const verifyRes = await fetch(
      `https://api.korapay.com/merchant/api/v1/charges/${reference}`,
      { method: "GET", headers: { Authorization: `Bearer ${korapayKey}` } },
    );

    let verifyData: any = {};
    try {
      verifyData = await verifyRes.json();
    } catch {}

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
      // Load transaction
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

      // Idempotency: skip if already processed
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
      const purchaseType = metadata.purchaseType || "gpu_plan";

      // Mark transaction confirmed
      await supabase
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
          supabase,
          userId,
          licenseType,
          txData.amount,
          String(txData.id),
        );
        if (!result.success) {
          console.error(
            "[korapay/callback] License activation failed:",
            result.error,
          );
        }
      } else {
        // FIX: Create GPU node allocation with ALL mining fields via shared helper
        const result = await createNodeAllocation(supabase, {
          userId,
          planId: txData.node_key,
          amount: txData.amount,
          metadata, // contains miningPeriod, paymentModel, etc.
          transactionRef: reference,
        });

        if (!result.success && !result.alreadyExisted) {
          console.error(
            "[korapay/callback] Allocation creation failed:",
            result.error,
          );
          // Non-fatal — payment confirmed, allocation can be created manually
        }
      }

      // Write ledger entry
      await writeLedgerEntry(supabase, {
        userId,
        type: purchaseType === "license" ? "license_purchase" : "investment",
        amount: txData.amount,
        currency: metadata.currency || "USD",
        description:
          purchaseType === "license"
            ? `Operator License via Bank Transfer (${metadata.licenseType || txData.node_key})`
            : `GPU Node via Bank Transfer (${txData.node_key}) — ${metadata.miningPeriod || "daily"} session`,
        referenceId: String(txData.id),
        metadata: { ...metadata, gateway: "korapay" },
      });

      // In-app notification
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
              ? "Your operator license has been activated. Head to Tasks to start earning."
              : `Your ${metadata.miningPeriod || "daily"} GPU mining session is now live. Watch your earnings in the portfolio.`,
          created_at: now,
        });
      } catch {}

      return NextResponse.redirect(
        `${APP_URL}/dashboard/checkout?status=success&reference=${reference}`,
      );
    } else {
      // Declined / failed
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
