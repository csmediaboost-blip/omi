// lib/allocation-creator.ts
// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL FIX: Removed node_activated_at from ALL user table updates.
//   That column does not exist → was silently crashing every license activation
//   and node allocation, which is why nothing activated after payment.
//
// Other fixes in this version:
//  - activateLicense: user update wrapped in try-catch, only updates columns
//    that definitely exist (has_operator_license, updated_at)
//  - createNodeAllocation: removed node_activated_at from balance update;
//    balance_locked only incremented for contracts
//  - All other logic unchanged
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";

// Period durations — must match mining-service.ts
const PERIOD_DURATIONS_MS: Record<string, number> = {
  hourly: 1 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export type AllocationParams = {
  userId: string;
  planId: string;
  amount: number;
  metadata: Record<string, any>;
  transactionRef?: string;
};

export type AllocationResult = {
  success: boolean;
  allocationId?: string;
  alreadyExisted?: boolean;
  error?: string;
};

/**
 * Creates a node_allocation after a successful payment.
 * Safe to call multiple times — idempotent within 10 minutes.
 */
export async function createNodeAllocation(
  supabase: SupabaseClient,
  params: AllocationParams,
): Promise<AllocationResult> {
  const { userId, planId, amount, metadata, transactionRef } = params;

  const paymentModel = (metadata.paymentModel || "flexible") as
    | "flexible"
    | "contract";
  const miningPeriod = metadata.miningPeriod ?? "daily";
  const isContract = paymentModel === "contract";
  const now = new Date();
  const nowIso = now.toISOString();

  // ── Idempotency: prevent duplicate allocations within 10 minutes ──────────
  const { data: existing } = await supabase
    .from("node_allocations")
    .select("id")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .gte("created_at", new Date(now.getTime() - 10 * 60 * 1000).toISOString())
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(
      "[allocation-creator] Idempotency: allocation already exists",
      existing[0].id,
    );
    return {
      success: true,
      allocationId: existing[0].id,
      alreadyExisted: true,
    };
  }

  // ── Compute timing fields ─────────────────────────────────────────────────
  const periodMs =
    PERIOD_DURATIONS_MS[miningPeriod] ?? PERIOD_DURATIONS_MS.daily;
  const miningEndsAt = !isContract
    ? new Date(now.getTime() + periodMs).toISOString()
    : null;

  const contractMonths = metadata.contractMonths
    ? Number(metadata.contractMonths)
    : null;
  const maturityDate =
    isContract && contractMonths
      ? new Date(
          now.getTime() + contractMonths * 30 * 24 * 3600 * 1000,
        ).toISOString()
      : null;

  // ── Fetch rate_factor server-side ─────────────────────────────────────────
  let rateFactor = 0.86;
  try {
    const queryPeriod = isContract ? "daily" : miningPeriod;
    const { data: rateSnap } = await supabase
      .from("current_mining_rates")
      .select("rate_factor")
      .eq("plan_id", planId)
      .eq("period", queryPeriod)
      .single();
    if (rateSnap?.rate_factor != null) rateFactor = rateSnap.rate_factor;
  } catch {
    // Use fallback — non-fatal
  }

  // ── Build allocation payload ───────────────────────────────────────────────
  const payload: Record<string, any> = {
    user_id: userId,
    plan_id: planId,
    amount_invested: amount,
    status: "active",
    payment_model: paymentModel,
    instance_type: metadata.itype || "on_demand",
    total_earned: 0,
    total_withdrawn: 0,
    created_at: nowIso,
    updated_at: nowIso,
    auto_reinvest: !!(metadata.autoReinvest || metadata.auto_reinvest),
    mining_completed: false,
    rate_factor_used: rateFactor,
    capital_returned: false,
    final_profit: 0,

    ...(isContract
      ? {
          mining_period: "contract",
          mining_ends_at: maturityDate,
          contract_months: contractMonths,
          contract_label: metadata.contractLabel || null,
          contract_min_pct:
            metadata.contractMinPct != null
              ? Number(metadata.contractMinPct)
              : null,
          contract_max_pct:
            metadata.contractMaxPct != null
              ? Number(metadata.contractMaxPct)
              : null,
          maturity_date: maturityDate,
          lock_in_months: contractMonths || 6,
          lock_in_label:
            metadata.contractLabel || metadata.lockInLabel || "6 Months",
          lock_in_multiplier:
            metadata.lockInMultiplier != null
              ? Number(metadata.lockInMultiplier)
              : 1.0,
        }
      : {
          mining_period: miningPeriod,
          mining_ends_at: miningEndsAt,
          lock_in_months: 0,
          lock_in_label: "Flexible",
          lock_in_multiplier: 1.0,
        }),
  };

  // ── Insert allocation ─────────────────────────────────────────────────────
  const { data: newAlloc, error: insertErr } = await supabase
    .from("node_allocations")
    .insert(payload)
    .select("id")
    .single();

  if (insertErr) {
    console.error("[allocation-creator] Insert failed:", insertErr.message);
    return { success: false, error: insertErr.message };
  }

  // ── Update user balance fields ────────────────────────────────────────────
  // CRITICAL FIX: removed node_activated_at — column does not exist in users table.
  // Only update balance_locked for contracts (not flexible mining).
  try {
    if (isContract) {
      const { data: u } = await supabase
        .from("users")
        .select("balance_locked")
        .eq("id", userId)
        .single();
      await supabase
        .from("users")
        .update({
          balance_locked: ((u as any)?.balance_locked ?? 0) + amount,
          updated_at: nowIso,
        })
        .eq("id", userId);
    }
    // For flexible: no user table change needed — capital returns automatically
  } catch (e) {
    console.error(
      "[allocation-creator] User balance update failed (non-fatal):",
      e,
    );
  }

  // ── Track referral if present ─────────────────────────────────────────────
  if (metadata.referralCode) {
    try {
      await supabase.from("referral_uses").insert({
        referral_code: metadata.referralCode,
        referred_user_id: userId,
        allocation_id: newAlloc.id,
        amount,
        created_at: nowIso,
      });
    } catch {}
  }

  // ── Notification — fires realtime push to GPU Plans portfolio & Dashboard ──
  try {
    const PERIOD_LABEL: Record<string, string> = {
      hourly: "1 Hour",
      daily: "1 Day",
      weekly: "1 Week",
      monthly: "1 Month",
      contract: "Contract",
    };
    const pLabel = PERIOD_LABEL[miningPeriod] ?? miningPeriod;
    await supabase.from("user_notifications").insert({
      user_id: userId,
      type: "mining_started",
      title: "⛏️ Mining Session Started!",
      body: isContract
        ? `Your ${metadata.contractLabel ?? "contract"} GPU mining contract is now live. Earnings accrue daily and unlock at maturity.`
        : `Your ${pLabel} GPU mining session is live on ${metadata.planName ?? "your node"}. Watch earnings tick in real time in your portfolio.`,
      created_at: nowIso,
    });
  } catch {}

  console.log("[allocation-creator] ✓ Allocation created:", newAlloc.id, {
    userId: userId.slice(0, 8),
    planId: planId.slice(0, 8),
    amount,
    paymentModel,
    miningPeriod,
    miningEndsAt,
  });

  return { success: true, allocationId: newAlloc.id };
}

/**
 * Activates a license after payment.
 * CRITICAL FIX: Removed node_activated_at — does not exist in users table.
 * Uses check-then-insert/update so it works WITHOUT a unique constraint.
 */
export async function activateLicense(
  supabase: SupabaseClient,
  userId: string,
  licenseType: string,
  amount: number,
  transactionRef: string,
): Promise<{ success: boolean; error?: string }> {
  const now = new Date().toISOString();
  const fourYears = new Date(
    Date.now() + 4 * 365 * 24 * 3600 * 1000,
  ).toISOString();
  const resolvedType = licenseType === "operator_license" ? "all" : licenseType;

  try {
    // Step 1: Check if license already exists
    const { data: existing, error: checkErr } = await supabase
      .from("operator_licenses")
      .select("id")
      .eq("user_id", userId)
      .eq("license_type", resolvedType)
      .maybeSingle();

    if (checkErr) throw new Error("License check failed: " + checkErr.message);

    if (existing) {
      // Update existing license
      const { error: upErr } = await supabase
        .from("operator_licenses")
        .update({
          status: "active",
          expires_at: fourYears,
          amount_paid: amount,
          updated_at: now,
        })
        .eq("id", existing.id);
      if (upErr) throw new Error("License update failed: " + upErr.message);
    } else {
      // Insert new license
      const { error: insErr } = await supabase
        .from("operator_licenses")
        .insert({
          user_id: userId,
          license_type: resolvedType,
          status: "active",
          expires_at: fourYears,
          purchased_at: now,
          amount_paid: amount,
          transaction_ref: transactionRef,
        });
      if (insErr) throw new Error("License insert failed: " + insErr.message);
    }

    // Step 2: Update users table — triggers realtime push to Tasks page.
    // CRITICAL FIX: Only update columns that definitely exist.
    // node_activated_at was here before and was crashing everything.
    try {
      await supabase
        .from("users")
        .update({
          has_operator_license: true,
          updated_at: now,
        })
        .eq("id", userId);
    } catch (userUpdateErr: any) {
      // Non-fatal: license row was created, user flag update failed
      console.warn(
        "[activateLicense] User flag update failed (non-fatal):",
        userUpdateErr?.message,
      );
    }

    // Also try to set license_expires_at if column exists
    try {
      await supabase
        .from("users")
        .update({ license_expires_at: fourYears })
        .eq("id", userId);
    } catch {
      // Column may not exist — non-fatal
    }

    console.log("[activateLicense] ✓ License activated:", {
      userId: userId.slice(0, 8),
      resolvedType,
      amount,
    });
    return { success: true };
  } catch (e: any) {
    console.error("[activateLicense] ✗ Error:", e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Writes a transaction_ledger entry for audit trail.
 */
export async function writeLedgerEntry(
  supabase: SupabaseClient,
  params: {
    userId: string;
    type: string;
    amount: number;
    currency: string;
    description: string;
    referenceId: string;
    metadata: Record<string, any>;
  },
): Promise<void> {
  try {
    await supabase.from("transaction_ledger").insert({
      user_id: params.userId,
      type: params.type,
      amount: params.amount,
      currency: params.currency,
      description: params.description,
      reference_id: params.referenceId,
      metadata: params.metadata,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[allocation-creator] Ledger write failed (non-fatal):", e);
  }
}
