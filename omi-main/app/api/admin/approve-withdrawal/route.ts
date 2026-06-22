// app/api/admin/approve-withdrawal/route.ts
// Called when admin clicks "Approve & Process" on a queued withdrawal.
// Flow: verify admin → load withdrawal + user payout details → send KoraPay
//       transfer → mark paid → notify user → ledger entry.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

async function getKorapaySecret(supabase: ReturnType<typeof serviceClient>): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("payment_config")
      .select("korapay_secret_key")
      .limit(1)
      .single();
    return data?.korapay_secret_key ?? process.env.KORAPAY_SECRET_KEY ?? null;
  } catch {
    return process.env.KORAPAY_SECRET_KEY ?? null;
  }
}

async function getUsdToNgnRate(supabase: ReturnType<typeof serviceClient>): Promise<number> {
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

async function sendKorapayTransfer(opts: {
  secretKey: string;
  amountNgn: number;
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
            amount: opts.amountNgn,
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
      error: data?.message ?? data?.data?.message ?? "KoraPay rejected the transfer.",
    };
  } catch (e: any) {
    return { success: false, error: "Could not reach KoraPay: " + (e?.message ?? "unknown") };
  }
}

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authErr } = await getAuthUser(token);
  if (authErr || !user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = serviceClient();

  // ── Verify admin ──────────────────────────────────────────────────────────
  const { data: adminProfile } = await supabase
    .from("users")
    .select("role, is_admin")
    .eq("id", user.id)
    .single();

  if (
    !(adminProfile as any)?.is_admin &&
    (adminProfile as any)?.role !== "admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { withdrawal_id?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { withdrawal_id, note } = body;
  if (!withdrawal_id)
    return NextResponse.json({ error: "withdrawal_id is required" }, { status: 400 });

  // ── Load withdrawal ───────────────────────────────────────────────────────
  const { data: wd, error: wdErr } = await supabase
    .from("withdrawals")
    .select("*")
    .eq("id", withdrawal_id)
    .single();

  if (wdErr || !wd)
    return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });

  if (wd.status === "paid" || wd.status === "processing") {
    return NextResponse.json(
      { error: `Withdrawal is already ${wd.status}.` },
      { status: 409 },
    );
  }

  if (wd.status === "rejected")
    return NextResponse.json({ error: "Cannot approve a rejected withdrawal." }, { status: 409 });

  // ── Load user payout details ──────────────────────────────────────────────
  const { data: paidUser } = await supabase
    .from("users")
    .select(
      "full_name, email, payout_account_number, payout_bank_code, payout_bank_name, payout_account_name, payout_gateway, payout_currency",
    )
    .eq("id", wd.user_id)
    .single();

  if (!paidUser)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const gateway = ((paidUser as any).payout_gateway ?? "").toLowerCase();
  const isBankTransfer = ["bank_transfer", "korapay", "bank"].includes(gateway);
  const isCrypto = ["crypto", "crypto_wallet", "usdt", "btc"].includes(gateway);

  const grossAmount = (wd as any).amount_gross ?? (wd as any).amount ?? 0;
  const netAmount   = (wd as any).amount_net   ?? (wd as any).amount ?? 0;
  const feeAmount   = (wd as any).amount_fee   ?? 0;
  const now = new Date().toISOString();
  const disburseRef = `WD-DISBURSE-${withdrawal_id.slice(0, 8)}-${Date.now()}`;

  // ── Disburse via KoraPay (bank transfer only) ─────────────────────────────
  let transferCode: string | undefined;

  if (isBankTransfer) {
    const korapayKey = await getKorapaySecret(supabase);
    if (!korapayKey) {
      return NextResponse.json(
        { error: "KoraPay secret key not configured. Set it in payment_config or KORAPAY_SECRET_KEY env var." },
        { status: 500 },
      );
    }

    const bankCode = (paidUser as any).payout_bank_code ?? "";
    if (!bankCode) {
      return NextResponse.json(
        { error: "User's payout account is missing bank code. Ask them to update payout setup." },
        { status: 400 },
      );
    }

    const rate = await getUsdToNgnRate(supabase);
    const ngnAmount = Math.round(netAmount * rate);
    const shortRef = disburseRef.slice(-10).toUpperCase();
    const narration = `OmniTask Pro - Earnings Payout | Ref: ${shortRef}`;

    const transfer = await sendKorapayTransfer({
      secretKey: korapayKey,
      amountNgn: ngnAmount,
      accountNumber: (paidUser as any).payout_account_number,
      bankCode,
      accountName: (paidUser as any).payout_account_name ?? "Account Holder",
      narration,
      reference: disburseRef,
    });

    if (!transfer.success) {
      // Mark as failed so admin can see it
      await supabase
        .from("withdrawals")
        .update({
          status: "failed",
          tracking_status: "failed",
          failure_reason: transfer.error,
          updated_at: now,
        })
        .eq("id", withdrawal_id);

      return NextResponse.json(
        {
          error: `KoraPay transfer failed: ${transfer.error}`,
          withdrawal_id,
          status: "failed",
        },
        { status: 422 },
      );
    }

    transferCode = transfer.transferCode;
  }

  // ── Mark withdrawal as paid ───────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from("withdrawals")
    .update({
      status: "paid",
      tracking_status: "paid",
      paid_at: now,
      approved_by: user.id,
      approved_at: now,
      gateway_reference: transferCode ?? (wd as any).gateway_reference,
      auto_processed: true,
      admin_note: note ?? null,
      updated_at: now,
    })
    .eq("id", withdrawal_id);

  if (updateErr) {
    console.error("[approve-withdrawal] Update error:", updateErr);
    return NextResponse.json(
      { error: "Failed to mark withdrawal as paid: " + updateErr.message },
      { status: 500 },
    );
  }

  // ── Update user total_withdrawn ───────────────────────────────────────────
  const { data: userRow } = await supabase
    .from("users")
    .select("total_withdrawn")
    .eq("id", wd.user_id)
    .single();

  await supabase
    .from("users")
    .update({
      total_withdrawn: ((userRow as any)?.total_withdrawn ?? 0) + netAmount,
    })
    .eq("id", wd.user_id);

  // ── Ledger entry (non-blocking) ───────────────────────────────────────────
  try {
    await supabase
      .from("transaction_ledger")
      .insert({
        user_id: wd.user_id,
        type: "withdrawal_paid",
        amount: -grossAmount,
        description: `OmniTask Pro payout — $${netAmount.toFixed(2)} net ($${feeAmount.toFixed(2)} fee) · approved by admin`,
        reference_id: disburseRef,
        created_at: now,
      });
  } catch { /* non-blocking */ }

  // ── Notify user (non-blocking) ────────────────────────────────────────────
  try {
    await supabase
      .from("user_notifications")
      .insert({
        user_id: wd.user_id,
        type: "withdrawal_paid",
        title: "💸 Withdrawal Paid!",
        body: `Your withdrawal of $${netAmount.toFixed(2)} has been processed and sent to your ${
          isCrypto ? "crypto wallet" : `${(paidUser as any).payout_bank_name ?? "bank account"}`
        }. Reference: ${disburseRef}.`,
        created_at: now,
      });
  } catch { /* non-blocking */ }

  // ── Audit log (non-blocking) ──────────────────────────────────────────────
  try {
    await supabase
      .from("withdrawal_audit_log")
      .insert({
        user_id: wd.user_id,
        withdrawal_id,
        amount_gross: grossAmount,
        amount_fee: feeAmount,
        amount_net: netAmount,
        fee_pct: (wd as any).fee_pct ?? 0,
        window_state: "ADMIN_APPROVED",
        action: "approved_and_paid",
        actor_id: user.id,
        note: note ?? null,
        risk_score: (wd as any).risk_score ?? 0,
        flagged: false,
        created_at: now,
      });
  } catch { /* non-blocking */ }

  return NextResponse.json({
    success: true,
    withdrawal_id,
    status: "paid",
    transfer_reference: transferCode ?? disburseRef,
    net_amount: netAmount,
    message: `Withdrawal of $${netAmount.toFixed(2)} approved and sent to user's ${
      isBankTransfer ? "bank account" : isCrypto ? "crypto wallet" : "payout account"
    }.`,
  });
}