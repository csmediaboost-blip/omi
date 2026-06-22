// app/api/admin/approve-payment/route.ts
// SECURED: requireAdminAuth + audit logging + safe error messages
//
// BUG FIX: The previous `.update().eq("id", txn.id)` had no `.select()`,
// so Supabase would silently succeed even if 0 rows were updated (no error
// thrown). Added `.select("id, status")` + row-count check so the admin
// sees a real error instead of a false "success" with status still "pending".

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  requireAdminAuth,
  logAdminAction,
  getClientIp,
} from "@/lib/api-security";

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
  // ── SECURITY: Require admin session ──────────────────────────────────────
  const authResult = await requireAdminAuth(req);
  if (authResult instanceof Response) return authResult;
  const { userId: adminId } = authResult;

  try {
    const supabase = getAdminSupabase();

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

    // ── Fetch transaction ─────────────────────────────────────────────────
    let txn: Record<string, unknown>;

    if (paymentId) {
      const { data, error } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("id", paymentId)
        .single();
      if (error || !data) {
        console.error("[approve-payment] txn lookup by id failed:", error);
        return NextResponse.json(
          { error: "Transaction not found" },
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
        console.error(
          "[approve-payment] txn lookup by reference failed:",
          error,
        );
        return NextResponse.json(
          { error: "Transaction not found" },
          { status: 404 },
        );
      }
      txn = data;
    }

    // At this point txn is guaranteed to be defined — both branches either
    // return early with an error response or assign txn.
    if (txn.status === "confirmed" || txn.status === "completed") {
      return NextResponse.json({ success: true, note: "already_confirmed" });
    }

    const metadata =
      typeof txn.metadata === "string"
        ? JSON.parse((txn.metadata as string) || "{}")
        : (txn.metadata as Record<string, unknown>) || {};

    const now = new Date();
    const nowIso = now.toISOString();
    const userId = txn.user_id as string;
    const purchaseType = (metadata.purchaseType as string) || "gpu_plan";

    // ── Update status ─────────────────────────────────────────────────────
    // Use `.select()` so we can verify the row was actually updated.
    // Without it, Supabase returns no error even when 0 rows match.
    const { data: updatedRows, error: updateError } = await supabase
      .from("payment_transactions")
      .update({
        status: "confirmed",
        verified_by_admin: true,
        confirmed_at: nowIso,
        updated_at: nowIso,
        ...(txHash ? { tx_hash: txHash } : {}),
        ...(cryptoAmount ? { crypto_amount: cryptoAmount } : {}),
        ...(cryptoType ? { crypto_type: cryptoType } : {}),
        ...(walletAddress ? { wallet_address: walletAddress } : {}),
      })
      .eq("id", txn.id)
      .select("id, status"); // ← forces Supabase to return the updated row

    if (updateError) {
      console.error("[approve-payment] status update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update payment status: " + updateError.message },
        { status: 500 },
      );
    }

    if (!updatedRows || updatedRows.length === 0) {
      // This is the root cause of "shows pending" — the update ran but hit
      // 0 rows (e.g. RLS blocked it even with service role, or id mismatch).
      const msg = `[approve-payment] CRITICAL: update matched 0 rows for id=${txn.id}`;
      console.error(msg);
      return NextResponse.json(
        {
          error:
            "Payment row could not be updated — check RLS policies on payment_transactions",
        },
        { status: 500 },
      );
    }

    // ── Activation: license ───────────────────────────────────────────────
    if (purchaseType === "license") {
      const licenseType =
        (metadata.licenseType as string) ||
        (txn.node_key as string) ||
        "operator_license";
      const { data: existing } = await supabase
        .from("operator_licenses")
        .select("id")
        .eq("user_id", userId)
        .eq("license_type", licenseType)
        .eq("status", "active")
        .limit(1);

      if (!existing || existing.length === 0) {
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
            transaction_ref:
              (txn.gateway_reference as string) || String(txn.id),
            created_at: nowIso,
          });
        if (licErr)
          console.error("[approve-payment] license insert error:", licErr);
      }

      await logAdminAction(adminId, "approve_payment", "payment_transactions", {
        paymentId: txn.id,
        userId,
        amount: txn.amount,
        purchaseType,
        type: "license",
        ipAddress: getClientIp(req),
      });

      return NextResponse.json({
        success: true,
        processed: true,
        type: "license",
      });
    }

    // ── Activation: GPU node / mining session ─────────────────────────────
    const planId = txn.node_key as string;
    const { data: existing } = await supabase
      .from("node_allocations")
      .select("id")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
      .limit(1);

    if (!existing || existing.length === 0) {
      const paymentModel: "flexible" | "contract" =
        metadata.paymentModel === "contract" ? "contract" : "flexible";
      const miningPeriod = (metadata.miningPeriod as string) ?? "daily";
      const isContract = paymentModel === "contract";
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

      const allocationPayload: Record<string, unknown> = {
        user_id: userId,
        plan_id: planId,
        amount_invested: metadata.originalPrice ?? txn.amount,
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

      const { error: allocErr } = await supabase
        .from("node_allocations")
        .insert(allocationPayload);
      if (allocErr)
        console.error(
          "[approve-payment] node_allocation insert error:",
          allocErr,
        );
    }

    // ── In-app notification to user ───────────────────────────────────────
    try {
      await supabase.from("user_notifications").insert({
        user_id: userId,
        type: "mining_started",
        title: "⛏️ Mining Session Started!",
        body: `Your ${(metadata.miningPeriod as string) || "daily"} GPU mining session is live.`,
        created_at: nowIso,
      });
    } catch (notifErr) {
      console.error("[approve-payment] notification insert error:", notifErr);
    }

    await logAdminAction(adminId, "approve_payment", "payment_transactions", {
      paymentId: txn.id,
      userId,
      amount: txn.amount,
      purchaseType,
      miningPeriod: metadata.miningPeriod,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      processed: true,
      type: "mining",
      miningPeriod: metadata.miningPeriod,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[approve-payment] unhandled error:", msg);
    return NextResponse.json(
      { error: "Payment approval failed" },
      { status: 500 },
    );
  }
}
