// app/api/payment/initiate/route.ts
// SECURITY FIX: Added session auth. Was open — any caller could initiate
// payments on behalf of any userId. userId now always from session.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function getPaymentConfig(): Promise<Record<string, string>> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("payment_config")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (!data) return {};
  const cfg: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && v !== undefined) cfg[k] = String(v);
  }
  return cfg;
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userSupabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const {
      data: { user },
      error: authErr,
    } = await userSupabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json(
        { error: "Please sign in to continue." },
        { status: 401 },
      );
    }

    const adminSupabase = getAdminSupabase();
    const body = await req.json();
    const { nodeKey, amount, gateway, cryptoCurrency, applicationData } = body;

    if (!nodeKey || !amount || !gateway) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 },
      );
    }
    if (isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json(
        { error: "Invalid payment amount." },
        { status: 400 },
      );
    }
    if (Number(amount) > 10000) {
      return NextResponse.json(
        { error: "Payment limit is $10,000 USD." },
        { status: 400 },
      );
    }

    const cfg = await getPaymentConfig();
    const userId = user.id; // Always from session

    if (gateway === "korapay") {
      const secretKey = cfg["korapay_secret_key"];
      if (!secretKey) {
        return NextResponse.json(
          { error: "Payment method unavailable. Please contact support." },
          { status: 400 },
        );
      }
      const reference = `OT-${userId.slice(0, 8)}-${Date.now()}`;
      const koraRes = await fetch(
        "https://api.korapay.com/merchant/api/v1/charges/initialize",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${secretKey}`,
          },
          body: JSON.stringify({
            reference,
            amount: Math.round(Number(amount) * 1600),
            currency: "NGN",
            notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/korapay/webhook`,
            channels: ["card", "bank_transfer"],
            metadata: { userId, nodeKey },
          }),
        },
      );
      const koraData = await koraRes.json();
      if (!koraData.data?.checkout_url) {
        return NextResponse.json(
          { error: "Payment initialization failed. Please try again." },
          { status: 400 },
        );
      }
      await adminSupabase.from("payment_transactions").insert({
        user_id: userId,
        node_key: nodeKey,
        amount: Number(amount),
        currency: "NGN",
        gateway: "korapay",
        gateway_reference: reference,
        status: "pending",
        application_data: applicationData,
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({
        checkoutUrl: koraData.data.checkout_url,
        reference,
      });
    }

    if (gateway === "stripe") {
      const secretKey = cfg["stripe_secret_key"];
      if (!secretKey) {
        return NextResponse.json(
          { error: "Payment method unavailable. Please contact support." },
          { status: 400 },
        );
      }
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
      const stripeRes = await fetch(
        "https://api.stripe.com/v1/checkout/sessions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Bearer ${secretKey}`,
          },
          body: new URLSearchParams({
            "payment_method_types[]": "card",
            "line_items[0][price_data][currency]": "usd",
            "line_items[0][price_data][unit_amount]": String(
              Math.round(Number(amount) * 100),
            ),
            "line_items[0][price_data][product_data][name]": `Node License: ${nodeKey}`,
            "line_items[0][quantity]": "1",
            mode: "payment",
            success_url: `${appUrl}/dashboard/node-upgrade/success?session_id={CHECKOUT_SESSION_ID}&node=${nodeKey}`,
            cancel_url: `${appUrl}/dashboard/node-upgrade`,
            "metadata[userId]": userId,
            "metadata[nodeKey]": nodeKey,
          }),
        },
      );
      const stripeData = await stripeRes.json();
      if (!stripeData.url) {
        return NextResponse.json(
          { error: "Payment initialization failed. Please try again." },
          { status: 400 },
        );
      }
      await adminSupabase.from("payment_transactions").insert({
        user_id: userId,
        node_key: nodeKey,
        amount: Number(amount),
        currency: "USD",
        gateway: "stripe",
        gateway_reference: stripeData.id,
        status: "pending",
        application_data: applicationData,
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({
        checkoutUrl: stripeData.url,
        reference: stripeData.id,
      });
    }

    if (gateway === "crypto") {
      const discount = Number(cfg["crypto_discount_percent"] || 5);
      const discountedAmount = Number(amount) * (1 - discount / 100);
      let walletAddress = "";
      let cryptoAmount = 0;

      if (cryptoCurrency === "BTC") {
        walletAddress = cfg["crypto_wallet_btc"] || "";
        cryptoAmount = discountedAmount / 65000;
      } else if (cryptoCurrency === "USDT_TRC20") {
        walletAddress = cfg["crypto_wallet_usdt_trc20"] || "";
        cryptoAmount = discountedAmount;
      } else if (cryptoCurrency === "USDT_ERC20") {
        walletAddress = cfg["crypto_wallet_usdt_erc20"] || "";
        cryptoAmount = discountedAmount;
      }

      if (!walletAddress) {
        return NextResponse.json(
          { error: `${cryptoCurrency} is not currently available.` },
          { status: 400 },
        );
      }
      const reference = `OT-CRYPTO-${userId.slice(0, 8)}-${Date.now()}`;
      await adminSupabase.from("payment_transactions").insert({
        user_id: userId,
        node_key: nodeKey,
        amount: discountedAmount,
        currency: "USD",
        gateway: "crypto",
        gateway_reference: reference,
        crypto_currency: cryptoCurrency,
        crypto_amount: cryptoAmount,
        crypto_wallet: walletAddress,
        status: "pending",
        application_data: applicationData,
        created_at: new Date().toISOString(),
      });
      return NextResponse.json({
        walletAddress,
        reference,
        discount,
        cryptoAmount: cryptoAmount.toFixed(cryptoCurrency === "BTC" ? 8 : 2),
        cryptoCurrency,
        discountedAmount: discountedAmount.toFixed(2),
      });
    }

    return NextResponse.json(
      { error: "Unknown payment method." },
      { status: 400 },
    );
  } catch (err: any) {
    console.error("[payment/initiate] Error:", err.code || "unknown");
    return NextResponse.json(
      { error: "Payment initialization failed. Please try again." },
      { status: 500 },
    );
  }
}
