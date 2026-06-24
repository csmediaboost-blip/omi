// app/api/admin/withdrawals/bulk-disburse/route.ts
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
  payout_bank_code: string | null;
  wallet_address: string | null;
  payout_currency: string | null;
};

type Result = {
  withdrawal_id: string;
  reference: string;
  amount: number;
  account_name: string;
  bank_name: string;
  success: boolean;
  korapay_reference?: string;
  error?: string;
  skipped?: boolean;
  skip_reason?: string;
};

// ─── ADMIN AUTH ───────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
  slotIndex: number = 0
): Promise<KorapayAccount | null> {
  const { data, error } = await admin
    .from("korapay_accounts")
    .select("slot, label, secret_key, is_active")
    .eq("is_active", true)
    .order("slot", { ascending: true });

  if (error || !data?.length) return null;
  const idx = slotIndex % data.length;
  return data[idx] as KorapayAccount;
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

// ─── SLEEP HELPER ─────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const { withdrawal_ids } = body as { withdrawal_ids?: string[] };

    if (!Array.isArray(withdrawal_ids) || withdrawal_ids.length === 0) {
      return NextResponse.json(
        { error: "withdrawal_ids must be a non-empty array." },
        { status: 400 }
      );
    }

    if (withdrawal_ids.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 withdrawals per bulk pay request." },
        { status: 400 }
      );
    }

    // 3. Service-role client
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // 4. Fetch all requested withdrawals
    const { data: withdrawals, error: fetchErr } = await admin
      .from("withdrawals")
      .select(
        "id, status, amount, user_id, reference, payout_account_name, payout_bank_name, payout_bank_code, wallet_address, payout_currency"
      )
      .in("id", withdrawal_ids);

    if (fetchErr || !withdrawals) {
      return NextResponse.json(
        { error: "Failed to fetch withdrawals." },
        { status: 500 }
      );
    }

    const results: Result[] = [];
    const EXCHANGE_RATE_NGN = 1600;

    // 5. Process sequentially
    for (let i = 0; i < withdrawal_ids.length; i++) {
      const wid = withdrawal_ids[i];
      const wd = (withdrawals as Withdrawal[]).find((w) => w.id === wid);

      if (!wd) {
        results.push({
          withdrawal_id: wid,
          reference: "—",
          amount: 0,
          account_name: "—",
          bank_name: "—",
          success: false,
          error: "Withdrawal not found.",
        });
        continue;
      }

      if (!["queued", "processing"].includes(wd.status)) {
        results.push({
          withdrawal_id: wid,
          reference: wd.reference,
          amount: wd.amount,
          account_name: wd.payout_account_name || "—",
          bank_name: wd.payout_bank_name || "—",
          success: false,
          skipped: true,
          skip_reason: `Status is "${wd.status}" — only queued/processing can be paid.`,
        });
        continue;
      }

      if (!wd.payout_bank_code || !wd.wallet_address) {
        results.push({
          withdrawal_id: wid,
          reference: wd.reference,
          amount: wd.amount,
          account_name: wd.payout_account_name || "—",
          bank_name: wd.payout_bank_name || "—",
          success: false,
          skipped: true,
          skip_reason: "Missing bank code or account number.",
        });
        continue;
      }

      // Lock: mark processing before disburse
      await admin
        .from("withdrawals")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", wid)
        .eq("status", "queued");

      const { data: checkLock } = await admin
        .from("withdrawals")
        .select("status")
        .eq("id", wid)
        .single();

      if (checkLock?.status !== "processing") {
        results.push({
          withdrawal_id: wid,
          reference: wd.reference,
          amount: wd.amount,
          account_name: wd.payout_account_name || "—",
          bank_name: wd.payout_bank_name || "—",
          success: false,
          skipped: true,
          skip_reason: `Could not lock withdrawal (current status: ${checkLock?.status}).`,
        });
        continue;
      }

      const account = await pickDisbursementKey(admin, i);
      if (!account) {
        await admin
          .from("withdrawals")
          .update({ status: "queued", updated_at: new Date().toISOString() })
          .eq("id", wid);

        results.push({
          withdrawal_id: wid,
          reference: wd.reference,
          amount: wd.amount,
          account_name: wd.payout_account_name || "—",
          bank_name: wd.payout_bank_name || "—",
          success: false,
          error: "No active KoraPay account available.",
        });
        continue;
      }

      const amountNGN = Math.round(wd.amount * EXCHANGE_RATE_NGN);
      const disburseRef = `omni_bulk_${wid.slice(0, 8)}_${Date.now()}`;

      const kResult = await korapayDisburse({
        secretKey: account.secret_key,
        reference: disburseRef,
        amount: amountNGN,
        bankCode: wd.payout_bank_code,
        accountNumber: wd.wallet_address,
        accountName: wd.payout_account_name || "",
        narration: `OmniTaskPro withdrawal ${wd.reference}`,
        currency: wd.payout_currency || "NGN",
      });

      if (!kResult.success) {
        await admin
          .from("withdrawals")
          .update({ status: "queued", updated_at: new Date().toISOString() })
          .eq("id", wid);

        results.push({
          withdrawal_id: wid,
          reference: wd.reference,
          amount: wd.amount,
          account_name: wd.payout_account_name || "—",
          bank_name: wd.payout_bank_name || "—",
          success: false,
          error: `KoraPay: ${kResult.error}`,
        });

        await sleep(500);
        continue;
      }

      await admin
        .from("withdrawals")
        .update({
          status: "paid",
          tracking_status: "paid",
          gateway_reference: kResult.reference,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          processing_notes: `Bulk disbursed via KoraPay slot ${account.slot} (${account.label})`,
        })
        .eq("id", wid);

      await admin.from("transaction_ledger").insert({
        user_id: wd.user_id,
        type: "withdrawal_paid",
        amount: wd.amount,
        description: `Bulk withdrawal ${wd.reference} disbursed via KoraPay slot ${account.slot}. Ref: ${kResult.reference}`,
        reference_id: wd.reference,
        created_at: new Date().toISOString(),
      });

      results.push({
        withdrawal_id: wid,
        reference: wd.reference,
        amount: wd.amount,
        account_name: wd.payout_account_name || "—",
        bank_name: wd.payout_bank_name || "—",
        success: true,
        korapay_reference: kResult.reference,
      });

      if (i < withdrawal_ids.length - 1) await sleep(300);
    }

    // 6. Summarise
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const totalPaid = results
      .filter((r) => r.success)
      .reduce((sum, r) => sum + r.amount, 0);

    return NextResponse.json({
      success: true,
      summary: {
        total: withdrawal_ids.length,
        succeeded,
        failed,
        skipped,
        total_paid_usd: totalPaid.toFixed(2),
        total_paid_ngn: (totalPaid * EXCHANGE_RATE_NGN).toLocaleString("en-NG"),
      },
      results,
    });
  } catch (err: unknown) {
    console.error("[admin/bulk-disburse] unhandled:", (err as Error).message);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}// app/api/admin/withdrawals/bulk-disburse/route.ts
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
  payout_bank_code: string | null;
  wallet_address: string | null;
  payout_currency: string | null;
};

type Result = {
  withdrawal_id: string;
  reference: string;
  amount: number;
  account_name: string;
  bank_name: string;
  success: boolean;
  korapay_reference?: string;
  error?: string;
  skipped?: boolean;
  skip_reason?: string;
};

// ─── ADMIN AUTH ───────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
  slotIndex: number = 0
): Promise<KorapayAccount | null> {
  const { data, error } = await admin
    .from("korapay_accounts")
    .select("slot, label, secret_key, is_active")
    .eq("is_active", true)
    .order("slot", { ascending: true });

  if (error || !data?.length) return null;
  const idx = slotIndex % data.length;
  return data[idx] as KorapayAccount;
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

// ─── SLEEP HELPER ─────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const { withdrawal_ids } = body as { withdrawal_ids?: string[] };

    if (!Array.isArray(withdrawal_ids) || withdrawal_ids.length === 0) {
      return NextResponse.json(
        { error: "withdrawal_ids must be a non-empty array." },
        { status: 400 }
      );
    }

    if (withdrawal_ids.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 withdrawals per bulk pay request." },
        { status: 400 }
      );
    }

    // 3. Service-role client
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // 4. Fetch all requested withdrawals
    const { data: withdrawals, error: fetchErr } = await admin
      .from("withdrawals")
      .select(
        "id, status, amount, user_id, reference, payout_account_name, payout_bank_name, payout_bank_code, wallet_address, payout_currency"
      )
      .in("id", withdrawal_ids);

    if (fetchErr || !withdrawals) {
      return NextResponse.json(
        { error: "Failed to fetch withdrawals." },
        { status: 500 }
      );
    }

    const results: Result[] = [];
    const EXCHANGE_RATE_NGN = 1600;

    // 5. Process sequentially
    for (let i = 0; i < withdrawal_ids.length; i++) {
      const wid = withdrawal_ids[i];
      const wd = (withdrawals as Withdrawal[]).find((w) => w.id === wid);

      if (!wd) {
        results.push({
          withdrawal_id: wid,
          reference: "—",
          amount: 0,
          account_name: "—",
          bank_name: "—",
          success: false,
          error: "Withdrawal not found.",
        });
        continue;
      }

      if (!["queued", "processing"].includes(wd.status)) {
        results.push({
          withdrawal_id: wid,
          reference: wd.reference,
          amount: wd.amount,
          account_name: wd.payout_account_name || "—",
          bank_name: wd.payout_bank_name || "—",
          success: false,
          skipped: true,
          skip_reason: `Status is "${wd.status}" — only queued/processing can be paid.`,
        });
        continue;
      }

      if (!wd.payout_bank_code || !wd.wallet_address) {
        results.push({
          withdrawal_id: wid,
          reference: wd.reference,
          amount: wd.amount,
          account_name: wd.payout_account_name || "—",
          bank_name: wd.payout_bank_name || "—",
          success: false,
          skipped: true,
          skip_reason: "Missing bank code or account number.",
        });
        continue;
      }

      // Lock: mark processing before disburse
      await admin
        .from("withdrawals")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", wid)
        .eq("status", "queued");

      const { data: checkLock } = await admin
        .from("withdrawals")
        .select("status")
        .eq("id", wid)
        .single();

      if (checkLock?.status !== "processing") {
        results.push({
          withdrawal_id: wid,
          reference: wd.reference,
          amount: wd.amount,
          account_name: wd.payout_account_name || "—",
          bank_name: wd.payout_bank_name || "—",
          success: false,
          skipped: true,
          skip_reason: `Could not lock withdrawal (current status: ${checkLock?.status}).`,
        });
        continue;
      }

      const account = await pickDisbursementKey(admin, i);
      if (!account) {
        await admin
          .from("withdrawals")
          .update({ status: "queued", updated_at: new Date().toISOString() })
          .eq("id", wid);

        results.push({
          withdrawal_id: wid,
          reference: wd.reference,
          amount: wd.amount,
          account_name: wd.payout_account_name || "—",
          bank_name: wd.payout_bank_name || "—",
          success: false,
          error: "No active KoraPay account available.",
        });
        continue;
      }

      const amountNGN = Math.round(wd.amount * EXCHANGE_RATE_NGN);
      const disburseRef = `omni_bulk_${wid.slice(0, 8)}_${Date.now()}`;

      const kResult = await korapayDisburse({
        secretKey: account.secret_key,
        reference: disburseRef,
        amount: amountNGN,
        bankCode: wd.payout_bank_code,
        accountNumber: wd.wallet_address,
        accountName: wd.payout_account_name || "",
        narration: `OmniTaskPro withdrawal ${wd.reference}`,
        currency: wd.payout_currency || "NGN",
      });

      if (!kResult.success) {
        await admin
          .from("withdrawals")
          .update({ status: "queued", updated_at: new Date().toISOString() })
          .eq("id", wid);

        results.push({
          withdrawal_id: wid,
          reference: wd.reference,
          amount: wd.amount,
          account_name: wd.payout_account_name || "—",
          bank_name: wd.payout_bank_name || "—",
          success: false,
          error: `KoraPay: ${kResult.error}`,
        });

        await sleep(500);
        continue;
      }

      await admin
        .from("withdrawals")
        .update({
          status: "paid",
          tracking_status: "paid",
          gateway_reference: kResult.reference,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          processing_notes: `Bulk disbursed via KoraPay slot ${account.slot} (${account.label})`,
        })
        .eq("id", wid);

      await admin.from("transaction_ledger").insert({
        user_id: wd.user_id,
        type: "withdrawal_paid",
        amount: wd.amount,
        description: `Bulk withdrawal ${wd.reference} disbursed via KoraPay slot ${account.slot}. Ref: ${kResult.reference}`,
        reference_id: wd.reference,
        created_at: new Date().toISOString(),
      });

      results.push({
        withdrawal_id: wid,
        reference: wd.reference,
        amount: wd.amount,
        account_name: wd.payout_account_name || "—",
        bank_name: wd.payout_bank_name || "—",
        success: true,
        korapay_reference: kResult.reference,
      });

      if (i < withdrawal_ids.length - 1) await sleep(300);
    }

    // 6. Summarise
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const totalPaid = results
      .filter((r) => r.success)
      .reduce((sum, r) => sum + r.amount, 0);

    return NextResponse.json({
      success: true,
      summary: {
        total: withdrawal_ids.length,
        succeeded,
        failed,
        skipped,
        total_paid_usd: totalPaid.toFixed(2),
        total_paid_ngn: (totalPaid * EXCHANGE_RATE_NGN).toLocaleString("en-NG"),
      },
      results,
    });
  } catch (err: unknown) {
    console.error("[admin/bulk-disburse] unhandled:", (err as Error).message);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}