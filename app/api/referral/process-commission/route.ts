import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Service role client — bypasses RLS, safe for server-only use
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * POST /api/referral/process-commission
 *
 * Called ONLY by trusted backend code after a payment is confirmed.
 * Never called directly from the frontend.
 *
 * Body: { referredUserId, purchasedNode, transactionId? }
 * 
 * SECURITY: Prevents replay attacks by checking if transactionId was already processed
 */
export async function POST(req: NextRequest) {
  try {
    const adminSupabase = getAdminSupabase();

    // Verify this is an internal server call (not from browser)
    const authHeader = req.headers.get("x-internal-secret");
    if (authHeader !== process.env.INTERNAL_API_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { referredUserId, purchasedNode, transactionId } = await req.json();

    if (!referredUserId || !purchasedNode) {
      return NextResponse.json(
        { error: "referredUserId and purchasedNode are required" },
        { status: 400 },
      );
    }

    // SECURITY: Check if this transaction was already processed (replay prevention)
    if (transactionId) {
      const { data: existing, error: checkError } = await adminSupabase
        .from("processed_referral_ids")
        .select("id")
        .eq("transaction_id", transactionId)
        .single();

      if (existing) {
        // Already processed - return success to be idempotent but don't double-credit
        console.warn(`[REPLAY PREVENTED] Transaction ${transactionId} already processed`);
        return NextResponse.json({ 
          success: false,
          message: "Transaction already processed",
          alreadyProcessed: true 
        });
      }
    }

    // Call the secure Supabase RPC function
    // Commission percentage is determined by purchased node — NOT referrer's node
    const { data, error } = await adminSupabase.rpc(
      "process_referral_commission",
      {
        p_referred_user_id: referredUserId,
        p_purchased_node: purchasedNode,
        p_transaction_id: transactionId || null,
      },
    );

    if (error) {
      console.error("Commission RPC error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Record this transaction ID as processed to prevent replay
    if (transactionId) {
      await adminSupabase.from("processed_referral_ids").insert({
        transaction_id: transactionId,
        processed_at: new Date().toISOString(),
      }).catch(err => console.error("Failed to record processed transaction:", err));
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error("Commission processing error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
