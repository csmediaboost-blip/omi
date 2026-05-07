// app/api/korapay/webhook/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await req.json();
    console.log("[v0] KoraPay webhook received:", body);

    const { data, event } = body;
    const reference = data?.reference;

    if (!reference) {
      return NextResponse.json(
        { error: "Missing reference" },
        { status: 400 },
      );
    }

    // Verify webhook signature if KoraPay provides one
    // (Add signature verification based on KoraPay's documentation)

    if (event === "charge.success") {
      // Payment successful
      const { data: txData } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("transaction_id", reference)
        .single();

      if (!txData) {
        console.error("[v0] Transaction not found for webhook:", reference);
        return NextResponse.json(
          { error: "Transaction not found" },
          { status: 404 },
        );
      }

      // Parse metadata
      const metadata = txData.metadata ? JSON.parse(txData.metadata) : {};

      // Update transaction
      await supabase
        .from("payment_transactions")
        .update({ status: "completed" })
        .eq("transaction_id", reference);

      // Create node allocation
      await supabase.from("node_allocations").insert({
        user_id: txData.user_id,
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

      // Credit user balance
      const { data: existingBalance } = await supabase
        .from("user_balances")
        .select("balance")
        .eq("user_id", txData.user_id)
        .single();

      if (existingBalance) {
        await supabase
          .from("user_balances")
          .update({
            balance: existingBalance.balance + txData.amount,
          })
          .eq("user_id", txData.user_id);
      } else {
        await supabase.from("user_balances").insert({
          user_id: txData.user_id,
          balance: txData.amount,
        });
      }

      return NextResponse.json({ success: true });
    } else if (event === "charge.failed" || event === "charge.declined") {
      // Payment failed
      await supabase
        .from("payment_transactions")
        .update({ status: "declined" })
        .eq("transaction_id", reference);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[v0] KoraPay webhook error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 },
    );
  }
}
