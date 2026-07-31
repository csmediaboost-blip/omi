// app/api/checkout/cross-site/route.ts  (WEBSITE A — REWRITTEN)
// ─────────────────────────────────────────────────────────────────────────────
// Previous version read process.env.KORAPAY_SECRET_KEY directly — wrong, since
// your real checkout (app/api/korapay/checkout/route.ts) uses a multi-account
// rotation system: get_available_korapay_account(amount_ngn) picks whichever
// active korapay_accounts slot still has daily capacity, with a fallback to
// payment_config.korapay_secret_key if no slots exist. This version copies
// that logic exactly so cross-site (Website B) charges rotate through the
// same account pool and respect the same daily NGN limits as A's own charges.
//
// NOTE — daily-limit accounting caveat:
// get_available_korapay_account sums today's usage from payment_transactions
// rows carrying korapay_account_slot. This endpoint does NOT insert a
// payment_transactions row for B's charges (payment_transactions.user_id
// likely expects a Website A user, and B's users don't exist in A's `users`
// table — inserting a guessed/placeholder value risked breaking a live
// payments table without knowing your actual constraints). This means:
// slot selection correctly picks an account with capacity, but B's charge
// volume does NOT count against that slot's tracked daily usage for
// SUBSEQUENT selections today. If B's payment volume is meaningful relative
// to your daily_limit_ngn values, tell me whether payment_transactions.user_id
// is nullable / has no FK constraint, and I'll add the bookkeeping insert so
// accounting stays fully accurate across both sites.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const BRIDGE_SECRET = process.env.BRIDGE_SECRET || "";
const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  });
}

type KorapayAccountRow = {
  slot: number;
  secret_key: string;
  label: string;
  remaining: number;
};

// ─── Identical to app/api/korapay/checkout/route.ts ─────────────────────────
async function pickKorapayAccount(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  amountNGN: number,
): Promise<KorapayAccountRow | null> {
  try {
    const { data, error } = await supabase
      .rpc("get_available_korapay_account", { p_amount_ngn: amountNGN })
      .maybeSingle();

    if (error) {
      console.error("[cross-site-checkout] get_available_korapay_account error:", error.message);
      return null;
    }
    if (!data) {
      console.warn(`[cross-site-checkout] All accounts full for ₦${amountNGN}.`);
      return null;
    }
    const row = data as KorapayAccountRow;
    console.log(
      `[cross-site-checkout] ✅ Selected slot ${row.slot} (${row.label}) — ₦${row.remaining} remaining today`,
    );
    return row;
  } catch (e: any) {
    console.error("[cross-site-checkout] pickKorapayAccount threw:", e.message);
    return null;
  }
}

async function fallbackKey(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<string> {
  try {
    const { data } = await supabase
      .from("payment_config")
      .select("korapay_secret_key")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if ((data as any)?.korapay_secret_key?.trim()) {
      console.log("[cross-site-checkout] ⚠️ Using fallback key from payment_config");
      return (data as any).korapay_secret_key.trim();
    }
  } catch {}
  return process.env.KORAPAY_SECRET_KEY?.trim() || "";
}

function verifyBridgeSignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !BRIDGE_SECRET) return false;
  try {
    const expected = crypto.createHmac("sha256", BRIDGE_SECRET).update(rawBody).digest("hex");
    const sigBuf = Buffer.from(signature, "hex");
    const expBuf = Buffer.from(expected, "hex");
    return sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-bridge-signature");

    if (!verifyBridgeSignature(rawBody, signature)) {
      console.warn("[cross-site-checkout] Invalid bridge signature — rejecting");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as {
      reference?: string;
      amount?: number;
      currency?: string;
      customerEmail?: string;
      customerName?: string;
      redirectUrl?: string;
      narration?: string;
      timestamp?: number;
    };

    const {
      reference,
      amount,
      currency,
      customerEmail,
      customerName,
      redirectUrl,
      narration,
      timestamp,
    } = body;

    if (!reference || !amount || !currency || !customerEmail || !timestamp) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const age = Date.now() - timestamp;
    if (age > MAX_REQUEST_AGE_MS || age < -30_000) {
      return NextResponse.json({ error: "Request expired" }, { status: 401 });
    }

    if (!reference.startsWith("B-")) {
      return NextResponse.json(
        { error: "Cross-site reference must be prefixed 'B-'" },
        { status: 400 },
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const isNGN = currency === "NGN";
    const korapayAmount = Math.round(Number(amount));

    let korapayKey = "";
    let accountSlot: number | null = null;

    if (isNGN) {
      const account = await pickKorapayAccount(supabaseAdmin, korapayAmount);
      if (account) {
        korapayKey = account.secret_key;
        accountSlot = account.slot;
      } else {
        return NextResponse.json(
          {
            error:
              "Bank transfer is unavailable — today's processing capacity has been reached.",
            code: "ALL_ACCOUNTS_FULL",
          },
          { status: 503 },
        );
      }
    } else {
      const account = await pickKorapayAccount(supabaseAdmin, 0);
      if (account) {
        korapayKey = account.secret_key;
        accountSlot = account.slot;
      } else {
        korapayKey = await fallbackKey(supabaseAdmin);
        accountSlot = null;
      }
    }

    if (!korapayKey) {
      return NextResponse.json(
        { error: "Payment gateway not configured on Website A" },
        { status: 500 },
      );
    }

    console.log(
      `[cross-site-checkout] ▶ reference=${reference} slot=${accountSlot} amount=${korapayAmount} ${currency}`,
    );

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://omnitaskpro.online").replace(/\/$/, "");

    const korapayRes = await fetch(
      "https://api.korapay.com/merchant/api/v1/charges/initialize",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${korapayKey}`,
        },
        body: JSON.stringify({
          amount: korapayAmount,
          currency,
          reference,
          redirect_url: redirectUrl,
          notification_url: `${appUrl}/api/korapay/webhook`,
          narration: narration || "Payment",
          customer: { email: customerEmail, name: customerName },
        }),
      },
    );

    const korapayData = await korapayRes.json();

    if (!korapayRes.ok || !korapayData?.data?.checkout_url) {
      const errorMsg =
        korapayData?.message || korapayData?.error || `HTTP ${korapayRes.status}`;
      console.error(`[cross-site-checkout] ✗ Korapay slot ${accountSlot} rejected:`, errorMsg);
      console.error(
        `[cross-site-checkout] ✗ Full Korapay response:`,
        JSON.stringify(korapayData),
      );
      console.error(
        `[cross-site-checkout] ✗ Request body sent:`,
        JSON.stringify({
          amount: korapayAmount,
          currency,
          reference,
          redirect_url: redirectUrl,
          narration: narration || "Payment",
          customer: { email: customerEmail, name: customerName },
        }),
      );
      return NextResponse.json({ error: `Payment gateway error: ${errorMsg}` }, { status: 502 });
    }

    console.log(`[cross-site-checkout] ✓ Checkout URL from slot ${accountSlot} for ${reference}`);

    return NextResponse.json({
      checkout_url: korapayData.data.checkout_url,
      reference: korapayData.data.reference,
    });
  } catch (err: any) {
    console.error("[cross-site-checkout] Error:", err.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}