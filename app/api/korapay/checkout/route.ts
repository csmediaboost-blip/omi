// app/api/korapay/checkout/route.ts
// Initiates KoraPay checkout session

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

// ── Currency → minor-unit multiplier ──────────────────────────
// KoraPay expects amounts in the SMALLEST unit of the currency.
// NGN, KES, GHS, TZS, XAF, XOF, EGP → kobo / cents / pesewas etc.
// Most African currencies use 100 subunits, TZS uses 100 too.
const MINOR_UNIT_MULTIPLIER: Record<string, number> = {
  NGN: 100,
  KES: 100,
  GHS: 100,
  ZAR: 100,
  XAF: 1, // XAF has no subunit — KoraPay accepts whole units
  XOF: 1, // same
  EGP: 100,
  TZS: 100,
  USD: 100,
};

function toMinorUnits(amount: number, currency: string): number {
  const multiplier = MINOR_UNIT_MULTIPLIER[currency] ?? 100;
  return Math.round(amount * multiplier);
}

// ── Derive currency from country code (fallback) ──────────────
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
  return map[countryCode] ?? "USD";
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
      price, // converted local-currency amount (e.g. 766000 NGN)
      originalPrice, // USD amount (e.g. 1000)
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

    console.log("[korapay] checkout request:", {
      userId,
      price,
      rawCurrency,
      countryCode,
      originalPrice,
    });

    // ── Guard: userId must be present ─────────────────────────
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    // ── Resolve currency — FIX: was using broken ternary ──────
    // Always use the currency passed from the frontend; fall back
    // to deriving it from countryCode; last resort USD.
    const currency: string =
      rawCurrency && rawCurrency !== "USD" && rawCurrency !== ""
        ? rawCurrency
        : currencyForCountry(countryCode);

    // ── Validate USD limit ─────────────────────────────────────
    if (originalPrice > 10000) {
      return NextResponse.json(
        {
          error:
            "Payment limit is $10,000 USD. Please choose a different method.",
        },
        { status: 400 },
      );
    }

    // ── Sanitise phone ─────────────────────────────────────────
    let finalPhone = (phone || "").trim();
    if (!finalPhone || finalPhone.length < 10) {
      // Build a numeric fallback from userId — never null
      finalPhone = userId
        .replace(/[^0-9]/g, "")
        .padEnd(11, "0")
        .slice(0, 11);
    }
    // Strip non-numeric except leading +
    finalPhone = finalPhone.replace(/[^0-9+]/g, "");
    if (finalPhone.length < 10) {
      finalPhone = finalPhone.padEnd(10, "0");
    }

    // ── Load KoraPay key from payment_config ──────────────────
    const { data: configData } = await supabaseAdmin
      .from("payment_config")
      .select("key, value");

    const cfg: Record<string, string> = {};
    (configData || []).forEach((r: any) => {
      cfg[r.key] = r.value;
    });

    const korapayKey =
      cfg.korapay_secret_key ||
      cfg.korapay_api_key ||
      process.env.KORAPAY_SECRET_KEY ||
      "";

    if (!korapayKey || korapayKey === "EMPTY" || korapayKey === "") {
      console.error("[korapay] Secret key not configured");
      return NextResponse.json(
        { error: "Payment gateway not configured. Please contact support." },
        { status: 500 },
      );
    }

    // ── Load user email ────────────────────────────────────────
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    const customerEmail =
      user?.email || cfg.support_email || "noreply@omnitaskpro.online";
    const customerName = user?.full_name || "OmniTask User";

    // ── Build reference ────────────────────────────────────────
    const externalId = `omni_${userId.slice(0, 8)}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    // ── Insert pending transaction ─────────────────────────────
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
          phone: finalPhone,
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
          contractMonths,
          contractLabel,
          contractMinPct,
          contractMaxPct,
          lockInMonths: lockInMonths || contractMonths || 6,
          lockInMultiplier: lockInMultiplier || 1.0,
          lockInLabel: lockInLabel || contractLabel || "6 months",
          itype,
        },
      })
      .select()
      .single();

    if (txnErr) {
      console.error("[korapay] Transaction insert error:", txnErr);
      return NextResponse.json({ error: txnErr.message }, { status: 500 });
    }

    // ── Compute amount in minor units ──────────────────────────
    // FIX: always use the correct multiplier per currency
    const amountInMinorUnits = toMinorUnits(price, currency);

    console.log("[korapay] Sending to KoraPay:", {
      reference: externalId,
      amount: amountInMinorUnits,
      currency,
      email: customerEmail,
    });

    // ── Call KoraPay initialize endpoint ──────────────────────
    try {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "https://omnitaskpro.online";

      const koraRes = await fetch(
        "https://api.korapay.com/merchant/api/v1/charges/initialize",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${korapayKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reference: externalId,
            amount: amountInMinorUnits,
            currency, // ← FIX: now always correct
            customer: {
              name: customerName,
              email: customerEmail, // ← required by KoraPay
              phone: finalPhone,
            },
            notification_url: `${appUrl}/api/korapay/webhook`,
            redirect_url: `${appUrl}/api/korapay/callback?reference=${externalId}&userId=${userId}`,
            channels: ["card", "bank_transfer", "mobile_money"], // allow all
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
          }),
        },
      );

      const koraData = await koraRes.json();
      console.log("[korapay] API response status:", koraRes.status);
      console.log("[korapay] API response body:", JSON.stringify(koraData));

      if (!koraRes.ok || !koraData.data?.checkout_url) {
        console.error("[korapay] Initialization failed:", koraData);

        // Mark transaction failed
        await supabaseAdmin
          .from("payment_transactions")
          .update({
            status: "failed",
            failure_reason: koraData.message || "KoraPay initialization failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", txn.id);

        return NextResponse.json(
          {
            error:
              koraData.message ||
              "Failed to initialize payment. Please try again.",
          },
          { status: 500 },
        );
      }

      // ── Store checkout URL ─────────────────────────────────
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
      console.error("[korapay] API call error:", err);

      await supabaseAdmin
        .from("payment_transactions")
        .update({
          status: "failed",
          failure_reason: err.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", txn?.id);

      return NextResponse.json(
        { error: "Failed to connect to payment gateway. Please try again." },
        { status: 502 },
      );
    }
  } catch (err: any) {
    console.error("[korapay] Unhandled error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
