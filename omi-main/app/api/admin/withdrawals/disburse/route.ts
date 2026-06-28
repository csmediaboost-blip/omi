// app/api/admin/withdrawals/disburse/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type KorapayAccount = {
  slot: number;
  label: string;
  secret_key: string;
  is_active: boolean;
};

type Withdrawal = {
  id: string;
  status: string;
  amount: number;
  user_id: string;
  reference: string;
  payout_account_name: string | null;
  payout_bank_name: string | null;
  wallet_address: string | null;
  payout_currency: string | null;
};

// ─── ADMIN AUTH ───────────────────────────────────────────────────────────────
async function isAdmin(supabase: SupabaseClient<any>): Promise<boolean> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return false;
  const { data } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();
  return data?.role === "admin" || data?.role === "superadmin";
}

// ─── PICK ACTIVE KORAPAY KEY ──────────────────────────────────────────────────
async function pickDisbursementKey(
  admin: SupabaseClient<any>
): Promise<KorapayAccount | null> {
  const { data, error } = await admin
    .from("korapay_accounts")
    .select("slot, label, secret_key, is_active")
    .eq("is_active", true)
    .order("slot", { ascending: true })
    .limit(10);

  if (error || !data?.length) return null;
  return data[0] as KorapayAccount;
}

// ─── KORAPAY DISBURSE ─────────────────────────────────────────────────────────
async function korapayDisburse(payload: {
  secretKey: string;
  reference: string;
  amount: number;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  narration: string;
  currency?: string;
}): Promise<{ success: boolean; reference?: string; error?: string }> {
  const body = {
    reference: payload.reference,
    destination: {
      type: "bank_account",
      amount: payload.amount,
      currency: payload.currency || "NGN",
      narration: payload.narration,
      bank_account: {
        bank: payload.bankCode,
        account: payload.accountNumber,
      },
      customer: {
        name: payload.accountName,
      },
    },
  };

  const res = await fetch(
    "https://api.korapay.com/merchant/api/v1/transactions/disburse",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${payload.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const raw = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(raw);
  } catch {
    // ignore parse error
  }

  if (!res.ok || data?.status === false) {
    return {
      success: false,
      error:
        (data?.message as string) ||
        (data?.error as string) ||
        `HTTP ${res.status}`,
    };
  }

  return {
    success: true,
    reference:
      ((data?.data as Record<string, unknown>)?.transaction_reference as string) ||
      payload.reference,
  };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Verify admin session
    const cookieStore = await cookies();
    const anonClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    if (!(await isAdmin(anonClient))) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    // 2. Parse body
    const body = await req.json().catch(() => ({}));
    const { withdrawal_id } = body as { withdrawal_id?: string };
    if (!withdrawal_id) {
      return NextResponse.json(
        { error: "withdrawal_id is required." },
        { status: 400 }
      );
    }

    // 3. Service-role client
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // 4. Fetch withdrawal
    const { data: wd, error: fetchErr } = await admin
      .from("withdrawals")
      .select(
        "id, status, amount, user_id, reference, payout_account_name, payout_bank_name, wallet_address, payout_currency"
      )
      .eq("id", withdrawal_id)
      .single();

    if (fetchErr || !wd) {
      return NextResponse.json(
        { error: "Withdrawal not found." },
        { status: 404 }
      );
    }

    const withdrawal = wd as Withdrawal;

    if (!["queued", "processing"].includes(withdrawal.status)) {
      return NextResponse.json(
        {
          error: `Cannot disburse a withdrawal with status "${withdrawal.status}". Only queued or processing.`,
        },
        { status: 400 }
      );
    }

    // 5. Validate bank details
    if (!withdrawal.payout_bank_name || !withdrawal.wallet_address) {
      return NextResponse.json(
        { error: "Withdrawal is missing bank name or account number. Cannot disburse." },
        { status: 400 }
      );
    }

    // 6. Pick KoraPay key
    const account = await pickDisbursementKey(admin);
    if (!account) {
      return NextResponse.json(
        { error: "No active KoraPay account found. Add one in Admin → KoraPay Accounts." },
        { status: 500 }
      );
    }

    // 7. Mark as processing — prevents double-pay
    await admin
      .from("withdrawals")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", withdrawal_id)
      .eq("status", "queued");

    const { data: locked } = await admin
      .from("withdrawals")
      .select("status")
      .eq("id", withdrawal_id)
      .single();

    if (locked?.status !== "processing") {
      return NextResponse.json(
        { error: "Withdrawal was already being processed by another request." },
        { status: 409 }
      );
    }

    // 8. Convert amount to NGN
    const EXCHANGE_RATE_NGN = 1600;
    const amountNGN = Math.round(withdrawal.amount * EXCHANGE_RATE_NGN);
    const disburseRef = `omni_disburse_${withdrawal_id.slice(0, 8)}_${Date.now()}`;

    // 9. Call KoraPay
    const result = await korapayDisburse({
      secretKey: account.secret_key,
      reference: disburseRef,
      amount: amountNGN,
      bankCode: withdrawal.payout_bank_name,
      accountNumber: withdrawal.wallet_address,
      accountName: withdrawal.payout_account_name || "",
      narration: `OmniTaskPro withdrawal ${withdrawal.reference}`,
      currency: withdrawal.payout_currency || "NGN",
    });

    if (!result.success) {
      // Roll back to queued so admin can retry
      await admin
        .from("withdrawals")
        .update({ status: "queued", updated_at: new Date().toISOString() })
        .eq("id", withdrawal_id);

      console.error(
        `[admin/disburse] KoraPay failed for ${withdrawal_id}:`,
        result.error
      );
      return NextResponse.json(
        { error: `KoraPay disburse failed: ${result.error}` },
        { status: 502 }
      );
    }

    // 10. Mark as paid
    await admin
      .from("withdrawals")
      .update({
        status: "paid",
        tracking_status: "paid",
        gateway_reference: result.reference,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        processing_notes: `Disbursed via KoraPay slot ${account.slot} (${account.label})`,
      })
      .eq("id", withdrawal_id);

    // 11. Notify user
    await admin.from("user_notifications").insert({
      user_id: withdrawal.user_id,
      type: "withdrawal_paid",
      title: "Withdrawal Processed",
      message: `Your withdrawal of $${withdrawal.amount.toFixed(2)} has been sent to your account via KoraPay.`,
      is_read: false,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: `$${withdrawal.amount.toFixed(2)} disbursed successfully via KoraPay (slot ${account.slot}).`,
      korapay_reference: result.reference,
    });
  } catch (err: unknown) {
    console.error("[admin/disburse] unhandled:", (err as Error).message);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}