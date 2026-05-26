// app/api/korapay/webhook/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// BUG FIX (vs original):
//  FIX-SCHEMA  Loads korapay_secret_key from DB using select("*") — actual
//              column-based schema (not key-value rows).
//  FIX-A  No import from @/lib/allocation-creator — all logic inlined.
//  FIX-B  Queries by gateway_reference (correct column).
//  FIX-C  Single POST export only.
//  FIX-G  Activates plan/license IMMEDIATELY on charge.success.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const PERIOD_DURATIONS_MS: Record<string, number> = {
  hourly: 1 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  });
}

// ─── FIX: Load webhook secret using actual column-based schema ─────────────────
async function resolveKorapaySecret(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<string> {
  try {
    const { data } = await supabase
      .from("payment_config")
      .select("*") // ← FIX: actual column-based schema
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.korapay_secret_key?.trim()) return data.korapay_secret_key.trim();
    for (const alias of [
      "korapay_api_key",
      "korapay_key",
      "korapay_live_secret",
    ]) {
      if (data?.[alias]?.trim()) return data[alias].trim();
    }
  } catch {}
  return process.env.KORAPAY_SECRET_KEY?.trim() || "";
}

function verifySignature(
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

async function createNodeAllocation(
  supabase: ReturnType<typeof getSupabaseAdmin>,
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

  const { data: existing } = await supabase
    .from("node_allocations")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("[webhook] Allocation already exists:", existing[0].id);
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
    console.error("[webhook] Allocation insert failed:", allocErr.message);
    return { success: false, error: allocErr.message };
  }

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
        miningPeriod,
        allocationId: newAlloc.id,
        transactionRef,
      }),
    });
  } catch {}

  return { success: true, id: newAlloc.id };
}

async function activateLicense(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  licenseType: string,
  amount: number,
  txRef: string,
): Promise<{ success: boolean; error?: string }> {
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + 4 * 365 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: existing } = await supabase
    .from("operator_licenses")
    .select("id")
    .eq("user_id", userId)
    .eq("license_type", licenseType)
    .eq("status", "active")
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("[webhook] License already active:", existing[0].id);
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
    console.error("[webhook] License insert failed:", error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
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

  // Signature verification (loads key from DB with correct schema)
  const signature = req.headers.get("x-korapay-signature");
  if (signature) {
    const secret = await resolveKorapaySecret(supabaseAdmin);
    if (secret && !verifySignature(rawBody, signature, secret)) {
      console.error("[korapay/webhook] Invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const { data, event } = body;
  const reference = data?.reference;

  if (!reference)
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });

  if (event === "charge.success") {
    try {
      const { data: txData, error: txErr } = await supabaseAdmin
        .from("payment_transactions")
        .select("*")
        .eq("gateway_reference", reference)
        .single();

      if (txErr || !txData) {
        console.error("[korapay/webhook] Transaction not found:", reference);
        return NextResponse.json({ success: true, note: "tx_not_found" });
      }

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
        const licenseType =
          metadata.licenseType || txData.node_key || "operator_license";
        const result = await activateLicense(
          supabaseAdmin,
          userId,
          licenseType,
          txData.amount,
          reference,
        );
        if (!result.success)
          console.error(
            "[korapay/webhook] License activation failed:",
            result.error,
          );
      } else {
        const isSplit = metadata.isSplitPayment === true;
        const splitInstallment = Number(metadata.splitInstallment) || 1;
        const splitTotal = Number(metadata.splitTotal) || 1;
        const isFinalInstallment = !isSplit || splitInstallment >= splitTotal;

        if (isFinalInstallment) {
          const result = await createNodeAllocation(supabaseAdmin, {
            userId,
            planId: txData.node_key,
            amount: metadata.originalPrice ?? txData.amount,
            metadata,
            transactionRef: reference,
          });
          if (!result.success && !result.alreadyExisted)
            console.error("[korapay/webhook] Allocation failed:", result.error);
        } else {
          console.log(
            `[korapay/webhook] Split ${splitInstallment}/${splitTotal} confirmed — waiting.`,
          );
        }
      }

      try {
        await supabaseAdmin.from("transaction_ledger").insert({
          user_id: userId,
          type: purchaseType === "license" ? "license_purchase" : "investment",
          amount: txData.amount,
          description:
            purchaseType === "license"
              ? `License via KoraPay (${metadata.licenseType || txData.node_key})`
              : `GPU Node via KoraPay (${txData.node_key}) — ${metadata.miningPeriod || "daily"}`,
          created_at: now,
        });
      } catch {}

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
              ? "Your operator license is now active."
              : `Your ${metadata.miningPeriod || "daily"} GPU mining session is live.`,
          created_at: now,
        });
      } catch {}

      console.log(
        "[korapay/webhook] ✓ Processed:",
        reference,
        "type:",
        purchaseType,
      );
      return NextResponse.json({ success: true, processed: true });
    } catch (err: any) {
      console.error("[korapay/webhook] Processing error:", err);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  if (event === "charge.failed" || event === "charge.declined") {
    await supabaseAdmin
      .from("payment_transactions")
      .update({ status: "declined", updated_at: new Date().toISOString() })
      .eq("gateway_reference", reference);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: true });
}
