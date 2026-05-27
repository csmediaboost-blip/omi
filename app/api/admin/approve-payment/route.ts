// app/api/admin/approve-payment/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIXES:
//  FIX-1  Accepts paymentId (number/string) — matches PaymentsClient which
//         sends paymentId, not reference. Old route read `reference` → crash.
//  FIX-2  Creates node_allocations OR operator_licenses immediately based on
//         purchaseType in metadata. Old route only updated users.tier.
//  FIX-3  Idempotency guard — safe to call twice.
//  FIX-4  All mining fields set correctly (mining_period, mining_ends_at, etc.)
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const PERIOD_DURATIONS_MS: Record<string, number> = {
  hourly: 1 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getAdminSupabase();

    // FIX-1: Read paymentId (what PaymentsClient sends), fall back to reference
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
        { error: "paymentId is required" },
        { status: 400 },
      );
    }

    // Look up transaction by id (paymentId) OR gateway_reference
    let txn: any = null;
    if (paymentId) {
      const { data, error } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("id", paymentId)
        .single();
      if (error || !data) {
        return NextResponse.json(
          { error: `Transaction #${paymentId} not found` },
          { status: 404 },
        );
      }
      txn = data;
    } else {
      const { data, error } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("gateway_reference", reference)
        .single();
      if (error || !data) {
        return NextResponse.json(
          { error: "Transaction not found" },
          { status: 404 },
        );
      }
      txn = data;
    }

    // Idempotency — already confirmed
    if (txn.status === "confirmed" || txn.status === "completed") {
      return NextResponse.json({
        success: true,
        alreadyConfirmed: true,
        message: "Already confirmed — checking allocation...",
      });
    }

    const metadata =
      typeof txn.metadata === "string"
        ? JSON.parse(txn.metadata || "{}")
        : txn.metadata || {};

    const now = new Date();
    const nowIso = now.toISOString();
    const userId = txn.user_id;
    const purchaseType = metadata.purchaseType || "gpu_plan";
    const planId = txn.node_key;

    // ── 1. Mark transaction confirmed ───────────────────────────────────────
    await supabase
      .from("payment_transactions")
      .update({
        status: "confirmed",
        verified_by_admin: true,
        confirmed_at: nowIso,
        updated_at: nowIso,
        ...(txHash ? { crypto_tx_hash: txHash } : {}),
      })
      .eq("id", txn.id);

    // ── 2. Activate: license OR GPU node ────────────────────────────────────
    if (purchaseType === "license") {
      // ── License activation ────────────────────────────────────────────────
      const licenseType = metadata.licenseType || planId || "operator_license";

      // Idempotency
      const { data: existingLic } = await supabase
        .from("operator_licenses")
        .select("id")
        .eq("user_id", userId)
        .eq("license_type", licenseType)
        .eq("status", "active")
        .limit(1);

      if (!existingLic || existingLic.length === 0) {
        const expiresAt = new Date(
          now.getTime() + 4 * 365 * 24 * 60 * 60 * 1000,
        ).toISOString();

        const { error: licErr } = await supabase
          .from("operator_licenses")
          .insert({
            user_id: userId,
            license_type: licenseType,
            status: "active",
            activated_at: nowIso,
            expires_at: expiresAt,
            amount_paid: txn.amount,
            transaction_ref: txn.gateway_reference || String(txn.id),
            created_at: nowIso,
          });

        if (licErr) {
          console.error(
            "[approve-payment] License insert failed:",
            licErr.message,
          );
          return NextResponse.json(
            { error: "License activation failed: " + licErr.message },
            { status: 500 },
          );
        }
      }

      // Notification
      try {
        await supabase.from("user_notifications").insert({
          user_id: userId,
          type: "license_activated",
          title: "🏆 License Activated!",
          body: "Your operator license is now active. Head to Tasks to start earning.",
          created_at: nowIso,
        });
      } catch {}

      return NextResponse.json({
        success: true,
        type: "license",
        licenseType,
        nodeKey: planId,
      });
    } else {
      // ── GPU node allocation ───────────────────────────────────────────────
      const paymentModel: "flexible" | "contract" =
        metadata.paymentModel === "contract" ? "contract" : "flexible";
      const miningPeriod = metadata.miningPeriod ?? "daily";
      const isContract = paymentModel === "contract";

      // Idempotency
      const { data: existingAlloc } = await supabase
        .from("node_allocations")
        .select("id")
        .eq("user_id", userId)
        .eq("plan_id", planId)
        .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
        .limit(1);

      if (existingAlloc && existingAlloc.length > 0) {
        return NextResponse.json({
          success: true,
          type: "gpu_plan",
          nodeKey: planId,
          allocationId: existingAlloc[0].id,
          alreadyExisted: true,
        });
      }

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

      // Fetch rate_factor
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
        amount_invested: txn.amount,
        status: "active",
        payment_model: paymentModel,
        instance_type: metadata.itype || "on_demand",
        total_earned: 0,
        total_withdrawn: 0,
        created_at: nowIso,
        updated_at: nowIso,
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
              lock_in_label:
                metadata.lockInLabel || metadata.contractLabel || null,
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
        console.error(
          "[approve-payment] Allocation insert failed:",
          allocErr.message,
        );
        return NextResponse.json(
          { error: "Node activation failed: " + allocErr.message },
          { status: 500 },
        );
      }

      // Notification
      try {
        await supabase.from("user_notifications").insert({
          user_id: userId,
          type: "mining_started",
          title: "⛏️ Mining Session Started!",
          body: `Your ${miningPeriod} GPU mining session is now live. Watch your earnings in the portfolio.`,
          created_at: nowIso,
        });
      } catch {}

      return NextResponse.json({
        success: true,
        type: "gpu_plan",
        nodeKey: planId,
        allocationId: newAlloc.id,
        miningPeriod,
      });
    }
  } catch (err: any) {
    console.error("[approve-payment] Unhandled error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
