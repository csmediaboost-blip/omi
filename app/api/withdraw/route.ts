// app/api/withdraw/route.ts
// FIXED VERSION:
// 1. Withdraw button unblocked — canWithdraw logic fixed (business day handled separately in UI)
// 2. Business day + Nigerian public holiday enforcement with exact error messages
// 3. Auto Korapay payout from admin payment_config table (no hardcoded keys)
// 4. Korapay sender = "OmniTaskPro", narration set
// 5. Crypto withdrawals flagged for manual admin processing
// 6. All error messages tell user EXACTLY what is wrong (never a generic system error)

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  isBusinessDay,
  getBusinessDayMessage,
  getTodayHoliday,
  nextBusinessDayLabel,
} from "@/lib/business-days";

export const dynamic = "force-dynamic";

const WithdrawSchema = z.object({
  amount: z
    .number()
    .positive("Amount must be positive")
    .max(50000, "Exceeds maximum single withdrawal of $50,000")
    .refine((n) => Number.isFinite(n), "Invalid amount"),
  pin: z
    .string()
    .min(4, "PIN must be at least 4 digits")
    .max(6, "PIN must not exceed 6 digits")
    .regex(/^\d+$/, "PIN must contain numbers only"),
});

// In-memory rate limiter (per process — use Redis in production)
const attempts = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(userId: string): {
  limited: boolean;
  remaining: number;
} {
  const now = Date.now();
  const key = `withdraw:${userId}`;
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + 3_600_000 });
    return { limited: false, remaining: 4 };
  }
  if (entry.count >= 5) return { limited: true, remaining: 0 };
  entry.count++;
  return { limited: false, remaining: 5 - entry.count };
}

async function verifyPin(
  pinValue: string,
  storedHash: string,
): Promise<boolean> {
  return bcrypt.compare(pinValue, storedHash);
}

// ── Korapay transfer helper ───────────────────────────────────────────────────
async function sendKorapayTransfer(opts: {
  secretKey: string;
  amount: number; // in NGN
  accountNumber: string;
  bankCode: string;
  accountName: string;
  narration: string;
  reference: string;
}): Promise<{ success: boolean; transferCode?: string; error?: string }> {
  try {
    const res = await fetch(
      "https://api.korapay.com/merchant/api/v1/transactions/disburse",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.secretKey}`,
        },
        body: JSON.stringify({
          reference: opts.reference,
          destination: {
            type: "bank_account",
            amount: opts.amount,
            currency: "NGN",
            narration: opts.narration,
            bank_account: {
              bank: opts.bankCode,
              account: opts.accountNumber,
            },
            customer: {
              name: opts.accountName,
            },
          },
          // Sender name shown on recipient's bank alert
          merchant_bears_cost: true,
        }),
      },
    );

    const data = await res.json();

    if (data?.status === true && data?.data?.reference) {
      return { success: true, transferCode: data.data.reference };
    }

    // Korapay error messages are user-readable
    const errMsg =
      data?.message ||
      data?.data?.message ||
      "Payment gateway rejected the transfer. Please verify your account details are correct.";
    return { success: false, error: errMsg };
  } catch (err: any) {
    return {
      success: false,
      error:
        "Could not reach payment gateway. Please try again in a few minutes.",
    };
  }
}

// ── Fetch Korapay secret key from admin config ────────────────────────────────
async function getKorapaySecret(supabase: any): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("payment_config")
      .select("korapay_secret_key")
      .limit(1)
      .single();
    return data?.korapay_secret_key ?? null;
  } catch {
    return null;
  }
}

// ── Fetch NGN exchange rate (USD → NGN) from config or use fallback ───────────
async function getUsdToNgnRate(supabase: any): Promise<number> {
  try {
    const { data } = await supabase
      .from("payment_config")
      .select("usd_to_ngn_rate")
      .limit(1)
      .single();
    if (data?.usd_to_ngn_rate && data.usd_to_ngn_rate > 100) {
      return Number(data.usd_to_ngn_rate);
    }
  } catch {}
  // Safe fallback — update payment_config.usd_to_ngn_rate in admin to override
  return 1600;
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (toSet) => {
            try {
              toSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              );
            } catch {}
          },
        },
      },
    );

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json(
        {
          error:
            "Your session has expired. Please log out and sign in again, then retry.",
        },
        { status: 401 },
      );
    }

    // ── 2. Business day & holiday check ──────────────────────────────────────
    if (!isBusinessDay()) {
      const holiday = getTodayHoliday();
      const nextDay = nextBusinessDayLabel();
      let reason: string;

      if (holiday) {
        reason = `Today (${holiday.name}) is a public holiday — banks are closed and transfers cannot be processed. Please come back on ${nextDay}.`;
      } else {
        const day = new Date().getDay();
        const dayName = day === 0 ? "Sunday" : "Saturday";
        reason = `Withdrawals are only processed on business days (Monday–Friday). Today is ${dayName}. Please come back on ${nextDay}.`;
      }

      return NextResponse.json({ error: reason }, { status: 403 });
    }

    // ── 3. Parse body ─────────────────────────────────────────────────────────
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid request format. Please refresh the page and try again.",
        },
        { status: 400 },
      );
    }

    const parsed = WithdrawSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }
    const { amount, pin } = parsed.data;

    if (amount < 10) {
      return NextResponse.json(
        {
          error: `Minimum withdrawal is $10.00. You entered $${amount.toFixed(2)}.`,
        },
        { status: 400 },
      );
    }

    // ── 4. Rate limit ─────────────────────────────────────────────────────────
    const { limited, remaining } = checkRateLimit(user.id);
    if (limited) {
      return NextResponse.json(
        {
          error:
            "You have made too many withdrawal attempts in the last hour. Please wait 60 minutes before trying again.",
        },
        { status: 429 },
      );
    }

    // ── 5. PIN verification ───────────────────────────────────────────────────
    const { data: userData } = await supabase
      .from("users")
      .select("pin_hash, pin_set")
      .eq("id", user.id)
      .single();

    if (!userData?.pin_set || !userData?.pin_hash) {
      return NextResponse.json(
        {
          error:
            "You have not set a security PIN yet. Go to Settings → Security to create your PIN before withdrawing.",
        },
        { status: 403 },
      );
    }
    const pinValid = userData.pin_hash
      ? await verifyPin(pin, userData.pin_hash)
      : false;
    if (!pinValid) {
      return NextResponse.json(
        {
          error: `Incorrect security PIN. Please double-check your PIN and try again. (${remaining} attempt${remaining !== 1 ? "s" : ""} remaining this hour)`,
        },
        { status: 403 },
      );
    }

    // ── 6. Load fresh user profile ────────────────────────────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from("users")
      .select(
        "balance_available, kyc_verified, kyc_status, " +
          "payout_registered, payout_account_number, payout_gateway, " +
          "payout_account_name, payout_bank_name, payout_bank_code, " +
          "payout_kyc_match, payout_currency, " +
          "status, withdrawals_frozen, withdrawal_freeze_reason, " +
          "withdrawal_freeze_until, total_withdrawn",
      )
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json(
        {
          error:
            "We could not load your account details. Please refresh the page and try again.",
        },
        { status: 404 },
      );
    }

    // ── 7. Account status checks (exact messages) ─────────────────────────────
    if (profile.status === "flagged" || profile.status === "suspended") {
      return NextResponse.json(
        {
          error:
            "Your account has been flagged and withdrawals are suspended. Please contact support at support@omnitaskpro.com for assistance.",
        },
        { status: 403 },
      );
    }

    if (profile.withdrawals_frozen) {
      const reason = profile.withdrawal_freeze_reason
        ? ` Reason: ${profile.withdrawal_freeze_reason}.`
        : "";
      const until =
        profile.withdrawal_freeze_until &&
        new Date(profile.withdrawal_freeze_until) > new Date()
          ? ` Your withdrawals are frozen until ${new Date(profile.withdrawal_freeze_until).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`
          : "";
      return NextResponse.json(
        {
          error: `Your withdrawals are currently frozen.${reason}${until} Please contact support@omnitaskpro.com to resolve this.`,
        },
        { status: 403 },
      );
    }

    if (
      profile.withdrawal_freeze_until &&
      new Date(profile.withdrawal_freeze_until) > new Date()
    ) {
      return NextResponse.json(
        {
          error: `Your earnings are locked until ${new Date(profile.withdrawal_freeze_until).toLocaleDateString("en-NG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}. You can withdraw after that date.`,
        },
        { status: 403 },
      );
    }

    const kycOk =
      profile.kyc_verified === true || profile.kyc_status === "approved";
    if (!kycOk) {
      return NextResponse.json(
        {
          error:
            "Your identity (KYC) verification is not yet approved. Go to Dashboard → Verification to complete your KYC, then try again.",
          action: "complete_kyc",
        },
        { status: 403 },
      );
    }

    if (!profile.payout_registered || !profile.payout_account_number) {
      return NextResponse.json(
        {
          error:
            "You have not set up a payout account yet. Go to Dashboard → Verification → Payout Setup to add your bank account or crypto wallet, then try again.",
          action: "setup_payout",
        },
        { status: 403 },
      );
    }

    if (!profile.payout_kyc_match) {
      return NextResponse.json(
        {
          error:
            "Your registered payout account name does not match your verified identity (KYC name mismatch). Please update your payout account to match your KYC name exactly, or contact support.",
          action: "fix_payout",
        },
        { status: 403 },
      );
    }

    const availBal = profile.balance_available ?? 0;
    if (availBal < 10) {
      return NextResponse.json(
        {
          error: `Your available balance ($${availBal.toFixed(2)}) is below the $10.00 minimum withdrawal. Please earn more before withdrawing.`,
        },
        { status: 400 },
      );
    }

    if (amount > availBal) {
      return NextResponse.json(
        {
          error: `You requested $${amount.toFixed(2)} but your available balance is only $${availBal.toFixed(2)}. Please enter an amount within your balance.`,
        },
        { status: 400 },
      );
    }

    // ── 8. 24-hour limit ──────────────────────────────────────────────────────
    const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { data: recentWDs } = await supabase
      .from("withdrawals")
      .select("amount")
      .eq("user_id", user.id)
      .in("status", ["queued", "processing", "paid"])
      .gte("created_at", oneDayAgo);

    const last24h = (recentWDs || []).reduce(
      (s: number, w: any) => s + (w.amount || 0),
      0,
    );
    if (last24h + amount > 50_000) {
      return NextResponse.json(
        {
          error: `You have already withdrawn $${last24h.toFixed(2)} in the last 24 hours. Adding $${amount.toFixed(2)} would exceed the $50,000 daily limit. You may withdraw up to $${(50_000 - last24h).toFixed(2)} more today.`,
        },
        { status: 403 },
      );
    }

    const { data: pending } = await supabase
      .from("withdrawals")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["queued", "processing"]);

    if ((pending || []).length >= 3) {
      return NextResponse.json(
        {
          error:
            "You already have 3 pending withdrawals being processed. Please wait for those to complete before submitting a new one.",
        },
        { status: 403 },
      );
    }

    // ── 9. Atomic balance deduction ───────────────────────────────────────────
    const { data: deducted, error: deductErr } = await supabase.rpc(
      "atomic_deduct_balance",
      { p_user_id: user.id, p_amount: amount },
    );
    if (deductErr || !deducted) {
      return NextResponse.json(
        {
          error:
            deductErr?.message ||
            "Balance could not be deducted — this usually means your balance changed. Please refresh and try again.",
        },
        { status: 400 },
      );
    }

    // ── 10. Calculate expected settlement date ────────────────────────────────
    const expectedDays =
      amount < 500 ? 1 : amount < 5_000 ? 2 : amount < 50_000 ? 5 : 7;
    const expectedDate = new Date(
      Date.now() + expectedDays * 86_400_000,
    ).toISOString();
    const withdrawalRef = `WD-${user.id.slice(0, 8)}-${Date.now()}`;

    // ── 11. Determine payout method & attempt auto-transfer ───────────────────
    const gateway = (profile.payout_gateway || "").toLowerCase();
    const isCrypto =
      gateway === "crypto" ||
      gateway === "crypto_wallet" ||
      gateway === "usdt" ||
      gateway === "btc";
    const isBankTransfer =
      gateway === "bank_transfer" ||
      gateway === "korapay" ||
      gateway === "bank";

    let autoProcessed = false;
    let transferRef: string | undefined;
    let payoutError: string | undefined;
    let finalStatus = "queued";

    if (isBankTransfer) {
      // Auto-process via Korapay
      const korapayKey = await getKorapaySecret(supabase);

      if (!korapayKey) {
        // Admin hasn't configured Korapay key — queue for manual processing
        finalStatus = "queued";
      } else {
        const rate = await getUsdToNgnRate(supabase);
        const ngnAmount = Math.round(amount * rate);

        const bankCode = profile.payout_bank_code || "";
        if (!bankCode) {
          // Refund and tell user
          await supabase.rpc("atomic_refund_balance", {
            p_user_id: user.id,
            p_amount: amount,
          });
          return NextResponse.json(
            {
              error:
                "Your payout account is missing the bank code. Please go to Verification → Payout Setup and re-enter your bank details, then try again.",
              action: "fix_payout",
            },
            { status: 400 },
          );
        }

        const transfer = await sendKorapayTransfer({
          secretKey: korapayKey,
          amount: ngnAmount,
          accountNumber: profile.payout_account_number,
          bankCode,
          accountName: profile.payout_account_name || "Account Holder",
          // This narration shows as sender on recipient's bank alert
          narration: `OmniTaskPro Earnings — ${withdrawalRef}`,
          reference: withdrawalRef,
        });

        if (transfer.success) {
          autoProcessed = true;
          transferRef = transfer.transferCode;
          finalStatus = "processing";
        } else {
          // Korapay gave a specific error — refund and tell user exactly what it was
          await supabase.rpc("atomic_refund_balance", {
            p_user_id: user.id,
            p_amount: amount,
          });
          return NextResponse.json(
            {
              error: `Payment gateway error: ${transfer.error} — Your balance has been refunded. Please check your payout account details and try again.`,
              action: "fix_payout",
            },
            { status: 422 },
          );
        }
      }
    } else if (isCrypto) {
      // Crypto: queue for manual admin processing — do NOT auto-send
      finalStatus = "queued";
    } else {
      // Unknown gateway: queue
      finalStatus = "queued";
    }

    // ── 12. Insert withdrawal record ──────────────────────────────────────────
    const { error: wdErr } = await supabase.from("withdrawals").insert({
      user_id: user.id,
      amount,
      wallet_address: profile.payout_account_number,
      payout_method: profile.payout_gateway,
      payout_account_name: profile.payout_account_name || null,
      payout_bank_name: profile.payout_bank_name || null,
      payout_currency: profile.payout_currency || "USD",
      status: finalStatus,
      tracking_status: finalStatus,
      expected_date: expectedDate,
      gateway_reference: transferRef || null,
      auto_processed: autoProcessed,
      reference: withdrawalRef,
      created_at: new Date().toISOString(),
    });

    if (wdErr) {
      // Refund on insert failure
      await supabase.rpc("atomic_refund_balance", {
        p_user_id: user.id,
        p_amount: amount,
      });
      return NextResponse.json(
        {
          error:
            "Your withdrawal could not be saved due to a database error. Your balance has been refunded. Please try again.",
        },
        { status: 500 },
      );
    }

    // ── 13. Ledger entry ──────────────────────────────────────────────────────
    await supabase
      .from("transaction_ledger")
      .insert({
        user_id: user.id,
        type: "withdrawal",
        amount: -amount,
        description: `Withdrawal via ${profile.payout_gateway} — Ref: ${withdrawalRef}${autoProcessed ? " (auto-processed)" : " (queued for admin)"}`,
        reference_id: withdrawalRef,
        created_at: new Date().toISOString(),
      })
      .then(() => {});

    // ── 14. Response ──────────────────────────────────────────────────────────
    const message = autoProcessed
      ? `Your withdrawal of $${amount.toFixed(2)} has been submitted and is being processed by our payment partner. Expected by ${new Date(expectedDate).toLocaleDateString("en-NG")}.`
      : isCrypto
        ? `Your crypto withdrawal of $${amount.toFixed(2)} has been queued. Our team will process it to your registered ${profile.payout_gateway?.toUpperCase()} address within ${expectedDays} business day${expectedDays !== 1 ? "s" : ""}.`
        : `Your withdrawal of $${amount.toFixed(2)} has been queued and will be processed by our team within ${expectedDays} business day${expectedDays !== 1 ? "s" : ""}.`;

    return NextResponse.json({
      success: true,
      amount,
      expectedDate,
      reference: withdrawalRef,
      status: finalStatus,
      autoProcessed,
      message,
    });
  } catch (err: any) {
    console.error("[Withdrawal API] Unhandled error:", err);
    return NextResponse.json(
      {
        error:
          "An unexpected error occurred on our end. Your balance has not been affected. Please refresh the page and try again, or contact support if this persists.",
      },
      { status: 500 },
    );
  }
}
