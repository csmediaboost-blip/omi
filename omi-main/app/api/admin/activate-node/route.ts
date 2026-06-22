// app/api/admin/activate-node/route.ts
// SECURED: requireAdminAuth + audit logging + safe error messages

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
  const authResult = await requireAdminAuth(req);
  if (authResult instanceof Response) return authResult;
  const { userId: adminId } = authResult;

  try {
    const supabase = getAdminSupabase();
    const { paymentId } = await req.json();

    if (!paymentId) {
      return NextResponse.json(
        { error: "paymentId is required" },
        { status: 400 },
      );
    }

    const { data: txn, error: txErr } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("id", paymentId)
      .single();

    if (txErr || !txn) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 },
      );
    }

    const metadata =
      typeof txn.metadata === "string"
        ? JSON.parse(txn.metadata || "{}")
        : txn.metadata || {};

    const now = new Date();
    const nowIso = now.toISOString();
    const userId = txn.user_id;
    const planId = txn.node_key;
    const purchaseType = metadata.purchaseType || "gpu_plan";

    if (purchaseType === "license") {
      const licenseType = metadata.licenseType || planId || "operator_license";
      const { data: existing } = await supabase
        .from("operator_licenses")
        .select("id")
        .eq("user_id", userId)
        .eq("license_type", licenseType)
        .eq("status", "active")
        .limit(1);

      if (existing && existing.length > 0) {
        return NextResponse.json({
          success: true,
          alreadyExisted: true,
          message: "License already active",
        });
      }

      const expiresAt = new Date(
        now.getTime() + 4 * 365 * 24 * 60 * 60 * 1000,
      ).toISOString();
      await supabase.from("operator_licenses").insert({
        user_id: userId,
        license_type: licenseType,
        status: "active",
        activated_at: nowIso,
        expires_at: expiresAt,
        amount_paid: txn.amount,
        transaction_ref: txn.gateway_reference || String(txn.id),
        created_at: nowIso,
      });

      await logAdminAction(
        adminId,
        "activate_node_license",
        "operator_licenses",
        {
          paymentId,
          userId,
          licenseType,
          ipAddress: getClientIp(req),
        },
      );
      return NextResponse.json({ success: true, type: "license", licenseType });
    }

    const { data: existing } = await supabase
      .from("node_allocations")
      .select("id")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({
        success: true,
        alreadyExisted: true,
        allocationId: existing[0].id,
      });
    }

    const paymentModel: "flexible" | "contract" =
      metadata.paymentModel === "contract" ? "contract" : "flexible";
    const miningPeriod = metadata.miningPeriod ?? "daily";
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

    const payload: Record<string, any> = {
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
      .insert(payload)
      .select("id")
      .single();

    if (allocErr) {
      return NextResponse.json(
        { error: "Node activation failed" },
        { status: 500 },
      );
    }

    await logAdminAction(adminId, "activate_node_gpu", "node_allocations", {
      paymentId,
      userId,
      planId,
      allocationId: newAlloc.id,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      type: "gpu_plan",
      allocationId: newAlloc.id,
      miningPeriod,
    });
  } catch (err: any) {
    console.error("[activate-node] Error:", err);
    return NextResponse.json(
      { error: "Node activation failed" },
      { status: 500 },
    );
  }
}
