// app/api/admin/approve-payment/route.ts
// SECURED: requireAdminAuth + audit logging + safe error messages

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAuth, logAdminAction, getClientIp } from "@/lib/api-security";

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
    const { paymentId, reference, txHash, cryptoAmount, cryptoType, walletAddress } = body;

    if (!paymentId && !reference) {
      return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
    }

    let txn: any = null;
    if (paymentId) {
      const { data, error } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("id", paymentId)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
      }
      txn = data;
    } else {
      const { data, error } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("gateway_reference", reference)
        .single();
      if (error || !data) {
        return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
      }
      txn = data;
    }

    if (txn.status === "confirmed" || txn.status === "completed") {
      return NextResponse.json({ success: true, note: "already_confirmed" });
    }

    const metadata =
      typeof txn.metadata === "string"
        ? JSON.parse(txn.metadata || "{}")
        : txn.metadata || {};

    const now = new Date();
    const nowIso = now.toISOString();
    const userId = txn.user_id;
    const purchaseType = metadata.purchaseType || "gpu_plan";

    await supabase
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
      .eq("id", txn.id);

    if (purchaseType === "license") {
      const licenseType = metadata.licenseType || txn.node_key || "operator_license";
      const { data: existing } = await supabase
        .from("operator_licenses")
        .select("id")
        .eq("user_id", userId)
        .eq("license_type", licenseType)
        .eq("status", "active")
        .limit(1);

      if (!existing || existing.length === 0) {
        const expiresAt = new Date(now.getTime() + 4 * 365 * 24 * 60 * 60 * 1000).toISOString();
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
      }
    } else {
      const planId = txn.node_key;
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
        const miningPeriod = metadata.miningPeriod ?? "daily";
        const isContract = paymentModel === "contract";
        const periodMs = PERIOD_DURATIONS_MS[miningPeriod] ?? PERIOD_DURATIONS_MS.daily;
        const miningEndsAt = isContract ? null : new Date(now.getTime() + periodMs).toISOString();
        const contractMonths = Number(metadata.contractMonths) || 6;
        const maturityDate = isContract
          ? new Date(now.getTime() + contractMonths * 30 * 24 * 60 * 60 * 1000).toISOString()
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
                lock_in_label: metadata.lockInLabel || metadata.contractLabel || null,
                lock_in_multiplier: metadata.lockInMultiplier || 1.0,
                mining_completed: false,
                rate_factor_used: rateFactor,
                mining_period: "contract",
                mining_ends_at: maturityDate,
              }),
        };

        await supabase.from("node_allocations").insert(allocationPayload);
      }
    }

    try {
      await supabase.from("user_notifications").insert({
        user_id: userId,
        type: purchaseType === "license" ? "license_activated" : "mining_started",
        title: purchaseType === "license" ? "🏆 License Activated!" : "⛏️ Mining Session Started!",
        body:
          purchaseType === "license"
            ? "Your operator license is now active."
            : `Your ${metadata.miningPeriod || "daily"} GPU mining session is live.`,
        created_at: nowIso,
      });
    } catch {}

    await logAdminAction(adminId, "approve_payment", "payment_transactions", {
      paymentId: txn.id,
      userId,
      amount: txn.amount,
      purchaseType,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, processed: true });
  } catch (err: any) {
    console.error("[approve-payment] Error:", err);
    return NextResponse.json({ error: "Payment approval failed" }, { status: 500 });
  }
}