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

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const {
      userId,
      phone,
      nodeKey,
      nodeName,
      price,
      daily,
      recovery,
      gpu,
      vram,
      itype,
      lockInMonths,
      lockInMultiplier,
      lockInLabel,
      countryCode,
      countryName,
    } = await req.json();

    if (!userId || !phone) {
      return NextResponse.json(
        { error: "Missing userId or phone number" },
        { status: 400 },
      );
    }

    // Get KoraPay API key from payment_config
    const { data: configData } = await supabaseAdmin
      .from("payment_config")
      .select("key, value")
      .in("key", ["korapay_secret_key", "korapay_api_key"]);

    const cfg: Record<string, string> = {};
    (configData || []).forEach((r: any) => {
      cfg[r.key] = r.value;
    });

    const korapayKey = cfg.korapay_secret_key || cfg.korapay_api_key;

    if (!korapayKey || korapayKey === "EMPTY") {
      return NextResponse.json(
        { error: "KoraPay not configured" },
        { status: 500 },
      );
    }

    // Get user email
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    const externalId = `omni_${userId.slice(0, 8)}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    // Create a transaction record first
    const { data: txn, error: txnErr } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        user_id: userId,
        node_key: nodeKey,
        amount: price,
        currency: "USD",
        gateway: "korapay",
        gateway_reference: externalId,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          gateway: "korapay",
          externalId,
          phone,
          countryCode,
          lockInMonths: lockInMonths || 6,
          lockInMultiplier: lockInMultiplier || 1.0,
          lockInLabel: lockInLabel || "6 months",
          itype,
        },
      })
      .select()
      .single();

    if (txnErr) {
      console.error("[v0] Transaction insert error:", txnErr);
      return NextResponse.json({ error: txnErr.message }, { status: 500 });
    }

    // Initialize KoraPay checkout
    try {
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
            amount: Math.round(price * 100), // KoraPay expects minor units (cents)
            currency: countryCode === "NG" ? "NGN" : "USD",
            customer: {
              name: user?.full_name || "OmniTask User",
              email: user?.email || "user@omnit ask.com",
              phone: phone,
            },
            notification_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/korapay/webhook`,
            redirect_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/korapay/callback?reference=${externalId}&userId=${userId}`,
            metadata: {
              userId,
              nodeKey,
              lockInMonths: lockInMonths || 6,
              lockInMultiplier: lockInMultiplier || 1.0,
              lockInLabel: lockInLabel || "6 months",
            },
          }),
        },
      );

      const koraData = await koraRes.json();

      if (!koraRes.ok || !koraData.data?.checkout_url) {
        console.error("[v0] KoraPay initialization failed:", koraData);
        // Mark transaction as failed
        await supabaseAdmin
          .from("payment_transactions")
          .update({
            status: "failed",
            failure_reason: koraData.message || "Initialization failed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", txn.id);

        return NextResponse.json(
          {
            error: koraData.message || "Failed to initialize KoraPay checkout",
          },
          { status: 500 },
        );
      }

      // Store checkout URL in transaction
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
      console.error("[v0] KoraPay API error:", err);
      await supabaseAdmin
        .from("payment_transactions")
        .update({
          status: "failed",
          failure_reason: err.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", txn.id);

      return NextResponse.json(
        { error: "Failed to connect to KoraPay" },
        { status: 502 },
      );
    }
  } catch (err: any) {
    console.error("[v0] KoraPay checkout error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
