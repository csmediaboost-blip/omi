// app/api/checkout/route.ts
// FIXED: uses correct column name has_operator_license (not has_opertor_license)
// FIXED: passes all metadata correctly for license vs gpu_plan purchases
// FIXED: activateNode now handles both license and gpu_plan purchase types

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAuth } from "@/lib/api-security";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function getGatewayConfig() {
  const supabaseAdmin = getSupabaseAdmin();
  const { data } = await supabaseAdmin
    .from("payment_config")
    .select("key,value");
  const cfg: Record<string, string> = {};
  (data || []).forEach((r: any) => {
    cfg[r.key] = r.value;
  });
  return cfg;
}

export async function POST(req: NextRequest) {
  try {
    // SECURITY: Verify user authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { userId: authenticatedUserId } = authResult;

    const supabaseAdmin = getSupabaseAdmin();
    const body = await req.json();
    const {
      userId,
      nodeKey,
      amount,
      currency = "USD",
      itype = "on_demand",
      payMethod = "card",
      countryCode,
      cardLast4,
      cardType,
      cardName,
      phone,
      walletAddress,
      gateway = "moonpay",
      // Purchase type
      purchaseType = "gpu_plan",
      licenseType,
      // Contract/lock-in data
      paymentModel = "flexible",
      contractMonths,
      contractLabel,
      contractMinPct,
      contractMaxPct,
      lockInMonths = 0,
      lockInMultiplier = 1,
      lockInLabel = "Flexible",
    } = body;

    if (!userId || !nodeKey || !amount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // SECURITY: Verify requesting user matches userId
    if (userId !== authenticatedUserId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot checkout for another user" },
        { status: 403 },
      );
    }

    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    if (userErr || !user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const cfg = await getGatewayConfig();
    const externalId = `omni_${userId.slice(0, 8)}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const isDev =
      process.env.NODE_ENV === "development" ||
      !cfg.moonpay_api_key ||
      cfg.moonpay_api_key === "EMPTY";

    const sharedMetadata = {
      purchaseType,
      licenseType: purchaseType === "license" ? licenseType || nodeKey : null,
      paymentModel,
      contractMonths: contractMonths || null,
      contractLabel: contractLabel || null,
      contractMinPct: contractMinPct || null,
      contractMaxPct: contractMaxPct || null,
      lockInMonths,
      lockInMultiplier,
      lockInLabel,
      itype,
      countryCode,
      externalId,
    };

    // ── TrustWallet / Crypto: save as PENDING — admin approves manually ──
    if (payMethod === "trustwallet" || gateway === "trustwallet") {
      const { data: txn, error: txnErr } = await supabaseAdmin
        .from("payment_transactions")
        .insert({
          user_id: userId,
          node_key: nodeKey,
          amount,
          currency: "USDT",
          gateway: "trustwallet",
          gateway_reference: externalId,
          status: "pending",
          crypto_currency: "USDT",
          crypto_network: "TRC20",
          crypto_wallet: walletAddress || null,
          verified_by_admin: false,
          metadata: JSON.stringify(sharedMetadata),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (txnErr) {
        console.error("Payment transaction insert error:", txnErr);
        return NextResponse.json({ error: txnErr.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        transactionId: txn.id,
        externalId,
        status: "pending",
        requiresAdminApproval: true,
      });
    }

    // ── KoraPay ──
    if (payMethod === "korapay") {
      const korapayKey = cfg.korapay_secret_key || cfg.korapay_api_key;
      if (!korapayKey || korapayKey === "EMPTY") {
        return NextResponse.json(
          { error: "KoraPay not configured" },
          { status: 500 },
        );
      }

      const { data: txn, error: txnErr } = await supabaseAdmin
        .from("payment_transactions")
        .insert({
          user_id: userId,
          node_key: nodeKey,
          amount,
          currency,
          gateway: "korapay",
          gateway_reference: externalId,
          status: "pending",
          metadata: JSON.stringify(sharedMetadata),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (txnErr) {
        return NextResponse.json({ error: txnErr.message }, { status: 500 });
      }

      try {
        const koraRes = await fetch(
          "https://api.korapay.com/merchant/api/v1/charges/initialize",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${korapayKey}`,
            },
            body: JSON.stringify({
              reference: externalId,
              amount: amount,
              currency: countryCode === "NG" ? "NGN" : "USD",
              customer: {
                email: user.email,
                name: user.full_name || "OmniTask User",
                phone: phone || "",
              },
              notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/korapay/webhook`,
              redirect_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/korapay/callback?reference=${externalId}&userId=${userId}`,
              metadata: { userId, nodeKey, ...sharedMetadata },
            }),
          },
        );

        const koraData = await koraRes.json();
        if (!koraRes.ok) {
          await supabaseAdmin
            .from("payment_transactions")
            .update({
              status: "failed",
              failure_reason: koraData.message || "KoraPay init failed",
            })
            .eq("id", txn.id);
          return NextResponse.json(
            { error: koraData.message || "Failed to initialize KoraPay" },
            { status: 502 },
          );
        }

        return NextResponse.json({
          success: true,
          transactionId: txn.id,
          checkoutUrl: koraData.data?.checkout_url,
          status: "pending",
        });
      } catch (err: any) {
        return NextResponse.json(
          { error: "Failed to connect to KoraPay" },
          { status: 502 },
        );
      }
    }

    // ── Card payment ──
    const { data: txn, error: txnErr } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        user_id: userId,
        node_key: nodeKey,
        amount,
        currency,
        gateway,
        gateway_reference: externalId,
        status: "pending",
        card_last4: cardLast4 || null,
        card_type: cardType || null,
        card_name: cardName || null,
        metadata: JSON.stringify(sharedMetadata),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (txnErr) {
      return NextResponse.json({ error: txnErr.message }, { status: 500 });
    }

    // Dev mode: instant approval
    if (isDev) {
      await activatePurchase({
        userId,
        nodeKey,
        transactionId: txn.id,
        amount,
        purchaseType,
        licenseType: licenseType || nodeKey,
        paymentModel,
        contractMonths,
        contractLabel,
        contractMinPct,
        contractMaxPct,
        lockInMonths,
        lockInMultiplier,
        lockInLabel,
        itype,
      });

      return NextResponse.json({
        success: true,
        transactionId: externalId,
        externalId,
        status: "confirmed",
      });
    }

    // Production MoonPay
    if (cfg.moonpay_api_key && cfg.moonpay_api_key !== "EMPTY") {
      const receivingWallet = cfg.crypto_wallet_usdt_trc20 || "";
      const moonRes = await fetch("https://api.moonpay.com/v1/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": cfg.moonpay_api_key,
        },
        body: JSON.stringify({
          baseCurrencyAmount: amount,
          baseCurrencyCode: currency.toLowerCase(),
          currencyCode: "usdt_trc20",
          walletAddress: receivingWallet,
          externalTransactionId: externalId,
          email: user.email,
          returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/checkout/complete`,
          webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/checkout/webhook`,
          paymentMethod: "credit_debit_card",
          theme: "dark",
        }),
      });

      if (!moonRes.ok) {
        const errText = await moonRes.text();
        throw new Error(`MoonPay error: ${errText}`);
      }

      const moonData = await moonRes.json();
      return NextResponse.json({
        success: true,
        transactionId: externalId,
        gatewayUrl: moonData.url,
        status: "pending",
        requiresRedirect: true,
      });
    }

    // Fallback: activate directly
    await activatePurchase({
      userId,
      nodeKey,
      transactionId: txn.id,
      amount,
      purchaseType,
      licenseType: licenseType || nodeKey,
      paymentModel,
      contractMonths,
      contractLabel,
      contractMinPct,
      contractMaxPct,
      lockInMonths,
      lockInMultiplier,
      lockInLabel,
      itype,
    });

    return NextResponse.json({
      success: true,
      transactionId: externalId,
      status: "confirmed",
    });
  } catch (err: any) {
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: err.message || "Payment failed" },
      { status: 500 },
    );
  }
}

// ── Activate purchase after confirmed payment ─────────────────────────────────
async function activatePurchase({
  userId,
  nodeKey,
  transactionId,
  amount,
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
  itype,
}: {
  userId: string;
  nodeKey: string;
  transactionId: number;
  amount: number;
  purchaseType: string;
  licenseType: string;
  paymentModel: string;
  contractMonths?: number;
  contractLabel?: string;
  contractMinPct?: number;
  contractMaxPct?: number;
  lockInMonths: number;
  lockInMultiplier: number;
  lockInLabel: string;
  itype: string;
}) {
  const now = new Date().toISOString();
  const fourYears = new Date(
    Date.now() + 4 * 365 * 24 * 3600 * 1000,
  ).toISOString();

  // Confirm payment transaction
  await supabaseAdmin
    .from("payment_transactions")
    .update({
      status: "confirmed",
      verified_by_admin: true,
      confirmed_at: now,
      updated_at: now,
    })
    .eq("id", transactionId);

  if (purchaseType === "license") {
    // ── ACTIVATE LICENSE ──
    const resolvedLicenseType =
      licenseType === "operator_license" ? "all" : licenseType;

    // Write to operator_licenses — trigger will sync to users table
   await supabaseAdmin.from("operator_licenses").upsert(
     {
       user_id: userId,
       license_type: resolvedLicenseType,
       status: "active",
       expires_at: fourYears,
       purchased_at: now,
       amount_paid: amount,
       transaction_ref: String(transactionId),
     },
     { onConflict: "user_id,license_type" },
   );
    // Also directly update users (belt and suspenders)
    await supabaseAdmin
      .from("users")
      .update({
        has_operator_license: true, // correct column name
        license_expires_at: fourYears,
        node_activated_at: now,
      })
      .eq("id", userId);
  } else {
    // ── ACTIVATE GPU NODE ──
    const isContract = paymentModel === "contract";
    const maturityDate =
      isContract && contractMonths
        ? new Date(
            Date.now() + contractMonths * 30 * 24 * 3600 * 1000,
          ).toISOString()
        : null;

    await supabaseAdmin.from("node_allocations").insert({
      user_id: userId,
      plan_id: nodeKey,
      amount_invested: amount,
      currency: "USD",
      instance_type: itype,
      payment_model: paymentModel,
      contract_months: contractMonths || null,
      contract_label: contractLabel || null,
      contract_min_pct: contractMinPct || null,
      contract_max_pct: contractMaxPct || null,
      maturity_date: maturityDate,
      lock_in_months: lockInMonths,
      lock_in_multiplier: lockInMultiplier,
      lock_in_label: lockInLabel,
      status: "active",
      total_earned: 0,
      total_withdrawn: 0,
      created_at: now,
      updated_at: now,
    });

    // Update user balance_locked
    const { data: u } = await supabaseAdmin
      .from("users")
      .select("balance_locked")
      .eq("id", userId)
      .single();
    await supabaseAdmin
      .from("users")
      .update({
        balance_locked: (u?.balance_locked || 0) + amount,
      })
      .eq("id", userId);
  }

  // Write to transaction_ledger
  try {
    await supabaseAdmin.from("transaction_ledger").insert({
      user_id: userId,
      type: purchaseType === "license" ? "license_purchase" : "investment",
      amount,
      description:
        purchaseType === "license"
          ? `Operator License activated: ${licenseType}`
          : `GPU Node investment: ${nodeKey} (${lockInLabel})`,
      reference_id: String(transactionId),
      metadata: {
        nodeKey,
        purchaseType,
        licenseType,
        paymentModel,
        lockInMonths,
        lockInLabel,
      },
      created_at: now,
    });
  } catch (e) {
    /* ledger optional */
  }
}

export {};
