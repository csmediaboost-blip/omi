import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/api-security";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 20; // 20 second timeout for payment processing

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

/**
 * Fetch live exchange rate from external API
 * Falls back to config value if API fails
 * Caches rate for 1 hour
 */
async function getLiveExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  fallbackRate: number
): Promise<{ rate: number; source: string; timestamp: string }> {
  try {
    // Try to fetch from exchangerate-api.com (free tier available)
    const cacheKey = `exchange_rate_${fromCurrency}_${toCurrency}`;
    
    // Check if we have a cached rate less than 1 hour old
    const adminSupabase = getAdminSupabase();
    const { data: cached } = await adminSupabase
      .from("exchange_rate_cache")
      .select("rate, created_at")
      .eq("from_currency", fromCurrency)
      .eq("to_currency", toCurrency)
      .gt("created_at", new Date(Date.now() - 3600000).toISOString())
      .single();

    if (cached) {
      return {
        rate: cached.rate,
        source: "cache",
        timestamp: cached.created_at,
      };
    }

    // Fetch live rate (you'd need an API key - using config)
    const apiKey = process.env.EXCHANGE_RATE_API_KEY || "";
    
    let liveRate = fallbackRate;
    let source = "config";

    if (apiKey && fromCurrency === "USD" && toCurrency === "NGN") {
      try {
        const res = await fetch(
          `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${fromCurrency}`,
          { 
            signal: AbortSignal.timeout(5000) // 5 second timeout
          }
        );
        
        if (res.ok) {
          const data = await res.json();
          liveRate = data.conversion_rates[toCurrency] || fallbackRate;
          source = "api";
        }
      } catch (err) {
        console.warn("[EXCHANGE_RATE] API fetch failed, using fallback:", err);
      }
    }

    // Cache the rate
    await adminSupabase
      .from("exchange_rate_cache")
      .insert({
        from_currency: fromCurrency,
        to_currency: toCurrency,
        rate: liveRate,
        created_at: new Date().toISOString(),
      })
      .catch(err => console.error("Failed to cache exchange rate:", err));

    return {
      rate: liveRate,
      source,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[EXCHANGE_RATE] Error:", err);
    return {
      rate: fallbackRate,
      source: "fallback",
      timestamp: new Date().toISOString(),
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify user authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { userId: authenticatedUserId } = authResult;

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

    // Verify requesting user matches the userId in the request
    if (userId !== authenticatedUserId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot initiate payment for another user" },
        { status: 403 },
      );
    }

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

      // FEATURE: Fetch live exchange rate instead of hardcoding
      const configRate = parseFloat(cfg["usd_ngn_rate"] || "1550");
      const exchangeRateData = await getLiveExchangeRate("USD", "NGN", configRate);
      const ngnAmount = Math.round(amount * exchangeRateData.rate);

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
            amount: ngnAmount,
            currency: "NGN",
            notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/payment/webhook/korapay`,
            channels: ["card", "bank_transfer"],
            metadata: { 
              userId, 
              nodeKey,
              usdAmount: amount,
              ngnAmount,
              exchangeRate: exchangeRateData.rate,
              exchangeRateSource: exchangeRateData.source,
            },
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

      // Save transaction with exchange rate info
      await adminSupabase.from("payment_transactions").insert({
        user_id: userId,
        node_key: nodeKey,
        amount,
        currency: "NGN",
        gateway: "korapay",
        gateway_reference: reference,
        status: "pending",
        application_data: applicationData,
        exchange_rate: exchangeRateData.rate,
        exchange_rate_source: exchangeRateData.source,
        exchange_rate_timestamp: exchangeRateData.timestamp,
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
