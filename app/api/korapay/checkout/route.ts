// app/api/korapay/checkout/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIXES:
//  1. miningPeriod now included in metadata stored in payment_transaction
//     (was missing — callback/webhook couldn't create correct allocation)
//  2. lockInMonths = 0 for flexible plans (was defaulting to 6)
//  3. autoReinvest flag stored in metadata
//  4. currency fallback improved
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function toKorapayAmount(amount: number): number {
  return Math.round(amount);
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

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await req.json();

    const {
      userId,
      phone,
      nodeKey,
      nodeName,
      price, // converted local-currency amount
      originalPrice, // USD amount
      currency: rawCurrency,
      gpu,
      vram,
      itype,
      purchaseType,
      licenseType,
      paymentModel,
      // FIX #1: miningPeriod now extracted from body
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
      // FEATURE: autoReinvest
      autoReinvest,
      // FEATURE: referralCode
      referralCode,
    } = body;

    const isContract = paymentModel === "contract";
    const currency: string =
      rawCurrency && rawCurrency !== "" && rawCurrency !== "USD"
        ? rawCurrency
        : currencyForCountry(countryCode);

    const korapayAmount = toKorapayAmount(Number(price));

    console.log("[korapay/checkout] ▶ Request:", {
      userId: userId?.slice(0, 8),
      originalPrice,
      localPrice: price,
      korapayAmount,
      currency,
      countryCode,
      paymentModel,
      miningPeriod, // FIX: now logged
    });

    if (!userId)
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    if (!price || isNaN(Number(price)) || Number(price) <= 0)
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    if (originalPrice > 10000)
      return NextResponse.json(
        { error: "Payment limit is $10,000 USD." },
        { status: 400 },
      );

    // Load config
    const { data: configData } = await supabaseAdmin
      .from("payment_config")
      .select("key, value");
    const cfg: Record<string, string> = {};
    (configData || []).forEach((r: any) => {
      if (r.key && r.value) cfg[r.key] = r.value;
    });

    const korapayKey =
      cfg["korapay_secret_key"] ||
      cfg["korapay_api_key"] ||
      process.env.KORAPAY_SECRET_KEY ||
      "";

    if (!korapayKey || korapayKey === "EMPTY" || korapayKey.length < 10) {
      return NextResponse.json(
        {
          error:
            "Payment gateway not configured. Use Crypto payment or contact support.",
        },
        { status: 500 },
      );
    }

    // Load user email
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("email, full_name")
      .eq("id", userId)
      .single();
    if (!user?.email)
      return NextResponse.json(
        { error: "User account error — no email found" },
        { status: 400 },
      );

    const externalId = `omni_${userId.slice(0, 8)}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    // FIX #1: Insert pending tx with miningPeriod in metadata
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
        metadata: {
          gateway: "korapay",
          externalId,
          countryCode,
          countryName,
          currency,
          originalPrice,
          convertedPrice: price,
          purchaseType,
          licenseType,
          nodeName,
          gpu,
          vram,
          paymentModel,
          // FIX #1: miningPeriod stored in metadata — was missing before
          miningPeriod: miningPeriod ?? "daily",
          itype,
          // Contract fields
          contractMonths: contractMonths || null,
          contractLabel: contractLabel || null,
          contractMinPct: contractMinPct || null,
          contractMaxPct: contractMaxPct || null,
          // FIX #2: lockInMonths = 0 for flexible, contractMonths for contract
          lockInMonths: isContract ? contractMonths || 6 : 0,
          lockInMultiplier: lockInMultiplier || 1.0,
          lockInLabel: isContract ? contractLabel || "6 Months" : "Flexible",
          // FEATURE: autoReinvest stored in metadata
          autoReinvest: autoReinvest || false,
          // FEATURE: referralCode stored in metadata
          referralCode: referralCode || null,
        },
      })
      .select()
      .single();

    if (txnErr || !txn) {
      console.error("[korapay/checkout] Tx insert error:", txnErr);
      return NextResponse.json(
        { error: "Failed to create payment record" },
        { status: 500 },
      );
    }

    // Customer object
    const customerObj: Record<string, string> = {
      name: user.full_name || "OmniTask User",
      email: user.email,
    };
    const cleanPhone = (phone || "").replace(/[^0-9+]/g, "");
    if (cleanPhone.length >= 7 && cleanPhone.length <= 15) {
      customerObj.phone = cleanPhone;
    }

    const channels = CURRENCY_CHANNELS[currency] || ["card"];
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL || "https://omnitaskpro.online"
    ).replace(/\/$/, "");

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
      "[korapay/checkout] ▶ Payload:",
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
      "[korapay/checkout] ◀ Status:",
      koraRes.status,
      "Body:",
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
      console.error("[korapay/checkout] ✗ Failed:", errorMsg);

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
    console.log("[korapay/checkout] ✓ URL:", checkoutUrl);

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
    console.error("[korapay/checkout] ✗ Unhandled:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
