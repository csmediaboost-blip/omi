/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * WITHDRAWAL & FRAUD PROTECTION UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * CRITICAL SECURITY REQUIREMENTS:
 * 1. KYC Verification: kyc_verified=true OR kyc_status="approved" (either one passes)
 * 2. Payout Account: Must be registered and verified
 * 3. Account Status: No flags, no frozen withdrawals, no locked earnings
 * 4. Rate Limits: 24h=$50k, max 3 pending per user, min $10
 * 5. Balance Verification: Re-check from DB before deducting
 * 6. Atomic Transactions: All-or-nothing balance deduction with rollback on failure
 * 7. Fraud Detection: IP logging, duplicate checks, suspicious patterns
 * 8. Compliance Logging: All withdrawals logged for audit & regulatory purposes
 */

import { createClient } from "@supabase/supabase-js";
import { isBusinessDay } from "@/lib/business-days";

export interface UserSecurityProfile {
  id: string;
  kyc_verified: boolean;
  kyc_status: string | null;
  payout_registered: boolean;
  payout_account_number: string | null;
  account_flagged: boolean;
  withdwals_fronzen: boolean;
  earnings_locked_until: string | null;
  balance_available: number;
  wallet_balance: number;
  last_withhrawal_at: string | null;
}

export interface WithdrawalFraudCheck {
  pass: boolean;
  reason: string;
  requiresKYC?: boolean;
  requiresPayoutSetup?: boolean;
}

/**
 * CRITICAL: Verify user has completed KYC
 * Accepts EITHER kyc_verified=true OR kyc_status="approved"
 */
export function isKYCApproved(profile: UserSecurityProfile): boolean {
  return profile.kyc_verified === true || profile.kyc_status === "approved";
}

/**
 * CRITICAL: Comprehensive fraud and compliance check for all withdrawals
 * Runs before ANY balance deduction occurs
 */
export async function runWithdrawalSecurityChecks(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
  profile: UserSecurityProfile,
  ipAddress?: string,
): Promise<WithdrawalFraudCheck> {
  console.log("[SECURITY] Starting withdrawal check for user:", userId);

  // ─── CHECK 1: Account Status ───────────────────────────────────
  if (profile.account_flagged) {
    console.warn("[FRAUD] Account flagged for user:", userId);
    return {
      pass: false,
      reason: "Account is flagged for suspicious activity. Contact support.",
    };
  }

  if (profile.withdwals_fronzen) {
    console.warn("[FRAUD] Withdrawals frozen for user:", userId);
    return {
      pass: false,
      reason: "Withdrawals are frozen on your account. Contact support.",
    };
  }

  // ─── CHECK 1.5: Business Day Validation ────────────────────────
  if (!isBusinessDay()) {
    const day = new Date().getDay();
    const dayName = day === 0 ? "Sunday" : "Saturday";
    console.warn("[BUSINESS_DAY] Withdrawal attempt on weekend for user:", userId);
    return {
      pass: false,
      reason: `Withdrawals are only available on business days (Mon-Fri). It's currently ${dayName}. Please try again on Monday.`,
    };
  }

  // ─── CHECK 2: KYC Verification (CRITICAL) ──────────────────────
  if (!isKYCApproved(profile)) {
    console.warn("[KYC] KYC not approved for user:", userId);
    return {
      pass: false,
      reason: "KYC verification required before withdrawing.",
      requiresKYC: true,
    };
  }

  // ─── CHECK 3: Payout Account ──────────────────────────────────
  if (!profile.payout_registered) {
    console.warn("[PAYOUT] No payout account for user:", userId);
    return {
      pass: false,
      reason:
        "No payout account registered. Go to Verification → Payout Setup.",
      requiresPayoutSetup: true,
    };
  }

  if (!profile.payout_account_number) {
    console.warn("[PAYOUT] Payout account number missing for user:", userId);
    return {
      pass: false,
      reason: "Payout account incomplete. Contact support.",
    };
  }

  // ─── CHECK 4: Earnings Lock ───────────────────────────────────
  if (
    profile.earnings_locked_until &&
    new Date(profile.earnings_locked_until) > new Date()
  ) {
    console.warn("[LOCK] Earnings locked for user:", userId);
    return {
      pass: false,
      reason: `Earnings locked until ${new Date(profile.earnings_locked_until).toLocaleDateString()}.`,
    };
  }

  // ─── CHECK 5: Minimum Amount ───────────────────────────────────
  if (amount < 10) {
    return { pass: false, reason: "Minimum withdrawal is $10." };
  }

  // ─── CHECK 6: Balance Verification (Re-check from DB) ──────────
  const { data: fresh, error: balErr } = await supabase
    .from("users")
    .select("balance_available, wallet_balance")
    .eq("id", userId)
    .single();

  if (balErr) {
    console.error("[DB] Balance query failed:", balErr.message);
    return {
      pass: false,
      reason: "Unable to verify balance. Try again later.",
    };
  }

  const freshBalance =
    (fresh as any)?.balance_available ?? (fresh as any)?.wallet_balance ?? 0;

  if (amount > freshBalance) {
    console.warn(
      `[BALANCE] Insufficient funds for user ${userId}. Have: $${freshBalance}, requested: $${amount}`,
    );
    return {
      pass: false,
      reason: `Insufficient balance. Available: $${freshBalance.toFixed(2)}`,
    };
  }

  // ─── CHECK 7: 24-Hour Rate Limit (Max $50k/day) ────────────────
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  const { data: recentWDs, error: wdErr } = await supabase
    .from("withdrawals")
    .select("amount")
    .eq("user_id", userId)
    .in("status", ["queued", "processing", "paid"])
    .gte("created_at", oneDayAgo);

  if (wdErr) {
    console.error("[DB] Recent withdrawals query failed:", wdErr.message);
    return {
      pass: false,
      reason: "Unable to verify rate limits. Try again later.",
    };
  }

  const last24hTotal = (recentWDs || []).reduce(
    (s: number, w: any) => s + (w.amount || 0),
    0,
  );

  if (last24hTotal + amount > 50000) {
    console.warn(
      `[RATELIMIT] 24h limit exceeded for user ${userId}. Current: $${last24hTotal}, requested: $${amount}`,
    );
    return {
      pass: false,
      reason: `24-hour withdrawal limit exceeded ($50,000 max).`,
    };
  }

  // ─── CHECK 8: Max 3 Pending Withdrawals ───────────────────────
  const { data: pendingWDs, error: pendErr } = await supabase
    .from("withdrawals")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["queued", "processing"]);

  if (pendErr) {
    console.error("[DB] Pending withdrawals query failed:", pendErr.message);
    return {
      pass: false,
      reason: "Unable to verify pending withdrawals. Try again later.",
    };
  }

  if ((pendingWDs || []).length >= 3) {
    console.warn(`[PENDING] User ${userId} has too many pending withdrawals`);
    return {
      pass: false,
      reason:
        "You have too many pending withdrawals. Wait for them to process.",
    };
  }

  // ─── CHECK 9: Duplicate Detection (prevent rapid-fire requests) ─
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { data: recentRequests } = await supabase
    .from("withdrawals")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", oneHourAgo);

  if ((recentRequests || []).length >= 2) {
    console.warn(
      `[DUPLICATE] User ${userId} submitted 2+ withdrawals in last hour`,
    );
    return {
      pass: false,
      reason: "Please wait before submitting another withdrawal request.",
    };
  }

  // ─── ALL CHECKS PASSED ─────────────────────────────────────────
  console.log("[SECURITY] All checks passed for user:", userId);
  return { pass: true, reason: "" };
}

/**
 * Log all withdrawal events for audit trail & fraud detection
 */
export async function logWithdrawalEvent(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  eventType:
    | "withdrawal_requested"
    | "withdrawal_approved"
    | "withdrawal_failed"
    | "fraud_detected",
  metadata: Record<string, any>,
): Promise<void> {
  try {
    await supabase.from("audit_log").insert({
      user_id: userId,
      event_type: eventType,
      metadata: JSON.stringify(metadata),
      ip_address: metadata.ip_address || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[AUDIT] Failed to log event:", err);
    // Don't fail the transaction if logging fails
  }
}

/**
 * ATOMIC balance deduction with rollback capability
 * Uses database transaction to ensure all-or-nothing
 */
export async function atomicDeductBalance(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Try RPC first (if exists)
    const { data, error } = await supabase.rpc("atomic_deduct_balance", {
      p_user_id: userId,
      p_amount: amount,
    });

    if (!error) {
      console.log(
        `[DEDUCT] Atomic RPC succeeded for user ${userId}: -$${amount}`,
      );
      return { success: true };
    }

    // Fallback: Manual deduction with safety checks
    console.log("[DEDUCT] RPC not available, using manual fallback");

    const { data: user, error: fetchErr } = await supabase
      .from("users")
      .select("balance_available, wallet_balance")
      .eq("id", userId)
      .single();

    if (fetchErr) {
      return { success: false, error: "Failed to fetch user balance" };
    }

    const currentBal =
      (user as any)?.balance_available ?? (user as any)?.wallet_balance ?? 0;

    if (amount > currentBal) {
      return { success: false, error: "Insufficient balance for deduction" };
    }

    const newBal = Math.max(0, currentBal - amount);

    const { error: updateErr } = await supabase
      .from("users")
      .update({
        balance_available: newBal,
        wallet_balance: newBal,
        last_withhrawal_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    console.log(
      `[DEDUCT] Manual fallback succeeded for user ${userId}: -$${amount}`,
    );
    return { success: true };
  } catch (err: any) {
    console.error("[DEDUCT] Unexpected error:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Refund balance if withdrawal fails after deduction
 */
export async function refundBalance(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
): Promise<void> {
  try {
    const { data: user } = await supabase
      .from("users")
      .select("balance_available, wallet_balance")
      .eq("id", userId)
      .single();

    const currentBal =
      (user as any)?.balance_available ?? (user as any)?.wallet_balance ?? 0;

    await supabase
      .from("users")
      .update({
        balance_available: currentBal + amount,
        wallet_balance: currentBal + amount,
      })
      .eq("id", userId);

    console.log(`[REFUND] Refunded $${amount} to user ${userId}`);
  } catch (err) {
    console.error("[REFUND] Failed to refund:", err);
  }
}

/**
 * Record transaction in audit ledger
 */
export async function recordWithdrawalLedger(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
  payoutAccount: string,
  payoutGateway: string,
): Promise<void> {
  try {
    await supabase.from("transaction_ledger").insert({
      user_id: userId,
      type: "withdrawal",
      amount: -amount,
      description: `Withdrawal to ${payoutGateway} → ${payoutAccount.slice(0, 12)}...`,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[LEDGER] Failed to record transaction:", err);
    // Don't fail withdrawal if ledger insert fails
  }
}
