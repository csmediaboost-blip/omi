// app/api/korapay/checkout/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// BUG FIX: payment_config table uses COLUMN-based schema, not key-value rows.
//   Actual columns: id, korapay_secret_key, usd_to_ngn_rate,
//                   crypto_wallet_address, created_at
//   Old code did select("key, value") — those columns do NOT exist.
//   Fixed: select("*") and read cfg.korapay_secret_key directly.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceKey) {
    console.error(
      "[korapay/checkout] ❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
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

// ─── FIX: Load config from actual column-based schema ─────────────────────────
// Table columns: id, korapay_secret_key, usd_to_ngn_rate,
//                crypto_wallet_address, created_at
async function loadPaymentConfig(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<Record<string, string>> {
  try {
    const { data, error } = await supabase
      .from("payment_config")
      .select("*") // ← FIX: was select("key, value") — wrong columns
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error(
        "[korapay/checkout] payment_config read error:",
        error.message,
        "code:",
        error.code,
      );
      return {};
    }

    if (!data) {
      console.warn(
        "[korapay/checkout] payment_config returned 0 rows — " +
          "go to Admin → Payment Config and save your KoraPay secret key.",
      );
      return {};
    }

    console.log(
      "[korapay/checkout] payment_config loaded. Has key?",
      !!data.korapay_secret_key,
    );

    // Normalise to Record<string,string> so downstream code stays the same
    const cfg: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== null && v !== undefined && v !== "" && v !== "EMPTY") {
        cfg[k] = String(v);
      }
    }
    return cfg;
  } catch (e: any) {
    console.error("[korapay/checkout] payment_config fetch threw:", e.message);
    return {};
  }
}

// ─── FIX: Resolve key using actual column name first ─────────────────────────
function resolveKorapayKey(cfg: Record<string, string>): string {
  // Primary: actual DB column name used by the admin UI
  if (cfg.korapay_secret_key?.trim()) {
    console.log(
      "[korapay/checkout] ✅ KoraPay key found in korapay_secret_key column",
    );
    return cfg.korapay_secret_key.trim();
  }

  // Fallback aliases in case admin saved under a different name
  const aliases = [
    "korapay_api_key",
    "korapay_key",
    "KORAPAY_SECRET_KEY",
    "korapay_live_secret",
    "korapay_live_key",
    "korapay_sk",
  ];
  for (const name of aliases) {
    if (cfg[name]?.trim()) {
      console.log(
        `[korapay/checkout] ✅ KoraPay key found under alias: "${name}"`,
      );
      return cfg[name].trim();
    }
  }

  // Last resort: env var
  if (process.env.KORAPAY_SECRET_KEY?.trim()) {
    console.log("[korapay/checkout] ✅ KoraPay key found in env var");
    return process.env.KORAPAY_SECRET_KEY.trim();
  }

  console.error(
    "[korapay/checkout] ❌ KoraPay key not found.\n" +
      "  → Go to Admin → Payment Config and save your key in the " +
      "'KoraPay Secret Key' field (column: korapay_secret_key).",
  );
  return "";
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

    // ── Load config (FIXED schema) ────────────────────────────────────────────
    const cfg = await loadPaymentConfig(supabaseAdmin);
    const korapayKey = resolveKorapayKey(cfg);

    if (!korapayKey) {
      return NextResponse.json(
        {
          error:
            "Payment gateway not configured. " +
            "Please add your KoraPay secret key in Admin → Payment Config, then try again.",
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
      console.error("[korapay/checkout] User lookup failed:", userErr?.message);
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
    };

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
      name: user.full_name || "OmniTask User",
      email: user.email,
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
      "[korapay/checkout] ▶ Sending to KoraPay:",
      JSON.stringify(korapayPayload),
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
      "[korapay/checkout] ◀ KoraPay response — status:",
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

      console.error("[korapay/checkout] ✗ KoraPay rejected:", errorMsg);

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
    console.log("[korapay/checkout] ✓ Checkout URL:", checkoutUrl);

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
    });
  } catch (err: any) {
    console.error("[korapay/checkout] ✗ Unhandled error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
