// app/api/korapay/webhook/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendGPUInvestmentReceipt } from "@/lib/email-service";
import { verifyKorapaySignature } from "@/lib/webhook-security";

// Prevent this route from being built as a static page
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60; // Allow up to 60 seconds for webhook processing

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
    
    // Get raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get("x-korapay-signature");
    const korapaySecret = process.env.KORAPAY_SECRET_KEY;

    // Verify webhook signature
    if (signature && korapaySecret) {
      if (!verifyKorapaySignature(rawBody, signature, korapaySecret)) {
        console.error("[v0] Invalid KoraPay webhook signature");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
    }

    const body = JSON.parse(rawBody);
    console.log("[v0] KoraPay webhook verified:", body);

    const { data, event } = body;
    const reference = data?.reference;

    if (!reference) {
      return NextResponse.json({ error: "Missing reference" }, { status: 400 });
    }

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

      // Get user details for email
      const { data: userData } = await supabaseAdmin
        .from("users")
        .select("email, full_name")
        .eq("id", txData.user_id)
        .single();

      // Parse metadata
      const metadata = txData.metadata ? (typeof txData.metadata === 'string' ? JSON.parse(txData.metadata) : txData.metadata) : {};
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

      // Create node allocation with lock-in data - use CONVERTED amount for fees/calculations
      await supabaseAdmin
        .from("node_allocations")
        .insert({
          user_id: txData.user_id,
          plan_id: txData.node_key,
          amount_invested: txData.amount, // Original USD for records
          amount_paid: txData.converted_amount || txData.amount, // What they actually paid in local currency
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
          amount: txData.amount, // Original USD amount
          currency: metadata.currency || "USD",
          description: `GPU Node License activated via Direct Transfer: ${txData.node_key} (${metadata.lockInLabel || "6 months"} lock-in) - Paid in ${metadata.currency || "USD"}`,
          reference_id: String(txData.id),
          metadata: {
            nodeKey: txData.node_key,
            originalPrice: metadata.originalPrice,
            convertedPrice: metadata.convertedPrice,
            currency: metadata.currency || "USD",
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
          currency: metadata.currency || "USD",
          description: `GPU Node License via Direct Transfer: ${txData.node_key} (${metadata.lockInLabel || "6 months"}) - Paid in ${metadata.currency || "USD"}`,
          reference_id: String(txData.id),
          metadata: {
            nodeKey: txData.node_key,
            originalPrice: metadata.originalPrice,
            convertedPrice: metadata.convertedPrice,
            currency: metadata.currency || "USD",
            lockInMonths: metadata.lockInMonths || 6,
            lockInMultiplier: metadata.lockInMultiplier || 1.0,
            lockInLabel: metadata.lockInLabel || "6 months",
            gateway: "korapay",
          },
          created_at: now,
        })
        .maybeSingle();

      // Send email receipt
      if (userData?.email) {
        await sendGPUInvestmentReceipt(
          userData.email,
          userData.full_name || "User",
          txData.amount,
          metadata.currency || txData.currency || "USD",
          txData.node_key,
          metadata.lockInMonths || 6,
          String(txData.id),
          now
        );
      }

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
