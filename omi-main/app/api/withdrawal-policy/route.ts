// app/api/withdrawal-policy/route.ts
// GET  — returns current window + user eligibility snapshot
// POST — submits a withdrawal request

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getWithdrawalWindow,
  checkWithdrawalEligibility,
  calcWithdrawalFee,
  getLockStatus,
  getUserWithdrawalPolicy,
  currentWeekStart,
  assessWithdrawalRisk,
} from "@/lib/withdrawal-policy";
import { getHolidays } from "@/lib/holiday-calendar";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

async function getAuthUser(token: string) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  return client.auth.getUser();
}

// ─── GET — window status + user eligibility snapshot ─────────────────────────
export async function GET(req: NextRequest) {
  const token = extractToken(req);
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    data: { user },
    error: authErr,
  } = await getAuthUser(token);
  if (authErr || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = serviceClient();

  const [
    { data: settings },
    { data: profile },
    { data: allocations },
    weeklyWithdrawnResult,
    holidays,
  ] = await Promise.all([
    supabase.from("withdrawal_settings").select("*").single(),
    supabase
      .from("users")
      .select(
        "balance_available, kyc_verified, kyc_status, payout_registered, payout_account_number, pin_set, withdrawals_frozen, created_at, role",
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("node_allocations")
      .select(
        "id, plan_id, amount_invested, tier_index, created_at, lock_unlock_at, payment_model, mining_completed, status",
      )
      .eq("user_id", user.id)
      .eq("status", "active"),
    supabase.rpc("get_user_weekly_withdrawn", { p_user_id: user.id }),
    getHolidays(),
  ]);

  if (!profile)
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const weeklyWithdrawn = (weeklyWithdrawnResult.data as number) ?? 0;
  const adminPaused = settings?.global_paused ?? false;
  const window = getWithdrawalWindow(adminPaused, holidays);
  const allocTiers = (allocations ?? []).map(
    (a: { tier_index?: number }) => a.tier_index ?? 0,
  );

  const lockStatuses = (allocations ?? []).map(
    (a: {
      tier_index?: number;
      created_at: string;
      lock_unlock_at?: string;
    }) => {
      const tier = a.tier_index ?? 0;
      if (a.lock_unlock_at) {
        const unlock = new Date(a.lock_unlock_at);
        const isLocked = unlock > new Date();
        const remaining = unlock.getTime() - Date.now();
        return {
          isLocked,
          unlockDate: unlock,
          daysRemaining: Math.max(0, Math.ceil(remaining / 86_400_000)),
          hoursRemaining: Math.max(0, Math.ceil(remaining / 3_600_000)),
          lockDays: 0,
          tier,
        };
      }
      return getLockStatus(a.created_at, tier);
    },
  );

  const kycOk = !!(profile.kyc_verified || profile.kyc_status === "approved");
  const policy = getUserWithdrawalPolicy(allocTiers);
  const weeklyRemainingUSD = Math.max(0, policy.weeklyMaxUSD - weeklyWithdrawn);
  const feeSchedule = settings?.fee_schedule ?? null;

  return NextResponse.json({
    window: {
      state: window.state,
      isOpen: window.isOpen,
      nextWindowLabel: window.nextWindowLabel,
      todayHoliday: window.todayHoliday,
      currentWATHour: window.currentWATHour,
    },
    eligibility: {
      kycVerified: kycOk,
      payoutRegistered: !!profile.payout_registered,
      pinSet: !!profile.pin_set,
      frozen: !!profile.withdrawals_frozen,
      adminPaused,
    },
    balance: profile.balance_available ?? 0,
    policy: {
      tierName: policy.tierName,
      tier: policy.tier,
      weeklyMaxUSD: policy.weeklyMaxUSD,
      weeklyWithdrawnUSD: weeklyWithdrawn,
      weeklyRemainingUSD,
      quickAmounts: policy.quickAmounts,
      minWithdrawal: policy.minWithdrawal,
    },
    lockStatuses: lockStatuses.map((ls) => ({
      isLocked: ls.isLocked,
      daysRemaining: ls.daysRemaining,
      unlockDate:
        ls.unlockDate instanceof Date
          ? ls.unlockDate.toISOString()
          : new Date(ls.unlockDate).toISOString(),
      tier: ls.tier,
    })),
    feeSchedule: feeSchedule ?? [
      { maxAmount: 10, pct: 5 },
      { maxAmount: 100, pct: 2 },
      { maxAmount: null, pct: 1 },
    ],
  });
}

// ─── POST — submit withdrawal ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    data: { user },
    error: authErr,
  } = await getAuthUser(token);
  if (authErr || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = serviceClient();

  let body: { amount?: number; pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { amount, pin } = body;
  if (!amount || amount <= 0)
    return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
  if (!pin || pin.length < 4)
    return NextResponse.json({ error: "PIN required." }, { status: 400 });

  // ── Verify PIN ────────────────────────────────────────────────────────────
  const { data: ud, error: udErr } = await supabase
    .from("users")
    .select("pin_hash, pin_set")
    .eq("id", user.id)
    .single();

  if (udErr || !ud) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (!ud.pin_set || !ud.pin_hash) {
    return NextResponse.json(
      { error: "Security PIN not set. Please set your PIN in Settings first." },
      { status: 403 },
    );
  }

  // Hash the submitted PIN the same way it was stored
  const encoder = new TextEncoder();
  const hashBuf = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(pin + user.id),
  );
  const pinHash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (pinHash !== (ud as any).pin_hash) {
    return NextResponse.json(
      { error: "Incorrect PIN. Please try again." },
      { status: 403 },
    );
  }

  // ── Fetch all eligibility data ────────────────────────────────────────────
  const [
    { data: settings },
    { data: profile },
    { data: allocations },
    weeklyWithdrawnResult,
    holidays,
    recentAttemptsResult,
  ] = await Promise.all([
    supabase.from("withdrawal_settings").select("*").single(),
    supabase
      .from("users")
      .select(
        "balance_available, kyc_verified, kyc_status, payout_registered, payout_account_number, payout_bank_name, payout_gateway, payout_account_name, pin_set, withdrawals_frozen, created_at",
      )
      .eq("id", user.id)
      .single(),
    supabase
      .from("node_allocations")
      .select("id, tier_index, created_at, lock_unlock_at, amount_invested")
      .eq("user_id", user.id)
      .in("status", ["active", "matured"]),
    supabase.rpc("get_user_weekly_withdrawn", { p_user_id: user.id }),
    getHolidays(),
    supabase
      .from("withdrawal_audit_log")
      .select("id")
      .eq("user_id", user.id)
      .gte("created_at", new Date(Date.now() - 3_600_000).toISOString()),
  ]);

  if (!profile)
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const weeklyWithdrawn = (weeklyWithdrawnResult.data as number) ?? 0;
  // recentAttempts: count rows returned (select returns array, not count)
  const attemptsLastHour = Array.isArray(recentAttemptsResult.data)
    ? recentAttemptsResult.data.length
    : 0;

  // Check for duplicate payout account across users (soft flag only)
  const { data: dupAccounts } = await supabase
    .from("withdrawals")
    .select("user_id")
    .eq("payout_account_number", profile.payout_account_number ?? "NONE")
    .neq("user_id", user.id)
    .limit(1);
  const hasDuplicateAccount = (dupAccounts?.length ?? 0) > 0;

  const adminPaused = settings?.global_paused ?? false;
  const kycOk = !!(profile.kyc_verified || profile.kyc_status === "approved");
  const allocTiers = (allocations ?? []).map(
    (a: { tier_index?: number }) => a.tier_index ?? 0,
  );

  const lockStatuses = (allocations ?? []).map(
    (a: {
      tier_index?: number;
      created_at: string;
      lock_unlock_at?: string;
    }) => {
      if (a.lock_unlock_at) {
        const unlock = new Date(a.lock_unlock_at);
        const isLocked = unlock > new Date();
        const remaining = unlock.getTime() - Date.now();
        return {
          isLocked,
          unlockDate: unlock,
          daysRemaining: Math.max(0, Math.ceil(remaining / 86_400_000)),
          hoursRemaining: Math.max(0, Math.ceil(remaining / 3_600_000)),
          lockDays: 0,
          tier: a.tier_index ?? 0,
        };
      }
      return getLockStatus(a.created_at, a.tier_index ?? 0);
    },
  );

  const eligibility = checkWithdrawalEligibility({
    amount,
    availableBalance: profile.balance_available ?? 0,
    kycVerified: kycOk,
    payoutRegistered: !!profile.payout_registered,
    pinSet: !!profile.pin_set,
    frozen: !!profile.withdrawals_frozen,
    adminPaused,
    allocTiers,
    weeklyWithdrawnUSD: weeklyWithdrawn,
    lockStatuses,
    holidays,
  });

  if (!eligibility.eligible) {
    return NextResponse.json(
      {
        success: false,
        error: eligibility.reasons[0],
        reasons: eligibility.reasons,
      },
      { status: 422 },
    );
  }

  // ── Risk assessment (flags only — never blocks unless frozen/kyc) ─────────
  const accountAgeMs = Date.now() - new Date(profile.created_at).getTime();
  const risk = assessWithdrawalRisk({
    accountAgedays: Math.floor(accountAgeMs / 86_400_000),
    attemptsLastHour,
    currentAmount: amount,
    previousAmount: null,
    duplicatePayoutAccount: hasDuplicateAccount,
  });

  const fee = calcWithdrawalFee(amount, settings?.fee_schedule ?? undefined);
  const weekStart = currentWeekStart();
  const window = getWithdrawalWindow(adminPaused, holidays);

  // ── Submit withdrawal via atomic RPC ──────────────────────────────────────
  const { data: withdrawalId, error: rpcErr } = await supabase.rpc(
    "record_withdrawal_with_fee",
    {
      p_user_id: user.id,
      p_amount_gross: fee.grossAmount,
      p_amount_fee: fee.feeAmount,
      p_amount_net: fee.netAmount,
      p_fee_pct: fee.feePercent,
      p_tier: eligibility.policy.tier,
      p_week_start: weekStart,
      p_window_state: window.state,
      p_payout_method: profile.payout_gateway ?? "unknown",
      p_payout_acct_name: profile.payout_account_name ?? "",
      p_payout_bank: profile.payout_bank_name ?? "",
      p_payout_acct_num: profile.payout_account_number ?? "",
      p_risk_score: risk.riskScore,
      p_flagged: risk.flagged,
      p_flags: risk.flags,
    },
  );

  if (rpcErr) {
    console.error("[withdrawal] RPC error:", JSON.stringify(rpcErr));
    // Fallback: insert directly if RPC doesn't exist
    const { data: directInsert, error: insertErr } = await supabase
      .from("withdrawals")
      .insert({
        user_id: user.id,
        amount: fee.netAmount,
        amount_gross: fee.grossAmount,
        amount_fee: fee.feeAmount,
        amount_net: fee.netAmount,
        fee_pct: fee.feePercent,
        wallet_address: profile.payout_account_number ?? "",
        payout_method: profile.payout_gateway ?? "bank_transfer",
        payout_account_name: profile.payout_account_name ?? "",
        payout_bank_name: profile.payout_bank_name ?? "",
        status: risk.flagged ? "flagged" : "queued",
        flagged: risk.flagged,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error(
        "[withdrawal] Direct insert also failed:",
        JSON.stringify(insertErr),
      );
      return NextResponse.json(
        {
          success: false,
          error: "Withdrawal submission failed. Please try again.",
        },
        { status: 500 },
      );
    }

    // Deduct from balance
    await supabase
      .from("users")
      .update({
        balance_available: Math.max(
          0,
          (profile.balance_available ?? 0) - fee.grossAmount,
        ),
        total_withdrawn: fee.netAmount,
      })
      .eq("id", user.id);

    const isMonday = window.state === "OPEN";
    return NextResponse.json({
      success: true,
      withdrawal_id: (directInsert as any)?.id,
      message: risk.flagged
        ? `Withdrawal of $${fee.netAmount.toFixed(2)} is under review.`
        : isMonday
          ? `Withdrawal of $${fee.netAmount.toFixed(2)} submitted. Processing today by 16:00 WAT.`
          : `Withdrawal queued for ${window.nextWindowLabel}. You'll receive $${fee.netAmount.toFixed(2)}.`,
      fee: {
        gross: fee.grossAmount,
        fee: fee.feeAmount,
        net: fee.netAmount,
        pct: fee.feePercent,
      },
      flagged: risk.flagged,
    });
  }

  const isMonday = window.state === "OPEN";
  return NextResponse.json({
    success: true,
    withdrawal_id: withdrawalId,
    message: risk.flagged
      ? `Withdrawal of $${fee.netAmount.toFixed(2)} is under review (fee: $${fee.feeAmount.toFixed(2)}).`
      : isMonday
        ? `Withdrawal of $${fee.netAmount.toFixed(2)} submitted. Processing today by 16:00 WAT. Fee: $${fee.feeAmount.toFixed(2)}.`
        : `Withdrawal queued for ${window.nextWindowLabel}. You'll receive $${fee.netAmount.toFixed(2)} (fee: $${fee.feeAmount.toFixed(2)}).`,
    fee: {
      gross: fee.grossAmount,
      fee: fee.feeAmount,
      net: fee.netAmount,
      pct: fee.feePercent,
    },
    flagged: risk.flagged,
  });
}
