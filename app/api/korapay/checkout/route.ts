// app/api/korapay/checkout/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIXES vs broken version:
//  FIX-A  Removed import from @/lib/allocation-creator (file does not exist —
//         this was causing the entire route to fail at startup, producing the
//         "Payment gateway not configured" error regardless of key validity).
//  FIX-B  Removed overly-strict korapayKey.length < 10 guard that was
//         silently rejecting valid keys stored under variant config names.
//  FIX-C  API key lookup now tries four common config-table key names so the
//         route works no matter which name the admin stored it under.
//  FIX-D  metadata now always stores miningPeriod, paymentModel, all fields
//         needed by the callback/webhook to create a correct allocation.
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
      price, // converted local-currency amount (e.g. ₦200,000)
      originalPrice, // USD amount (e.g. $125)
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
      // Split payment metadata (passed through transparently)
      isSplitPayment,
      splitInstallment,
      splitTotal,
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
      miningPeriod,
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

    // ── Load KoraPay API key ─────────────────────────────────────────────────
    // Priority: env var → DB config (multiple possible key names)
    // Env var is checked first so the route works even if DB query fails.
    const { data: configData } = await supabaseAdmin
      .from("payment_config")
      .select("key, value");

    const cfg: Record<string, string> = {};
    (configData || []).forEach((r: any) => {
      if (r.key && r.value) cfg[r.key] = r.value;
    });

    // Log which keys exist in the config table (no values exposed)
    console.log(
      "[korapay/checkout] Config table keys found:",
      Object.keys(cfg),
    );

    const korapayKey =
      // 1. Env var (most reliable — set in Vercel/Railway dashboard)
      process.env.KORAPAY_SECRET_KEY ||
      // 2. All plausible DB config table key names
      cfg["korapay_secret_key"] ||
      cfg["korapay_api_key"] ||
      cfg["korapay_key"] ||
      cfg["KORAPAY_SECRET_KEY"] ||
      cfg["korapay_live_secret"] ||
      cfg["korapay_live_key"] ||
      "";

    console.log(
      "[korapay/checkout] Key resolved:",
      korapayKey
        ? `YES — ${korapayKey.slice(0, 8)}... (len ${korapayKey.length})`
        : "NOT FOUND — check payment_config table or KORAPAY_SECRET_KEY env var",
    );

    if (!korapayKey || korapayKey.trim() === "" || korapayKey === "EMPTY") {
      return NextResponse.json(
        {
          error:
            "Payment gateway not configured. Please use Crypto payment or contact support.",
        },
        { status: 500 },
      );
    }

    // ── Load user email ───────────────────────────────────────────────────────
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

    // ── Insert pending payment_transaction ────────────────────────────────────
    // FIX-D: All fields needed by callback/webhook stored in metadata
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
          miningPeriod: miningPeriod ?? "daily",
          itype,
          contractMonths: contractMonths || null,
          contractLabel: contractLabel || null,
          contractMinPct: contractMinPct || null,
          contractMaxPct: contractMaxPct || null,
          // FIX-D: lockInMonths = 0 for flexible sessions
          lockInMonths: isContract ? contractMonths || 6 : 0,
          lockInMultiplier: lockInMultiplier || 1.0,
          lockInLabel: isContract ? contractLabel || "6 Months" : "Flexible",
          autoReinvest: autoReinvest || false,
          referralCode: referralCode || null,
          // Split payment passthrough — so callback knows it's an installment
          isSplitPayment: isSplitPayment || false,
          splitInstallment: splitInstallment || null,
          splitTotal: splitTotal || null,
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

    // ── Build KoraPay payload ─────────────────────────────────────────────────
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
