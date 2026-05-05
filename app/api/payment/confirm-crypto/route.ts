import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendCryptoPaymentReceipt } from "@/lib/email-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Admin confirms crypto payment received → upgrades user node
export async function POST(req: NextRequest) {
  try {
    const adminSupabase = getAdminSupabase();
    const { reference, txHash, cryptoAmount, cryptoType, walletAddress } = await req.json();

    const { data: txn, error } = await adminSupabase
      .from("payment_transactions")
      .select("*")
      .eq("gateway_reference", reference)
      .single();

    if (error || !txn) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 },
      );
    }

    // Get user details for email
    const { data: userData } = await adminSupabase
      .from("users")
      .select("email, full_name")
      .eq("id", txn.user_id)
      .single();

    const now = new Date().toISOString();

    // Update transaction status
    await adminSupabase
      .from("payment_transactions")
      .update({
        status: "confirmed",
        gateway_reference: txHash || txn.gateway_reference,
        confirmed_at: now,
      })
      .eq("gateway_reference", reference);

    // Upgrade user node
    await adminSupabase
      .from("users")
      .update({ 
        tier: txn.node_key,
        has_operator_license: true,
      })
      .eq("id", txn.user_id);

    // Send crypto payment receipt email
    if (userData?.email) {
      await sendCryptoPaymentReceipt(
        userData.email,
        userData.full_name || "User",
        cryptoAmount || 0,
        cryptoType || "CRYPTO",
        txn.amount, // USD equivalent
        walletAddress || "",
        txHash || reference,
        txn.node_key,
        String(txn.id),
        now
      );
    }

    return NextResponse.json({ success: true, nodeKey: txn.node_key });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
