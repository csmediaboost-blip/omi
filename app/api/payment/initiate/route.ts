import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getConfig(): Promise<Record<string, string>> {
  const adminSupabase = getAdminSupabase();
  const { data } = await adminSupabase
    .from("payment_config")
    .select("key, value");
  const cfg: Record<string, string> = {};
  (data || []).forEach((r) => {
    cfg[r.key] = r.value || "";
  });
  return cfg;
}

export async function POST(req: NextRequest) {
  try {
    const adminSupabase = getAdminSupabase();
    const body = await req.json();
    const {
      userId,
      nodeKey,
      amount,
      gateway,
      cryptoCurrency,
      applicationData,
    } = body;

    if (!userId || !nodeKey || !amount || !gateway) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const cfg = await getConfig();

    // ── KORAPAY ────────────────────────────────────────────────────────────
    if (gateway === "korapay") {
      const secretKey = cfg["korapay_secret_key"];
      if (!secretKey)
        return NextResponse.json(
          { error: "Korapay not configured" },
          { status: 400 },
        );

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
            amount: Math.round(amount * 1550), // NGN conversion (approx)
            currency: "NGN",
            notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/payment/webhook/korapay`,
            channels: ["card", "bank_transfer"],
            metadata: { userId, nodeKey },
          }),
        },
      );

      const koraData = await koraRes.json();
      if (!koraData.data?.checkout_url) {
        return NextResponse.json(
          { error: "Korapay initialization failed", detail: koraData },
          { status: 400 },
        );
      }

      // Save transaction
      await adminSupabase.from("payment_transactions").insert({
        user_id: userId,
        node_key: nodeKey,
        amount,
        currency: "NGN",
        gateway: "korapay",
        gateway_reference: reference,
        status: "pending",
        application_data: applicationData,
      });

      return NextResponse.json({
        checkoutUrl: koraData.data.checkout_url,
        reference,
      });
    }

    // ── STRIPE ─────────────────────────────────────────────────────────────
    if (gateway === "stripe") {
      const secretKey = cfg["stripe_secret_key"];
      if (!secretKey)
        return NextResponse.json(
          { error: "Stripe not configured" },
          { status: 400 },
        );

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
              Math.round(amount * 100),
            ),
            "line_items[0][price_data][product_data][name]": `OmniTask ${nodeKey} Node License`,
            "line_items[0][quantity]": "1",
            mode: "payment",
            success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/node-upgrade/success?session_id={CHECKOUT_SESSION_ID}&node=${nodeKey}`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/node-upgrade`,
            "metadata[userId]": userId,
            "metadata[nodeKey]": nodeKey,
          }),
        },
      );

      const stripeData = await stripeRes.json();
      if (!stripeData.url) {
        return NextResponse.json(
          { error: "Stripe initialization failed", detail: stripeData },
          { status: 400 },
        );
      }

      await adminSupabase.from("payment_transactions").insert({
        user_id: userId,
        node_key: nodeKey,
        amount,
        currency: "USD",
        gateway: "stripe",
        gateway_reference: stripeData.id,
        status: "pending",
        application_data: applicationData,
      });

      return NextResponse.json({
        checkoutUrl: stripeData.url,
        reference: stripeData.id,
      });
    }

    // ── CRYPTO ─────────────────────────────────────────────────────────────
    if (gateway === "crypto") {
      const discount = Number(cfg["crypto_discount_percent"] || 5);
      const discountedAmount = amount * (1 - discount / 100);

      let walletAddress = "";
      let cryptoAmount = 0;

      if (cryptoCurrency === "BTC") {
        walletAddress = cfg["crypto_wallet_btc"];
        // Approximate BTC rate (in production use live price API)
        cryptoAmount = discountedAmount / 65000;
      } else if (cryptoCurrency === "USDT_TRC20") {
        walletAddress = cfg["crypto_wallet_usdt_trc20"];
        cryptoAmount = discountedAmount; // 1:1 with USD
      } else if (cryptoCurrency === "USDT_ERC20") {
        walletAddress = cfg["crypto_wallet_usdt_erc20"];
        cryptoAmount = discountedAmount;
      }

      if (!walletAddress) {
        return NextResponse.json(
          { error: `${cryptoCurrency} wallet not configured` },
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
      });

      return NextResponse.json({
        walletAddress,
        cryptoAmount: cryptoAmount.toFixed(cryptoCurrency === "BTC" ? 8 : 2),
        cryptoCurrency,
        reference,
        discountedAmount: discountedAmount.toFixed(2),
        discount,
      });
    }

    return NextResponse.json({ error: "Unknown gateway" }, { status: 400 });
  } catch (err: any) {
    console.error("Payment error:", err);
    return NextResponse.json(
      { error: err.message || "Payment failed" },
      { status: 500 },
    );
  }
}
