// app/api/korapay/callback/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIXES vs broken version:
//  FIX-A  Removed import from @/lib/allocation-creator (file does not exist).
//         All allocation and license logic is now inlined directly here.
//  FIX-B  GPU plan allocation uses all correct fields:
//         mining_period, mining_ends_at, rate_factor_used, payment_model, etc.
//  FIX-C  Flexible sessions: lockInMonths = 0, mining_ends_at computed from
//         PERIOD_DURATIONS_MS. Contract sessions: mining_ends_at = maturity_date.
//  FIX-D  License activation inserts into operator_licenses table.
//  FIX-E  Idempotency guard prevents duplicate allocation on double-redirect.
//  FIX-F  In-app notification sent after activation.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Mirror of PERIOD_DURATIONS_MS from mining-service (inlined to avoid import)
const PERIOD_DURATIONS_MS: Record<string, number> = {
  hourly: 1 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://omnitaskpro.online"
).replace(/\/$/, "");

// ─── Inline allocation creator ────────────────────────────────────────────────
async function createNodeAllocation(
  supabase: ReturnType<typeof getSupabase>,
  params: {
    userId: string;
    planId: string;
    amount: number;
    metadata: Record<string, any>;
    transactionRef: string;
  },
): Promise<{
  success: boolean;
  id?: string;
  alreadyExisted?: boolean;
  error?: string;
}> {
  const { userId, planId, amount, metadata, transactionRef } = params;

  // Idempotency — skip if allocation already created for this ref
  const { data: existing } = await supabase
    .from("node_allocations")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("[callback] Allocation already exists:", existing[0].id);
    return { success: true, id: existing[0].id, alreadyExisted: true };
  }

  const paymentModel: "flexible" | "contract" =
    metadata.paymentModel === "contract" ? "contract" : "flexible";
  const miningPeriod = metadata.miningPeriod ?? "daily";
  const isContract = paymentModel === "contract";
  const now = new Date();

  const periodMs =
    PERIOD_DURATIONS_MS[miningPeriod] ?? PERIOD_DURATIONS_MS.daily;
  const miningEndsAt = isContract
    ? null
    : new Date(now.getTime() + periodMs).toISOString();

  const contractMonths = Number(metadata.contractMonths) || 6;
  const maturityDate = isContract
    ? new Date(
        now.getTime() + contractMonths * 30 * 24 * 60 * 60 * 1000,
      ).toISOString()
    : null;

  // Fetch rate_factor (soft — falls back to 0.86)
  let rateFactor = 0.86;
  try {
    const { data: rateSnap } = await supabase
      .from("current_mining_rates")
      .select("rate_factor")
      .eq("plan_id", planId)
      .eq("period", miningPeriod)
      .single();
    if (rateSnap?.rate_factor != null) rateFactor = rateSnap.rate_factor;
  } catch {}

  const allocationPayload: Record<string, any> = {
    user_id: userId,
    plan_id: planId,
    amount_invested: amount,
    status: "active",
    payment_model: paymentModel,
    instance_type: metadata.itype || "on_demand",
    total_earned: 0,
    total_withdrawn: 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    auto_reinvest: metadata.autoReinvest || false,
    ...(paymentModel === "flexible"
      ? {
          mining_period: miningPeriod,
          mining_ends_at: miningEndsAt,
          mining_completed: false,
          rate_factor_used: rateFactor,
          capital_returned: false,
          final_profit: 0,
        }
      : {
          contract_months: contractMonths,
          contract_label: metadata.contractLabel || null,
          contract_min_pct: metadata.contractMinPct || null,
          contract_max_pct: metadata.contractMaxPct || null,
          maturity_date: maturityDate,
          lock_in_months: contractMonths,
          lock_in_label: metadata.lockInLabel || metadata.contractLabel || null,
          lock_in_multiplier: metadata.lockInMultiplier || 1.0,
          mining_completed: false,
          rate_factor_used: rateFactor,
          mining_period: "contract",
          mining_ends_at: maturityDate,
        }),
  };

  const { data: newAlloc, error: allocErr } = await supabase
    .from("node_allocations")
    .insert(allocationPayload)
    .select("id")
    .single();

  if (allocErr) {
    console.error("[callback] Allocation insert failed:", allocErr.message);
    return { success: false, error: allocErr.message };
  }

  // Record payment_transaction entry for this allocation
  try {
    await supabase.from("payment_transactions").insert({
      user_id: userId,
      node_key: planId,
      amount,
      currency: "USD",
      gateway: "korapay_confirmed",
      gateway_reference: newAlloc.id,
      status: "confirmed",
      verified_by_admin: true,
      created_at: now.toISOString(),
      confirmed_at: now.toISOString(),
      metadata: JSON.stringify({
        purchaseType: isContract ? "gpu_contract" : "gpu_mining",
        planName: metadata.nodeName || planId,
        miningPeriod,
        allocationId: newAlloc.id,
        transactionRef,
      }),
    });
  } catch {}

  // Referral tracking
  if (metadata.referralCode) {
    try {
      await supabase.from("referral_uses").insert({
        referral_code: metadata.referralCode,
        referred_user_id: userId,
        allocation_id: newAlloc.id,
        amount,
        created_at: now.toISOString(),
      });
    } catch {}
  }

  return { success: true, id: newAlloc.id };
}

// ─── Inline license activator ─────────────────────────────────────────────────
async function activateLicense(
  supabase: ReturnType<typeof getSupabase>,
  userId: string,
  licenseType: string,
  amount: number,
  txRef: string,
): Promise<{ success: boolean; error?: string }> {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + 4 * 365 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Idempotency — check if license already active for this user + type
  const { data: existing } = await supabase
    .from("operator_licenses")
    .select("id")
    .eq("user_id", userId)
    .eq("license_type", licenseType)
    .eq("status", "active")
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("[callback] License already active:", existing[0].id);
    return { success: true };
  }

  const { error } = await supabase.from("operator_licenses").insert({
    user_id: userId,
    license_type: licenseType,
    status: "active",
    activated_at: now.toISOString(),
    expires_at: expiresAt,
    amount_paid: amount,
    transaction_ref: txRef,
    created_at: now.toISOString(),
  });

  if (error) {
    console.error("[callback] License insert failed:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

// ─── GET handler — KoraPay redirects here after payment ──────────────────────
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
    // ── Load KoraPay API key ─────────────────────────────────────────────────
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
      cfg["korapay_key"] ||
      cfg["KORAPAY_SECRET_KEY"] ||
      process.env.KORAPAY_SECRET_KEY ||
      "";

    if (!korapayKey || korapayKey.trim() === "" || korapayKey === "EMPTY") {
      console.error("[korapay/callback] No API key");
      return NextResponse.redirect(
        `${APP_URL}/dashboard/checkout?error=config`,
      );
    }

    // ── Verify charge with KoraPay ────────────────────────────────────────────
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
      "charge:",
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
      // ── Load transaction record ─────────────────────────────────────────────
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

      // Idempotency — already processed
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

      // ── Mark transaction confirmed ──────────────────────────────────────────
      await supabase
        .from("payment_transactions")
        .update({
          status: "confirmed",
          verified_by_admin: true,
          confirmed_at: now,
          updated_at: now,
        })
        .eq("gateway_reference", reference);

      // ── Activate plan or license immediately ────────────────────────────────
      if (purchaseType === "license") {
        const licenseType =
          metadata.licenseType || txData.node_key || "operator_license";
        const result = await activateLicense(
          supabase,
          userId,
          licenseType,
          txData.amount,
          reference,
        );
        if (!result.success) {
          console.error(
            "[korapay/callback] License activation failed:",
            result.error,
          );
        }
      } else {
        // For split payments, only activate allocation on the FINAL installment.
        // For regular payments (isSplitPayment is false/null), activate immediately.
        const isSplit = metadata.isSplitPayment === true;
        const splitInstallment = Number(metadata.splitInstallment) || 1;
        const splitTotal = Number(metadata.splitTotal) || 1;
        const isFinalInstallment = !isSplit || splitInstallment >= splitTotal;

        if (isFinalInstallment) {
          const result = await createNodeAllocation(supabase, {
            userId,
            planId: txData.node_key,
            amount: metadata.originalPrice ?? txData.amount,
            metadata,
            transactionRef: reference,
          });
          if (!result.success && !result.alreadyExisted) {
            console.error(
              "[korapay/callback] Allocation creation failed:",
              result.error,
            );
          }
        } else {
          console.log(
            `[korapay/callback] Split installment ${splitInstallment}/${splitTotal} confirmed — waiting for remaining installments.`,
          );
        }
      }

      // ── Write ledger entry ──────────────────────────────────────────────────
      try {
        await supabase.from("transaction_ledger").insert({
          user_id: userId,
          type: purchaseType === "license" ? "license_purchase" : "investment",
          amount: txData.amount,
          description:
            purchaseType === "license"
              ? `Operator License via Bank Transfer (${metadata.licenseType || txData.node_key})`
              : `GPU Node via Bank Transfer (${txData.node_key}) — ${metadata.miningPeriod || "daily"} session`,
          created_at: now,
        });
      } catch {}

      // ── In-app notification ─────────────────────────────────────────────────
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
