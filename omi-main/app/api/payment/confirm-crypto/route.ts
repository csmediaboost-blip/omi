// app/api/payment/confirm-crypto/route.ts
// SECURITY FIX: Added requireAdminAuth — was completely unauthenticated.
// + Wired in processReferralCommission so referral commissions are credited
//   on crypto-confirmed payments too.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendCryptoPaymentReceipt } from "@/lib/email-service";
import { processReferralCommission } from "@/lib/referralCommission";
import {
  requireAdminAuth,
  logAdminAction,
  getClientIp,
} from "@/lib/api-security";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  const authResult = await requireAdminAuth(req);
  if (authResult instanceof Response) return authResult;
  const { userId: adminId } = authResult;

  try {
    const adminSupabase = getAdminSupabase();
    const { reference, txHash, cryptoAmount, cryptoType, walletAddress } =
      await req.json();

    if (!reference) {
      return NextResponse.json(
        { error: "reference is required" },
        { status: 400 },
      );
    }

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

    if (txn.status === "confirmed" || txn.status === "completed") {
      return NextResponse.json({
        success: true,
        note: "already_confirmed",
        nodeKey: txn.node_key,
      });
    }

    const { data: userData } = await adminSupabase
      .from("users")
      .select("email, full_name")
      .eq("id", txn.user_id)
      .single();

    const now = new Date().toISOString();

    await adminSupabase
      .from("payment_transactions")
      .update({
        status: "confirmed",
        verified_by_admin: true,
        gateway_reference: txHash || txn.gateway_reference,
        confirmed_at: now,
        updated_at: now,
      })
      .eq("gateway_reference", reference);

    // ── Credit referral commissions (20% referrer / 10% referred bonus) ──
    await processReferralCommission(txn.user_id, txn.amount, reference);

    if (userData?.email) {
      await sendCryptoPaymentReceipt(
        userData.email,
        userData.full_name || "User",
        cryptoAmount || 0,
        cryptoType || "CRYPTO",
        txn.amount,
        walletAddress || "",
        txHash || reference,
        txn.node_key,
        String(txn.id),
        now,
      ).catch((e: any) =>
        console.error("[confirm-crypto] Email failed:", e.code),
      );
    }

    await logAdminAction(
      adminId,
      "confirm_crypto_payment",
      "payment_transactions",
      {
        reference,
        txHash,
        userId: txn.user_id,
        amount: txn.amount,
        ipAddress: getClientIp(req),
      },
    );

    return NextResponse.json({ success: true, nodeKey: txn.node_key });
  } catch (err: any) {
    console.error("[confirm-crypto] Error:", err.code || "unknown");
    return NextResponse.json(
      { error: "Failed to confirm payment" },
      { status: 500 },
    );
  }
}
