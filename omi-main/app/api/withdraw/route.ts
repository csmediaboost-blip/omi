// app/api/withdraw/route.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import {
  isBusinessDay,
  getTodayHoliday,
  nextBusinessDayLabel,
} from "@/lib/business-days";

export const dynamic = "force-dynamic";

// ─── NARRATION CONFIG ─────────────────────────────────────────────────────────
// This is what appears on the recipient's bank statement.
// Sender name ("OmniTask Pro") comes from your KoraPay merchant business name —
// set it once in: KoraPay Dashboard → Settings → Business Profile → Business Name.
const PLATFORM_NAME = "OmniTask Pro";

function buildNarration(amount: number, ref: string): string {
  // KoraPay narration field: max ~100 chars, visible on recipient bank statement.
  // Format: "OmniTask Pro - Earnings Payout NGN 4,800"
  // The ref is trimmed to keep it short and readable on mobile banking apps.
  const shortRef = ref.slice(-10).toUpperCase(); // e.g. "1234567890"
  return `${PLATFORM_NAME} - Earnings Payout | Ref: ${shortRef}`;
}

// ─── SCHEMA ───────────────────────────────────────────────────────────────────
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

// ─── RATE LIMITER ─────────────────────────────────────────────────────────────
// In-memory (per process) — swap for Redis in production for distributed deploys
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

// ─── PIN VERIFY ───────────────────────────────────────────────────────────────
async function verifyPin(
  pinValue: string,
  storedHash: string,
): Promise<boolean> {
  return bcrypt.compare(pinValue, storedHash);
}

// ─── KORAPAY TRANSFER ─────────────────────────────────────────────────────────
async function sendKorapayTransfer(opts: {
  secretKey: string;
  amount: number;      // NGN kobo value
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
            // ── NARRATION: shown on recipient's bank statement ────────────────
            // Sender name is your KoraPay merchant business name (set on dashboard).
            // This field is the transaction description line below the sender name.
            narration: opts.narration,
            bank_account: {
              bank: opts.bankCode,
              account: opts.accountNumber,
            },
            customer: {
              name: opts.accountName,
            },
          },
          merchant_bears_cost: true,
        }),
      },
    );
    const data = await res.json();
    if (data?.status === true && data?.data?.reference) {
      return { success: true, transferCode: data.data.reference };
    }
    return {
      success: false,
      error:
        data?.message ??
        data?.data?.message ??
        "Payment gateway rejected the transfer. Please verify your account details.",
    };
  } catch {
    return {
      success: false,
      error:
        "Could not reach payment gateway. Please try again in a few minutes.",
    };
  }
}

// ─── CONFIG HELPERS ───────────────────────────────────────────────────────────
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

async function getUsdToNgnRate(supabase: any): Promise<number> {
  try {
    const { data } = await supabase
      .from("payment_config")
      .select("usd_to_ngn_rate")
      .limit(1)
      .single();
    if (data?.usd_to_ngn_rate && data.usd_to_ngn_rate > 100)
      return Number(data.usd_to_ngn_rate);
  } catch {}
  return 1600;
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // ── 1. Auth ───────────────────────────────────────────────────────────────
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

    // ── 2. Business day & holiday check ───────────────────────────────────────
    if (!isBusinessDay()) {
      const holiday = getTodayHoliday();
      const nextDay = nextBusinessDayLabel();
      const day = new Date().getDay();
      const dayName = day === 0 ? "Sunday" : "Saturday";
      const reason = holiday
        ? `Today (${holiday.name}) is a public holiday — banks are closed. Please come back on ${nextDay}.`
        : `Withdrawals are only processed on business days (Monday–Friday). Today is ${dayName}. Please come back on ${nextDay}.`;
      return NextResponse.json({ error: reason }, { status: 403 });
    }

    // ── 3. Parse & validate body ──────────────────────────────────────────────
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request format. Please refresh and try again." },
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
            "Too many withdrawal attempts in the last hour. Please wait 60 minutes before trying again.",
        },
        { status: 429 },
      );
    }

    // ── 5. PIN verification ───────────────────────────────────────────────────
    const { data: pinData } = await supabase
      .from("users")
      .select("pin_hash, pin_set")
      .eq("id", user.id)
      .single();

    if (!pinData?.pin_set || !pinData?.pin_hash) {
      return NextResponse.json(
        {
          error:
            "You have not set a security PIN yet. Go to Settings → Security to create your PIN before withdrawing.",
        },
        { status: 403 },
      );
    }
    if (!(await verifyPin(pin, pinData.pin_hash))) {
      return NextResponse.json(
        {
          error: `Incorrect security PIN. (${remaining} attempt${remaining !== 1 ? "s" : ""} remaining this hour)`,
        },
        { status: 403 },
      );
    }

    // ── 6. Load profile ───────────────────────────────────────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from("users")
      .select(
        "balance_available, kyc_verified, kyc_status, payout_registered, payout_account_number, payout_gateway, payout_account_name, payout_bank_name, payout_bank_code, payout_kyc_match, payout_currency, status, withdrawals_frozen, withdrawal_freeze_reason, withdrawal_freeze_until, total_withdrawn",
      )
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json(
        {
          error:
            "We could not load your account details. Please refresh and try again.",
        },
        { status: 404 },
      );
    }

    // ── 7. Account status checks ──────────────────────────────────────────────
    const p = profile as any;

    if (p.status === "flagged" || p.status === "suspended") {
      return NextResponse.json(
        {
          error:
            "Your account has been flagged and withdrawals are suspended. Please contact support@omnitaskpro.com.",
        },
        { status: 403 },
      );
    }

    if (p.withdrawals_frozen) {
      const reason = p.withdrawal_freeze_reason
        ? ` Reason: ${p.withdrawal_freeze_reason}.`
        : "";
      const until =
        p.withdrawal_freeze_until &&
        new Date(p.withdrawal_freeze_until) > new Date()
          ? ` Frozen until ${new Date(p.withdrawal_freeze_until).toLocaleDateString("en-NG", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}.`
          : "";
      return NextResponse.json(
        {
          error: `Your withdrawals are currently frozen.${reason}${until} Contact support@omnitaskpro.com.`,
        },
        { status: 403 },
      );
    }

    if (
      p.withdrawal_freeze_until &&
      new Date(p.withdrawal_freeze_until) > new Date()
    ) {
      return NextResponse.json(
        {
          error: `Your earnings are locked until ${new Date(p.withdrawal_freeze_until).toLocaleDateString("en-NG", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}. You can withdraw after that date.`,
        },
        { status: 403 },
      );
    }

    const kycOk = p.kyc_verified === true || p.kyc_status === "approved";
    if (!kycOk) {
      return NextResponse.json(
        {
          error:
            "Your identity (KYC) verification is not yet approved. Go to Dashboard → Verification to complete it.",
          action: "complete_kyc",
        },
        { status: 403 },
      );
    }

    if (!p.payout_registered || !p.payout_account_number) {
      return NextResponse.json(
        {
          error:
            "You have not set up a payout account. Go to Dashboard → Verification → Payout Setup to add your bank account.",
          action: "setup_payout",
        },
        { status: 403 },
      );
    }

    if (!p.payout_kyc_match) {
      return NextResponse.json(
        {
          error:
            "Your payout account name does not match your verified identity. Please update your payout account to match your KYC name.",
          action: "fix_payout",
        },
        { status: 403 },
      );
    }

    const availBal = p.balance_available ?? 0;
    if (availBal < 10) {
      return NextResponse.json(
        {
          error: `Your available balance ($${availBal.toFixed(2)}) is below the $10.00 minimum withdrawal.`,
        },
        { status: 400 },
      );
    }
    if (amount > availBal) {
      return NextResponse.json(
        {
          error: `You requested $${amount.toFixed(2)} but your available balance is only $${availBal.toFixed(2)}.`,
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

    const last24h = (recentWDs ?? []).reduce(
      (s: number, w: any) => s + (w.amount ?? 0),
      0,
    );
    if (last24h + amount > 50_000) {
      return NextResponse.json(
        {
          error: `Daily limit reached. You can withdraw up to $${(50_000 - last24h).toFixed(2)} more today.`,
        },
        { status: 403 },
      );
    }

    const { data: pending } = await supabase
      .from("withdrawals")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["queued", "processing"]);

    if ((pending ?? []).length >= 3) {
      return NextResponse.json(
        {
          error:
            "You already have 3 pending withdrawals. Please wait for those to complete before submitting a new one.",
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
            deductErr?.message ??
            "Balance could not be deducted — please refresh and try again.",
        },
        { status: 400 },
      );
    }

    // ── 10. Settlement date ───────────────────────────────────────────────────
    const expectedDays =
      amount < 500 ? 1 : amount < 5_000 ? 2 : amount < 50_000 ? 5 : 7;
    const expectedDate = new Date(
      Date.now() + expectedDays * 86_400_000,
    ).toISOString();
    const withdrawalRef = `WD-${user.id.slice(0, 8)}-${Date.now()}`;

    // ── 11. Payout method & auto-transfer ─────────────────────────────────────
    const gateway = (p.payout_gateway ?? "").toLowerCase();
    const isCrypto = ["crypto", "crypto_wallet", "usdt", "btc"].includes(
      gateway,
    );
    const isBankTransfer = ["bank_transfer", "korapay", "bank"].includes(
      gateway,
    );

    let autoProcessed = false;
    let transferRef: string | undefined;
    let finalStatus = "queued";

    if (isBankTransfer) {
      const korapayKey = await getKorapaySecret(supabase);
      if (korapayKey) {
        const rate = await getUsdToNgnRate(supabase);
        const ngnAmount = Math.round(amount * rate);
        const bankCode = p.payout_bank_code ?? "";

        if (!bankCode) {
          await supabase.rpc("atomic_refund_balance", {
            p_user_id: user.id,
            p_amount: amount,
          });
          return NextResponse.json(
            {
              error:
                "Your payout account is missing the bank code. Please update it in Verification → Payout Setup.",
              action: "fix_payout",
            },
            { status: 400 },
          );
        }

        // ── Build narration ───────────────────────────────────────────────────
        // Recipient sees: "OmniTask Pro - Earnings Payout | Ref: XXXXXXXXXX"
        // on their mobile banking app / bank statement.
        // The SENDER NAME shown above this line comes from your KoraPay
        // merchant business name — set it to "OmniTask Pro" in:
        // KoraPay Dashboard → Settings → Business Profile → Business Name
        const narration = buildNarration(amount, withdrawalRef);

        const transfer = await sendKorapayTransfer({
          secretKey: korapayKey,
          amount: ngnAmount,
          accountNumber: p.payout_account_number,
          bankCode,
          accountName: p.payout_account_name ?? "Account Holder",
          narration,
          reference: withdrawalRef,
        });

        if (transfer.success) {
          autoProcessed = true;
          transferRef = transfer.transferCode;
          finalStatus = "processing";
        } else {
          await supabase.rpc("atomic_refund_balance", {
            p_user_id: user.id,
            p_amount: amount,
          });
          return NextResponse.json(
            {
              error: `Payment gateway error: ${transfer.error} — Your balance has been refunded.`,
              action: "fix_payout",
            },
            { status: 422 },
          );
        }
      }
      // No korapayKey → falls through to finalStatus = "queued"
    }

    // ── 12. Insert withdrawal record ──────────────────────────────────────────
    const { error: wdErr } = await supabase.from("withdrawals").insert({
      user_id: user.id,
      amount,
      wallet_address: p.payout_account_number,
      payout_method: p.payout_gateway,
      payout_account_name: p.payout_account_name ?? null,
      payout_bank_name: p.payout_bank_name ?? null,
      payout_currency: p.payout_currency ?? "USD",
      status: finalStatus,
      tracking_status: finalStatus,
      expected_date: expectedDate,
      gateway_reference: transferRef ?? null,
      auto_processed: autoProcessed,
      reference: withdrawalRef,
      created_at: new Date().toISOString(),
    });

    if (wdErr) {
      await supabase.rpc("atomic_refund_balance", {
        p_user_id: user.id,
        p_amount: amount,
      });
      return NextResponse.json(
        {
          error:
            "Your withdrawal could not be saved. Your balance has been refunded. Please try again.",
        },
        { status: 500 },
      );
    }

    // ── 13. Ledger entry (non-blocking) ───────────────────────────────────────
    const { error: ledgerErr } = await supabase
      .from("transaction_ledger")
      .insert({
        user_id: user.id,
        type: "withdrawal",
        amount: -amount,
        description: `${PLATFORM_NAME} payout via ${p.payout_gateway} — Ref: ${withdrawalRef}${autoProcessed ? " (auto-processed)" : " (queued for admin)"}`,
        reference_id: withdrawalRef,
        created_at: new Date().toISOString(),
      });
    if (ledgerErr)
      console.error("[withdraw] Ledger insert error:", ledgerErr.code);

    // ── 14. Response ──────────────────────────────────────────────────────────
    const message = autoProcessed
      ? `Your ${PLATFORM_NAME} withdrawal of $${amount.toFixed(2)} is being processed. Expected by ${new Date(expectedDate).toLocaleDateString("en-NG")}.`
      : isCrypto
        ? `Your ${PLATFORM_NAME} crypto withdrawal of $${amount.toFixed(2)} has been queued. Our team will process it within ${expectedDays} business day${expectedDays !== 1 ? "s" : ""}.`
        : `Your ${PLATFORM_NAME} withdrawal of $${amount.toFixed(2)} has been queued and will be processed within ${expectedDays} business day${expectedDays !== 1 ? "s" : ""}.`;

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
    console.error("[withdraw] Unhandled error:", err.code ?? "unknown");
    return NextResponse.json(
      {
        error:
          "An unexpected error occurred. Your balance has not been affected. Please refresh and try again.",
      },
      { status: 500 },
    );
  }
}