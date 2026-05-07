// app/api/korapay/checkout/route.ts
// FIXED: amount sent in WHOLE units (not minor), correct key lookup,
// phone only added when valid, full error surfacing to client

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

// ── KoraPay accepts WHOLE numbers for all supported currencies ─
// NGN: send 5000 for ₦5,000 — do NOT multiply by 100
// Same for KES, GHS, XAF, XOF, EGP, TZS, ZAR
// Always round to the nearest whole number
function toKorapayAmount(amount: number): number {
  return Math.round(amount);
}

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
      price, // already-converted local currency amount (e.g. 320000 NGN)
      originalPrice, // USD amount
      currency: rawCurrency,
      daily,
      gpu,
      vram,
      itype,
      purchaseType,
      licenseType,
      paymentModel,
      contractMonths,
      contractLabel,
      contractMinPct,
      contractMaxPct,
      lockInMonths,
      lockInMultiplier,
      lockInLabel,
      countryCode,
      countryName,
    } = body;

    console.log("[korapay/checkout] Incoming:", {
      userId: userId?.slice(0, 8),
      price,
      rawCurrency,
      countryCode,
      originalPrice,
    });

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    if (!price || isNaN(Number(price)) || Number(price) <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    if (originalPrice > 10000) {
      return NextResponse.json(
        {
          error: "Payment limit is $10,000 USD. Please use a different method.",
        },
        { status: 400 },
      );
    }

    // ── Resolve currency ──────────────────────────────────────
    const currency: string =
      rawCurrency && rawCurrency !== "" && rawCurrency !== "USD"
        ? rawCurrency
        : currencyForCountry(countryCode);

    // ── Load config (all keys at once) ────────────────────────
    const { data: configData, error: configErr } = await supabaseAdmin
      .from("payment_config")
      .select("key, value");

    if (configErr) {
      console.error("[korapay/checkout] Config load error:", configErr);
    }

    const cfg: Record<string, string> = {};
    (configData || []).forEach((r: any) => {
      cfg[r.key] = r.value;
    });

    // Try multiple possible key names in order
    const korapayKey =
      cfg["korapay_secret_key"] ||
      cfg["korapay_api_key"] ||
      cfg["KORAPAY_SECRET_KEY"] ||
      process.env.KORAPAY_SECRET_KEY ||
      "";

    console.log(
      "[korapay/checkout] Key found:",
      korapayKey ? "YES (len=" + korapayKey.length + ")" : "NO",
    );

    if (!korapayKey || korapayKey === "EMPTY" || korapayKey === "") {
      console.error(
        "[korapay/checkout] No API key found in payment_config or env",
      );
      return NextResponse.json(
        { error: "Payment gateway not configured. Please contact support." },
        { status: 500 },
      );
    }

    // ── Load user ─────────────────────────────────────────────
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    const customerEmail =
      user?.email || `user-${userId.slice(0, 8)}@omnitaskpro.online`;
    const customerName = user?.full_name || "OmniTask User";

    // ── Build reference ───────────────────────────────────────
    const externalId = `omni_${userId.slice(0, 8)}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    // ── Insert pending transaction BEFORE calling KoraPay ────
    const { data: txn, error: txnErr } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        user_id: userId,
        node_key: nodeKey,
        amount: originalPrice, // USD amount
        converted_amount: price, // local currency amount
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
          contractMonths: contractMonths || null,
          contractLabel: contractLabel || null,
          contractMinPct: contractMinPct || null,
          contractMaxPct: contractMaxPct || null,
          lockInMonths: lockInMonths || contractMonths || 6,
          lockInMultiplier: lockInMultiplier || 1.0,
          lockInLabel: lockInLabel || contractLabel || "6 months",
          itype,
        },
      })
      .select()
      .single();

    if (txnErr) {
      console.error("[korapay/checkout] Transaction insert error:", txnErr);
      return NextResponse.json({ error: txnErr.message }, { status: 500 });
    }

    // ── Build KoraPay customer — phone is OPTIONAL ───────────
    const customerObj: Record<string, string> = {
      name: customerName,
      email: customerEmail,
    };
    const cleanPhone = (phone || "").replace(/[^0-9+]/g, "");
    if (cleanPhone.length >= 7) {
      customerObj.phone = cleanPhone;
    }

    // ── Amount: KoraPay accepts WHOLE numbers (no kobo/cent) ─
    const korapayAmount = toKorapayAmount(Number(price));

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://omnitaskpro.online";

    const korapayPayload = {
      reference: externalId,
      amount: korapayAmount,
      currency,
      customer: customerObj,
      notification_url: `${appUrl}/api/korapay/webhook`,
      redirect_url: `${appUrl}/api/korapay/callback?reference=${externalId}&userId=${userId}`,
      channels: ["card", "bank_transfer", "mobile_money"],
      metadata: {
        userId,
        nodeKey,
        nodeName,
        originalPrice,
        convertedPrice: price,
        currency,
        purchaseType,
        licenseType,
        paymentModel,
        lockInMonths: lockInMonths || contractMonths || 6,
        lockInMultiplier: lockInMultiplier || 1.0,
        lockInLabel: lockInLabel || contractLabel || "6 months",
      },
    };

    console.log("[korapay/checkout] Sending to KoraPay:", {
      reference: externalId,
      amount: korapayAmount,
      currency,
      email: customerEmail,
    });

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

    let koraData: any;
    const rawText = await koraRes.text();
    try {
      koraData = JSON.parse(rawText);
    } catch {
      koraData = { message: rawText };
    }

    console.log("[korapay/checkout] KoraPay response status:", koraRes.status);
    console.log(
      "[korapay/checkout] KoraPay response:",
      JSON.stringify(koraData).slice(0, 500),
    );

    if (!koraRes.ok || !koraData?.data?.checkout_url) {
      const errorMsg =
        koraData?.message || koraData?.error || `HTTP ${koraRes.status}`;
      console.error("[korapay/checkout] KoraPay failed:", errorMsg);

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

    // Save checkout URL for reference
    await supabaseAdmin
      .from("payment_transactions")
      .update({
        gateway_url: koraData.data.checkout_url,
        updated_at: new Date().toISOString(),
      })
      .eq("id", txn.id);

    return NextResponse.json({
      success: true,
      checkoutUrl: koraData.data.checkout_url,
      referenceId: externalId,
      transactionId: txn.id,
    });
  } catch (err: any) {
    console.error("[korapay/checkout] Unhandled error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
