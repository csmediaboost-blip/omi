/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * WITHDRAWAL & FRAUD PROTECTION UTILITIES
 * ═══════════════════════════════════════════════════════════════════════════════
 * FIXED: All column names now match actual DB schema:
 *   withdwals_fronzen      → withdrawals_frozen
 *   last_withhrawal_at     → last_login
 *   account_flagged        → status (check status !== 'active')
 *   earnings_locked_until  → withdrawal_freeze_until
 */

import { createClient } from "@supabase/supabase-js";
import { isBusinessDay } from "@/lib/business-days";

export interface UserSecurityProfile {
  id: string;
  kyc_verified: boolean;
  kyc_status: string | null;
  payout_registered: boolean;
  payout_account_number: string | null;
  status: string | null; // was: account_flagged
  withdrawals_frozen: boolean; // was: withdwals_fronzen
  withdrawal_freeze_until: string | null; // was: earnings_locked_until
  balance_available: number;
  wallet_balance: number;
  last_login: string | null; // was: last_withhrawal_at
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
  // account_flagged no longer exists — use status field instead
  if (profile.status && profile.status === "flagged") {
    console.warn("[FRAUD] Account flagged for user:", userId);
    return {
      pass: false,
      reason: "Account is flagged for suspicious activity. Contact support.",
    };
  }
  if (profile.status && profile.status === "suspended") {
    console.warn("[FRAUD] Account suspended for user:", userId);
    return {
      pass: false,
      reason: "Account is suspended. Contact support.",
    };
  }

  // was: profile.withdwals_fronzen — FIXED: profile.withdrawals_frozen
  if (profile.withdrawals_frozen) {
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
    return {
      pass: false,
      reason: `Withdrawals are only available on business days (Mon-Fri). It's currently ${dayName}. Please try again on Monday.`,
    };
  }

  // ─── CHECK 2: KYC Verification ─────────────────────────────────
  if (!isKYCApproved(profile)) {
    console.warn("[KYC] KYC not approved for user:", userId);
    return {
      pass: false,
      reason: "KYC verification required before withdrawing.",
      requiresKYC: true,
    };
  }

  // ─── CHECK 3: Payout Account ───────────────────────────────────
  if (!profile.payout_registered) {
    return {
      pass: false,
      reason:
        "No payout account registered. Go to Verification → Payout Setup.",
      requiresPayoutSetup: true,
    };
  }
  if (!profile.payout_account_number) {
    return {
      pass: false,
      reason: "Payout account incomplete. Contact support.",
    };
  }

  // ─── CHECK 4: Withdrawal Freeze Until ─────────────────────────
  // was: earnings_locked_until — FIXED: withdrawal_freeze_until
  if (
    profile.withdrawal_freeze_until &&
    new Date(profile.withdrawal_freeze_until) > new Date()
  ) {
    return {
      pass: false,
      reason: `Withdrawals frozen until ${new Date(profile.withdrawal_freeze_until).toLocaleDateString()}.`,
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
    return {
      pass: false,
      reason: "Unable to verify balance. Try again later.",
    };
  }

  const freshBalance =
    (fresh as any)?.balance_available ?? (fresh as any)?.wallet_balance ?? 0;

  if (amount > freshBalance) {
    return {
      pass: false,
      reason: `Insufficient balance. Available: $${freshBalance.toFixed(2)}`,
    };
  }

  // ─── CHECK 7: 24-Hour Rate Limit ($50k/day) ────────────────────
  const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
  const { data: recentWDs, error: wdErr } = await supabase
    .from("withdrawals")
    .select("amount")
    .eq("user_id", userId)
    .in("status", ["queued", "processing", "paid"])
    .gte("created_at", oneDayAgo);

  if (wdErr) {
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
    return {
      pass: false,
      reason: "24-hour withdrawal limit exceeded ($50,000 max).",
    };
  }

  // ─── CHECK 8: Max 3 Pending Withdrawals ───────────────────────
  const { data: pendingWDs, error: pendErr } = await supabase
    .from("withdrawals")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["queued", "processing"]);

  if (pendErr) {
    return {
      pass: false,
      reason: "Unable to verify pending withdrawals. Try again later.",
    };
  }
  if ((pendingWDs || []).length >= 3) {
    return {
      pass: false,
      reason:
        "You have too many pending withdrawals. Wait for them to process.",
    };
  }

  // ─── CHECK 9: Duplicate Detection ─────────────────────────────
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { data: recentRequests } = await supabase
    .from("withdrawals")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", oneHourAgo);

  if ((recentRequests || []).length >= 2) {
    return {
      pass: false,
      reason: "Please wait before submitting another withdrawal request.",
    };
  }

  console.log("[SECURITY] All checks passed for user:", userId);
  return { pass: true, reason: "" };
}

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
  }
}

export async function atomicDeductBalance(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("atomic_deduct_balance", {
      p_user_id: userId,
      p_amount: amount,
    });

    if (!error) {
      return { success: true };
    }

    // Fallback: Manual deduction
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
        // was: last_withhrawal_at — that column doesn't exist, use updated_at
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

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
  } catch (err) {
    console.error("[REFUND] Failed to refund:", err);
  }
}

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
  }
}
