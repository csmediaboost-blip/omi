// app/api/korapay/callback/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(req.url);
    const reference = searchParams.get("reference");
    const userId = searchParams.get("userId");
    const status = searchParams.get("status"); // 'success' or 'decline'

    if (!reference || !userId) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/checkout?error=invalid_params`,
      );
    }

    // Get KoraPay API key
    const { data: configData } = await supabase
      .from("payment_config")
      .select("key, value")
      .eq("key", "korapay_api_key")
      .single();

    if (!configData?.value) {
      console.error("[v0] KoraPay API key not configured");
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/checkout?error=config`,
      );
    }

    const korapayApiKey = configData.value;

    // Verify payment with KoraPay API
    const verifyRes = await fetch(
      `https://api.korapay.com/merchant/api/v1/charges/${reference}/verify`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${korapayApiKey}`,
        },
      },
    );

    const verifyData = await verifyRes.json();
    console.log("[v0] KoraPay verification response:", verifyData);

    if (!verifyRes.ok) {
      console.error("[v0] KoraPay verification failed:", verifyData);
      // Update transaction status to declined
      await supabase
        .from("payment_transactions")
        .update({ status: "declined" })
        .eq("transaction_id", reference);

      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/checkout?status=declined&reference=${reference}`,
      );
    }

    const chargeStatus = verifyData.data?.status;

    if (chargeStatus === "success" || chargeStatus === "completed") {
      // Payment approved! Credit the user
      const { data: txData } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("transaction_id", reference)
        .single();

      if (!txData) {
        console.error("[v0] Transaction not found:", reference);
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/checkout?error=tx_not_found`,
        );
      }

      // Parse metadata to get order details
      const metadata = txData.metadata ? JSON.parse(txData.metadata) : {};

      // Update transaction to approved
      await supabase
        .from("payment_transactions")
        .update({ status: "completed" })
        .eq("transaction_id", reference);

      // Create node allocation
      await supabase.from("node_allocations").insert({
        user_id: userId,
        plan_id: txData.plan_id,
        amount_paid: txData.amount,
        payment_status: "completed",
        payment_gateway: "korapay",
        transaction_id: reference,
        instance_type: txData.instance_type,
        country_code: txData.country_code,
        lock_in_months: metadata.lockInMonths || 6,
        lock_in_multiplier: metadata.lockInMultiplier || 1,
        created_at: new Date().toISOString(),
      });

      // Credit user's account balance (if you have a user_balances table)
      // This is optional - adjust based on your schema
      const { data: existingBalance } = await supabase
        .from("user_balances")
        .select("balance")
        .eq("user_id", userId)
        .single();

      if (existingBalance) {
        await supabase
          .from("user_balances")
          .update({
            balance: existingBalance.balance + txData.amount,
          })
          .eq("user_id", userId);
      } else {
        await supabase.from("user_balances").insert({
          user_id: userId,
          balance: txData.amount,
        });
      }

      // Redirect to success page with transaction ID
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/checkout?status=success&reference=${reference}`,
      );
    } else {
      // Payment declined or pending
      await supabase
        .from("payment_transactions")
        .update({ status: "declined" })
        .eq("transaction_id", reference);

      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/checkout?status=declined&reference=${reference}`,
      );
    }
  } catch (err: any) {
    console.error("[v0] KoraPay callback error:", err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/checkout?error=callback_error`,
    );
  }
}
