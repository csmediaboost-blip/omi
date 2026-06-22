// app/api/korapay/checkout/route.ts
// MULTI-ACCOUNT KEY ROTATION
//
// How it works:
//  1. At checkout time, call get_available_korapay_account(amount_ngn) — a
//     DB function that sums today's confirmed/pending NGN across
//     payment_transactions per slot and returns the lowest-numbered slot
//     that still has room (daily_limit_ngn - used >= amount).
//  2. Use that slot's secret_key for the KoraPay API call.
//  3. Write korapay_account_slot onto the payment_transactions row so the
//     daily usage query stays accurate.
//  4. If NO slot has room → return 503 so the frontend can show
//     "bank transfer unavailable today, use crypto/card".
//
// Split payments: each installment independently calls this function, so
// installment 1 might use slot 1 and installment 2 might use slot 2 if
// slot 1 fills up between calls — fully automatic.
//
// Nothing else changes: webhook, callback, allocation creation, license
// activation are all untouched.

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) {
    console.error("[korapay/checkout] ❌ Missing Supabase env vars");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  });
}

const CURRENCY_CHANNELS: Record<string, string[]> = {
  NGN: ["card", "bank_transfer", "mobile_money"],
  KES: ["card", "mobile_money"],
  GHS: ["card", "mobile_money"],
  ZAR: ["card"],
  XAF: ["card", "mobile_money"],
  XOF: ["card", "mobile_money"],
  EGP: ["card"],
  TZS: ["card", "mobile_money"],
};

function currencyForCountry(countryCode: string): string {
  const map: Record<string, string> = {
    NG: "NGN",
    KE: "KES",
    GH: "GHS",
    ZA: "ZAR",
    CM: "XAF",
    CI: "XOF",
    EG: "EGP",
    TZ: "TZS",
  };
  return map[countryCode] ?? "NGN";
}

// ─── Type for the DB function return row ─────────────────────────────────────
// Supabase .rpc().maybeSingle() returns unknown in strict TypeScript —
// we define the shape explicitly and cast after the null check.
type KorapayAccountRow = {
  slot: number;
  secret_key: string;
  label: string;
  remaining: number;
};

// ─── Pick best available KoraPay account slot ─────────────────────────────────
// Calls get_available_korapay_account(p_amount_ngn) which returns the
// lowest-numbered active slot that has enough remaining daily capacity.
// Returns null if all accounts are full for the day.
async function pickKorapayAccount(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  amountNGN: number,
): Promise<KorapayAccountRow | null> {
  try {
    const { data, error } = await supabase
      .rpc("get_available_korapay_account", { p_amount_ngn: amountNGN })
      .maybeSingle();

    if (error) {
      console.error(
        "[korapay/checkout] get_available_korapay_account error:",
        error.message,
      );
      return null;
    }

    if (!data) {
      console.warn(
        `[korapay/checkout] All accounts full for ₦${amountNGN}. ` +
          "No slot has sufficient remaining daily capacity.",
      );
      return null;
    }

    // Cast from unknown — RPC returns JSONB rows, TS can't infer the shape
    const row = data as KorapayAccountRow;

    console.log(
      `[korapay/checkout] ✅ Selected slot ${row.slot} (${row.label}) — ` +
        `₦${row.remaining} remaining today`,
    );
    return row;
  } catch (e: any) {
    console.error("[korapay/checkout] pickKorapayAccount threw:", e.message);
    return null;
  }
}

// ─── Fallback: read from legacy payment_config if korapay_accounts is empty ──
// Guarantees backward compatibility — if admin hasn't added extra accounts yet,
// the single key from payment_config still works.
async function fallbackKey(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<string> {
  try {
    const { data } = await supabase
      .from("payment_config")
      .select("korapay_secret_key")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if ((data as any)?.korapay_secret_key?.trim()) {
      console.log(
        "[korapay/checkout] ⚠️ Using fallback key from payment_config",
      );
      return (data as any).korapay_secret_key.trim();
    }
  } catch {}
  return process.env.KORAPAY_SECRET_KEY?.trim() || "";
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await req.json();

    const {
      userId,
      phone,
      nodeKey,
      nodeName,
      price,
      originalPrice,
      currency: rawCurrency,
      gpu,
      vram,
      itype,
      purchaseType,
      licenseType,
      paymentModel,
      miningPeriod,
      contractMonths,
      contractLabel,
      contractMinPct,
      contractMaxPct,
      lockInMonths,
      lockInMultiplier,
      lockInLabel,
      countryCode,
      countryName,
      autoReinvest,
      referralCode,
      isSplitPayment,
      splitInstallment,
      splitTotal,
    } = body;

    const isContract = paymentModel === "contract";

    const currency: string =
      rawCurrency && rawCurrency !== "" && rawCurrency !== "USD"
        ? rawCurrency
        : currencyForCountry(countryCode);

    const korapayAmount = Math.round(Number(price));

    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL || "https://omnitaskpro.online"
    ).replace(/\/$/, "");

    console.log("[korapay/checkout] ▶ Incoming request:", {
      userId: userId?.slice(0, 8),
      originalPrice,
      localPrice: price,
      korapayAmount,
      currency,
      countryCode,
      paymentModel,
      purchaseType,
      isSplitPayment,
    });

    if (!userId)
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    if (!price || isNaN(Number(price)) || Number(price) <= 0)
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    if (Number(originalPrice) > 10000)
      return NextResponse.json(
        { error: "Payment limit is $10,000 USD." },
        { status: 400 },
      );

    // ── Pick KoraPay account slot ─────────────────────────────────────────────
    // amountNGN is the converted_amount (local currency amount) for NGN payments.
    // For non-NGN currencies (KES, GHS etc) we pass 0 so any active slot is
    // returned — the ₦498k limit is a Nigerian CBN/KoraPay constraint only.
    const isNGN = currency === "NGN";
    let korapayKey = "";
    let accountSlot: number | null = null;

    if (isNGN) {
      const account = await pickKorapayAccount(supabaseAdmin, korapayAmount);
      if (account) {
        korapayKey = account.secret_key;
        accountSlot = account.slot;
      } else {
        // All NGN slots full — tell frontend to switch payment method
        return NextResponse.json(
          {
            error:
              "Bank transfer is unavailable — today's processing capacity has been reached. " +
              "Please pay with Crypto or Card.",
            code: "ALL_ACCOUNTS_FULL",
          },
          { status: 503 },
        );
      }
    } else {
      // Non-NGN: use slot 1 (primary) — pass 0 so any active slot qualifies
      const account = await pickKorapayAccount(supabaseAdmin, 0);
      if (account) {
        korapayKey = account.secret_key;
        accountSlot = account.slot;
      } else {
        // No active slots at all — fall back to payment_config
        korapayKey = await fallbackKey(supabaseAdmin);
        accountSlot = null;
      }
    }

    if (!korapayKey) {
      return NextResponse.json(
        {
          error:
            "Payment gateway not configured. " +
            "Please add your KoraPay secret key in Admin → Payment Config.",
        },
        { status: 500 },
      );
    }

    // ── Load user ─────────────────────────────────────────────────────────────
    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    if (userErr || !user?.email) {
      console.error(
        "[korapay/checkout] User lookup failed:",
        userErr?.message,
      );
      return NextResponse.json(
        { error: "User account error — no email found" },
        { status: 400 },
      );
    }

    const externalId = `omni_${userId.slice(0, 8)}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    const txMetadata = {
      gateway: "korapay",
      externalId,
      countryCode,
      countryName,
      currency,
      originalPrice,
      convertedPrice: price,
      purchaseType,
      licenseType: licenseType || null,
      nodeName,
      gpu,
      vram,
      paymentModel,
      miningPeriod: miningPeriod ?? "daily",
      itype,
      contractMonths: contractMonths || null,
      contractLabel: contractLabel || null,
      contractMinPct: contractMinPct || null,
      contractMaxPct: contractMaxPct || null,
      lockInMonths: isContract ? contractMonths || 6 : 0,
      lockInMultiplier: lockInMultiplier || 1.0,
      lockInLabel: isContract ? contractLabel || "6 Months" : "Flexible",
      autoReinvest: autoReinvest || false,
      referralCode: referralCode || null,
      isSplitPayment: isSplitPayment || false,
      splitInstallment: splitInstallment || null,
      splitTotal: splitTotal || null,
      korapayAccountSlot: accountSlot,
    };

    // ── Insert payment_transactions row ───────────────────────────────────────
    // korapay_account_slot is written here so the daily usage query
    // (get_available_korapay_account) counts this pending transaction
    // immediately — prevents two simultaneous requests from both thinking
    // slot 1 has capacity and both using it.
    const { data: txn, error: txnErr } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        user_id: userId,
        node_key: nodeKey,
        amount: originalPrice,
        converted_amount: price,
        currency,
        gateway: "korapay",
        gateway_reference: externalId,
        status: "pending",
        korapay_account_slot: accountSlot,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: txMetadata,
      })
      .select()
      .single();

    if (txnErr || !txn) {
      console.error(
        "[korapay/checkout] Transaction insert failed:",
        txnErr?.message,
      );
      return NextResponse.json(
        { error: "Failed to create payment record" },
        { status: 500 },
      );
    }

    const customerObj: Record<string, string> = {
      name: (user as any).full_name || "OmniTask User",
      email: (user as any).email,
    };

    const cleanPhone = (phone || "").replace(/[^0-9+]/g, "");
    if (cleanPhone.length >= 7 && cleanPhone.length <= 15) {
      customerObj.phone = cleanPhone;
    }

    const channels = CURRENCY_CHANNELS[currency] || ["card"];

    const korapayPayload = {
      reference: externalId,
      amount: korapayAmount,
      currency,
      customer: customerObj,
      redirect_url: `${appUrl}/api/korapay/callback?reference=${externalId}&userId=${userId}`,
      notification_url: `${appUrl}/api/korapay/webhook`,
      channels,
    };

    console.log(
      `[korapay/checkout] ▶ Sending to KoraPay via slot ${accountSlot}:`,
      JSON.stringify({ ...korapayPayload, reference: externalId }),
    );

    const koraRes = await fetch(
      "https://api.korapay.com/merchant/api/v1/charges/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${korapayKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(korapayPayload),
      },
    );

    const rawResponse = await koraRes.text();
    console.log(
      `[korapay/checkout] ◀ KoraPay slot ${accountSlot} response — status:`,
      koraRes.status,
      "body:",
      rawResponse,
    );

    let koraData: any = {};
    try {
      koraData = JSON.parse(rawResponse);
    } catch {
      koraData = { message: rawResponse };
    }

    if (!koraRes.ok || !koraData?.data?.checkout_url) {
      const errorMsg =
        koraData?.message ||
        koraData?.error ||
        koraData?.data?.message ||
        `HTTP ${koraRes.status}`;

      console.error(
        `[korapay/checkout] ✗ KoraPay slot ${accountSlot} rejected:`,
        errorMsg,
      );

      await supabaseAdmin
        .from("payment_transactions")
        .update({
          status: "failed",
          failure_reason: errorMsg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", txn.id);

      return NextResponse.json(
        { error: `Payment gateway error: ${errorMsg}` },
        { status: 502 },
      );
    }

    const checkoutUrl = koraData.data.checkout_url;
    console.log(
      `[korapay/checkout] ✓ Checkout URL from slot ${accountSlot}:`,
      checkoutUrl,
    );

    await supabaseAdmin
      .from("payment_transactions")
      .update({
        gateway_url: checkoutUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", txn.id);

    return NextResponse.json({
      success: true,
      checkoutUrl,
      referenceId: externalId,
      transactionId: txn.id,
      accountSlot,
    });
  } catch (err: any) {
    console.error("[korapay/checkout] ✗ Unhandled error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}