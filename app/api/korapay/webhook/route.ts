// app/api/korapay/webhook/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

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
    const body = await req.json();
    console.log("[v0] KoraPay webhook received:", body);

    const { data, event } = body;
    const reference = data?.reference;

    if (!reference) {
      return NextResponse.json({ error: "Missing reference" }, { status: 400 });
    }

    // Verify webhook signature if KoraPay provides one
    // (Add signature verification based on KoraPay's documentation)

    if (event === "charge.success") {
      // Payment successful
      const { data: txData } = await supabaseAdmin
        .from("payment_transactions")
        .select("*")
        .eq("gateway_reference", reference)
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
      const now = new Date().toISOString();
      const expiryDate = new Date(
        Date.now() + 4 * 365 * 24 * 3600 * 1000,
      ).toISOString();

      // Update transaction to confirmed
      await supabaseAdmin
        .from("payment_transactions")
        .update({
          status: "confirmed",
          verified_by_admin: true,
          updated_at: now,
        })
        .eq("id", txData.id);

      // Update user tier + license
      await supabaseAdmin
        .from("users")
        .update({
          tier: txData.node_key,
          has_operator_license: true,
          has_opertor_license: true, // handle typo column too
          node_activated_at: now,
          node_expiry_date: expiryDate,
          license_expires_at: expiryDate,
        })
        .eq("id", txData.user_id);

      // Create node allocation with lock-in data
      await supabaseAdmin
        .from("node_allocations")
        .insert({
          user_id: txData.user_id,
          plan_id: txData.node_key,
          amount_invested: txData.amount,
          instance_type: metadata.itype || "on_demand",
          status: "active",
          lock_in_months: metadata.lockInMonths || 6,
          lock_in_multiplier: metadata.lockInMultiplier || 1.0,
          lock_in_label: metadata.lockInLabel || "6 months",
          total_earned: 0,
          total_withdrawn: 0,
          created_at: now,
          updated_at: now,
        })
        .maybeSingle();

      // Write to transaction_ledger — ALLOWED type is "license_purchase"
      await supabaseAdmin
        .from("transaction_ledger")
        .insert({
          user_id: txData.user_id,
          type: "license_purchase",
          amount: txData.amount,
          description: `GPU Node License activated via KoraPay: ${txData.node_key} (${metadata.lockInLabel || "6 months"} lock-in)`,
          reference_id: String(txData.id),
          metadata: {
            nodeKey: txData.node_key,
            lockInMonths: metadata.lockInMonths || 6,
            lockInMultiplier: metadata.lockInMultiplier || 1.0,
            lockInLabel: metadata.lockInLabel || "6 months",
            gateway: "korapay",
          },
          created_at: now,
        })
        .maybeSingle();

      // ALSO write to transactions table so Financial page picks it up
      await supabaseAdmin
        .from("transactions")
        .insert({
          user_id: txData.user_id,
          type: "license_purchase",
          amount: txData.amount,
          description: `GPU Node License via KoraPay: ${txData.node_key} (${metadata.lockInLabel || "6 months"})`,
          reference_id: String(txData.id),
          metadata: {
            nodeKey: txData.node_key,
            lockInMonths: metadata.lockInMonths || 6,
            lockInMultiplier: metadata.lockInMultiplier || 1.0,
            lockInLabel: metadata.lockInLabel || "6 months",
            gateway: "korapay",
          },
          created_at: now,
        })
        .maybeSingle();

      return NextResponse.json({ success: true, processed: true });
    } else if (event === "charge.failed" || event === "charge.declined") {
      // Payment failed
      const now = new Date().toISOString();
      await supabaseAdmin
        .from("payment_transactions")
        .update({
          status: "declined",
          updated_at: now,
        })
        .eq("gateway_reference", reference);

      return NextResponse.json({ success: true, processed: true });
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
