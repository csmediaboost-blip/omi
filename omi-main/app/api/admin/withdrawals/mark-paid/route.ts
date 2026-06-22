import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

const PLATFORM_NAME = "OmniTask Pro";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function getUsdToNgnRate(
  supabase: ReturnType<typeof serviceClient>,
): Promise<number> {
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

async function getKorapaySecret(
  supabase: ReturnType<typeof serviceClient>,
): Promise<string | null> {
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

async function sendKorapayTransfer(opts: {
  secretKey: string;
  amount: number;
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
            customer: { name: opts.accountName },
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
        "Payment gateway rejected the transfer.",
    };
  } catch {
    return { success: false, error: "Could not reach payment gateway." };
  }
}

export async function POST(req: NextRequest) {
  // ── 1. Verify admin session ──────────────────────────────────────────────
  const cookieStore = await cookies();
  const anonClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );

  const {
    data: { user },
    error: authErr,
  } = await anonClient.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();

  // Check admin role
  const { data: adminProfile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  if (adminProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── 2. Parse body ────────────────────────────────────────────────────────
  let body: { withdrawal_id?: string | number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.withdrawal_id) {
    return NextResponse.json(
      { error: "withdrawal_id required" },
      { status: 400 },
    );
  }

  // ── 3. Load the withdrawal ───────────────────────────────────────────────
  const { data: wd, error: wdErr } = await supabase
    .from("withdrawals")
    .select(
      "id, user_id, amount, amount_gross, amount_fee, amount_net, fee_pct, status, payout_method, payout_account_name, payout_bank_name, wallet_address, reference, gateway_reference",
    )
    .eq("id", body.withdrawal_id)
    .single();

  if (wdErr || !wd) {
    return NextResponse.json(
      { error: "Withdrawal not found" },
      { status: 404 },
    );
  }

  if (!["queued", "flagged"].includes(wd.status)) {
    return NextResponse.json(
      { error: `Cannot approve a withdrawal with status "${wd.status}".` },
      { status: 409 },
    );
  }

  // ── 4. Load user payout details ──────────────────────────────────────────
  const { data: userProfile } = await supabase
    .from("users")
    .select(
      "payout_account_number, payout_bank_code, payout_account_name, payout_bank_name, email",
    )
    .eq("id", wd.user_id)
    .single();

  if (!userProfile?.payout_account_number || !userProfile?.payout_bank_code) {
    return NextResponse.json(
      { error: "User payout account details are incomplete." },
      { status: 422 },
    );
  }

  // ── 5. Mark as processing (optimistic) ──────────────────────────────────
  await supabase
    .from("withdrawals")
    .update({
      status: "processing",
      tracking_status: "processing",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", wd.id);

  // ── 6. Disburse via KoraPay ──────────────────────────────────────────────
  const korapayKey = await getKorapaySecret(supabase);

  if (!korapayKey) {
    // No key configured — mark back to queued and let admin know
    await supabase
      .from("withdrawals")
      .update({ status: "queued", tracking_status: "queued" })
      .eq("id", wd.id);
    return NextResponse.json(
      { error: "KoraPay secret key not configured in payment_config." },
      { status: 500 },
    );
  }

  const grossAmount = wd.amount_gross ?? wd.amount;
  const rate = await getUsdToNgnRate(supabase);
  const ngnAmount = Math.round(grossAmount * rate);
  const ref = wd.reference ?? `WD-ADMIN-${wd.id}-${Date.now()}`;
  const shortRef = ref.slice(-10).toUpperCase();
  const narration = `${PLATFORM_NAME} - Earnings Payout | Ref: ${shortRef}`;

  const transfer = await sendKorapayTransfer({
    secretKey: korapayKey,
    amount: ngnAmount,
    accountNumber: userProfile.payout_account_number,
    bankCode: userProfile.payout_bank_code,
    accountName:
      userProfile.payout_account_name ??
      wd.payout_account_name ??
      "Account Holder",
    narration,
    reference: ref,
  });

  if (!transfer.success) {
    // Revert to queued so admin can retry
    await supabase
      .from("withdrawals")
      .update({
        status: "queued",
        tracking_status: "queued",
        failure_reason: transfer.error ?? "KoraPay disbursement failed",
      })
      .eq("id", wd.id);

    return NextResponse.json(
      {
        success: false,
        error: `KoraPay error: ${transfer.error}. Withdrawal reverted to queued.`,
      },
      { status: 422 },
    );
  }

  // ── 7. Mark as paid ───────────────────────────────────────────────────────
  const paidAt = new Date().toISOString();
  await supabase
    .from("withdrawals")
    .update({
      status: "paid",
      tracking_status: "paid",
      paid_at: paidAt,
      gateway_reference: transfer.transferCode ?? wd.gateway_reference,
      auto_processed: true,
      failure_reason: null,
    })
    .eq("id", wd.id);

  // ── 8. Ledger entry ───────────────────────────────────────────────────────
  await supabase.from("transaction_ledger").insert({
    user_id: wd.user_id,
    type: "withdrawal_paid",
    amount: -(wd.amount_net ?? wd.amount),
    description: `${PLATFORM_NAME} payout approved by admin — Ref: ${ref} — KoraPay: ${transfer.transferCode}`,
    reference_id: ref,
    created_at: paidAt,
  });

  return NextResponse.json({
    success: true,
    withdrawal_id: wd.id,
    gateway_reference: transfer.transferCode,
    paid_at: paidAt,
    message: `Withdrawal #${wd.id} disbursed via KoraPay. Reference: ${transfer.transferCode}`,
  });
}
