// app/api/withdraw/route.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isBusinessDay } from "@/lib/business-days";

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── 2. Parse and validate input ─────────────────────────
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body" },
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
    const { amount } = parsed.data;

    // ── 2.5 Business day validation ─────────────────────────
    if (!isBusinessDay()) {
      const day = new Date().getDay();
      const dayName = day === 0 ? "Sunday" : "Saturday";
      return NextResponse.json(
        { error: `Withdrawals are only available on business days (Mon-Fri). It's currently ${dayName}. Please try again on Monday.` },
        { status: 403 }
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
      return NextResponse.json(
        { error: "Invalid PIN. Withdrawal cannot be processed." },
        { status: 403 }
      );
    }

    // ── 3. Rate limit check ─────────────────────────────────
    if (isRateLimited(user.id)) {
      return NextResponse.json(
        { error: "Too many withdrawal requests. Try again later." },
        { status: 429 },
      );
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
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ── 5. Security checks ──────────────────────────────────
    if (profile.account_flagged) {
      return NextResponse.json(
        { error: "Account flagged. Contact support." },
        { status: 403 },
      );
    }
    if (profile.withdwals_fronzen) {
      return NextResponse.json(
        { error: "Withdrawals frozen. Contact support." },
        { status: 403 },
      );
    }
    const kycOk =
      profile.kyc_verified === true || profile.kyc_status === "approved";
    if (!kycOk) {
      return NextResponse.json(
        { error: "KYC verification required." },
        { status: 403 },
      );
    }
    if (!profile.payout_registered || !profile.payout_account_number) {
      return NextResponse.json(
        { error: "No payout account registered." },
        { status: 403 },
      );
    }
    if (!profile.payout_kyc_match) {
      return NextResponse.json(
        { error: "Payout account name mismatch. Contact support." },
        { status: 403 },
      );
    }
    if (profile.payout_locked) {
      return NextResponse.json(
        { error: "Payout account locked. Contact support." },
        { status: 403 },
      );
    }
    if (
      profile.earnings_locked_until &&
      new Date(profile.earnings_locked_until) > new Date()
    ) {
      return NextResponse.json(
        {
          error:
            "Earnings locked until " +
            new Date(profile.earnings_locked_until).toLocaleDateString(),
        },
        { status: 403 },
      );
    }
    if (amount < 10) {
      return NextResponse.json(
        { error: "Minimum withdrawal is $10" },
        { status: 400 },
      );
    }
    if (amount > (profile.balance_available ?? 0)) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400 },
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
      return NextResponse.json(
        { error: "Too many pending withdrawals." },
        { status: 403 },
      );
    }

    // ── 7. Atomic balance deduction ─────────────────────────
    const { data: deducted, error: deductErr } = await supabase.rpc(
      "atomic_deduct_balance",
      { p_user_id: user.id, p_amount: amount },
    );
    if (deductErr || !deducted) {
      return NextResponse.json(
        { error: deductErr?.message || "Balance deduction failed" },
        { status: 400 },
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
      return NextResponse.json(
        { error: "Withdrawal failed. Balance refunded." },
        { status: 500 },
      );
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

    return NextResponse.json({ success: true, amount, expectedDate });
  } catch (err: any) {
    console.error("Withdrawal API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
