// app/api/withdraw/route.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isBusinessDay } from "@/lib/business-days";
import {
  apiSuccess,
  apiValidationError,
  apiAuthError,
  apiAuthorizationError,
  apiNotFoundError,
  apiRateLimitError,
  apiServerError,
  apiConflictError,
} from "@/lib/api-response";

export const dynamic = "force-dynamic";

const WithdrawSchema = z.object({
  amount: z
    .number()
    .positive("Amount must be positive")
    .max(50000, "Exceeds maximum single withdrawal")
    .refine((n) => Number.isFinite(n), "Invalid amount"),
  pin: z
    .string()
    .min(4, "PIN required")
    .max(6, "Invalid PIN format")
    .regex(/^\d+$/, "PIN must be numbers only"),
});

const attempts = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const key = `withdraw:${userId}`;
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + 3600_000 });
    return false;
  }
  if (entry.count >= 5) return true;
  entry.count++;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Authenticate ─────────────────────────────────────
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return apiAuthError('Session expired. Please sign in again.');
    }

    // ── 2. Parse and validate input ─────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiValidationError('Invalid request body');
    }

    const parsed = WithdrawSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      return apiValidationError(
        firstError.message,
        { field: firstError.path.join('.') }
      );
    }
    const { amount } = parsed.data;

    // ── 2.5 Business day validation ─────────────────────────
    if (!isBusinessDay()) {
      const day = new Date().getDay();
      const dayName = day === 0 ? "Sunday" : "Saturday";
      return apiAuthorizationError(
        `Withdrawals available Mon-Fri only. It's ${dayName}. Try again Monday.`
      );
    }

    // ── 2.6 PIN Verification ────────────────────────────────
    // Hash the provided PIN with user ID salt and verify
    async function hashPin(pinValue: string, userId: string): Promise<string> {
      const encoder = new TextEncoder();
      const data = encoder.encode(pinValue + userId);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    const providedPinHash = await hashPin(parsed.data.pin, user.id);
    
    // Get user's stored PIN hash
    const { data: userData } = await supabase
      .from("users")
      .select("pin_hash")
      .eq("id", user.id)
      .single();

    if (!userData?.pin_hash || providedPinHash !== userData.pin_hash) {
      return apiAuthorizationError('Invalid PIN. Withdrawal cannot be processed.');
    }

    // ── 3. Rate limit check ─────────────────────────────────
    if (isRateLimited(user.id)) {
      return apiRateLimitError(3600); // 1 hour
    }

    // ── 4. Load fresh user data from DB (NEVER trust client) ─
    const { data: profile, error: profileErr } = await supabase
      .from("users")
      .select(
        "balance_available, kyc_verified, kyc_status, payout_registered, " +
          "payout_account_number, payout_gateway, payout_account_name, " +
          "payout_bank_name, payout_kyc_match, payout_locked, " +
          "account_flagged, withdwals_fronzen, earnings_locked_until",
      )
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return apiNotFoundError('User profile');
    }

    // ── 5. Security checks ──────────────────────────────────
    if (profile.account_flagged) {
      return apiAuthorizationError('Account flagged. Please contact support.');
    }
    if (profile.withdwals_fronzen) {
      return apiAuthorizationError('Withdrawals temporarily frozen. Please contact support.');
    }
    
    const kycOk = profile.kyc_verified === true || profile.kyc_status === "approved";
    if (!kycOk) {
      return apiAuthorizationError('KYC verification required before withdrawal.');
    }
    
    if (!profile.payout_registered || !profile.payout_account_number) {
      return apiConflictError('No payout account registered. Please add one in settings.');
    }
    
    if (!profile.payout_kyc_match) {
      return apiConflictError('Payout account name mismatch. Please contact support.');
    }
    
    if (profile.payout_locked) {
      return apiAuthorizationError('Payout account locked. Please contact support.');
    }
    
    if (profile.earnings_locked_until && new Date(profile.earnings_locked_until) > new Date()) {
      const unlockDate = new Date(profile.earnings_locked_until).toLocaleDateString();
      return apiAuthorizationError(`Earnings locked until ${unlockDate}`);
    }
    
    if (amount < 10) {
      return apiValidationError('Minimum withdrawal is $10');
    }
    
    if (amount > (profile.balance_available ?? 0)) {
      return apiValidationError(
        'Insufficient balance for this withdrawal',
        { available: profile.balance_available, requested: amount }
      );
    }

    // ── 6. 24-hour limit check ──────────────────────────────
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
    const { data: recentWDs } = await supabase
      .from("withdrawals")
      .select("amount")
      .eq("user_id", user.id)
      .in("status", ["queued", "processing", "paid"])
      .gte("created_at", oneDayAgo);

    const last24h = (recentWDs || []).reduce((s, w) => s + (w.amount || 0), 0);
    if (last24h + amount > 50000) {
      return NextResponse.json(
        { error: "24-hour withdrawal limit ($50,000) exceeded." },
        { status: 403 },
      );
    }

    const { data: pending } = await supabase
      .from("withdrawals")
      .select("id")
      .eq("user_id", user.id)
      .in("status", ["queued", "processing"]);

    if ((pending || []).length >= 3) {
      return apiConflictError('Too many pending withdrawals. Wait for current ones to complete.');
    }

    // ── 7. Atomic balance deduction ─────────────────────────
    const { data: deducted, error: deductErr } = await supabase.rpc(
      "atomic_deduct_balance",
      { p_user_id: user.id, p_amount: amount },
    );
    if (deductErr || !deducted) {
      return apiServerError(
        deductErr?.message || 'Failed to process withdrawal. Balance unchanged.'
      );
    }

    // ── 8. Insert withdrawal ─────────────────────────────────
    const expectedDays =
      amount < 500 ? 1 : amount < 5000 ? 2 : amount < 50000 ? 5 : 7;
    const expectedDate = new Date(
      Date.now() + expectedDays * 86400000,
    ).toISOString();

    const { error: wdErr } = await supabase.from("withdrawals").insert({
      user_id: user.id,
      amount,
      wallet_address: profile.payout_account_number,
      payout_method: profile.payout_gateway,
      payout_account_name: profile.payout_account_name,
      payout_bank_name: profile.payout_bank_name,
      status: "queued",
      tracking_status: "queued",
      expected_date: expectedDate,
      created_at: new Date().toISOString(),
    });

    if (wdErr) {
      await supabase.rpc("atomic_refund_balance", {
        p_user_id: user.id,
        p_amount: amount,
      });
      return apiServerError('Withdrawal request failed. Balance has been refunded.');
    }

    // ── 9. Ledger entry ─────────────────────────────────────
    await supabase
      .from("transaction_ledger")
      .insert({
        user_id: user.id,
        type: "withdrawal",
        amount: -amount,
        description: `Withdrawal via ${profile.payout_gateway}`,
        created_at: new Date().toISOString(),
      })
      .then(() => {});

    return apiSuccess({
      amount,
      expectedDate,
      message: 'Withdrawal request submitted successfully',
    });
  } catch (err: any) {
    console.error('[WITHDRAW_API] Unhandled error:', err);
    return apiServerError(
      'An unexpected error occurred. Please try again.',
      { cause: err }
    );
  }
}
