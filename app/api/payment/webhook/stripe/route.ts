import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendLicenseReceipt } from "@/lib/email-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(req: NextRequest) {
  const adminSupabase = getAdminSupabase();
  const body = await req.text();

  try {
    const event = JSON.parse(body);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const { userId, nodeKey } = session.metadata || {};

      if (userId && nodeKey) {
        // 1. Get user details for email
        const { data: userData } = await adminSupabase
          .from("users")
          .select("email, full_name")
          .eq("id", userId)
          .single();

        // 2. Upgrade user node
        await adminSupabase
          .from("users")
          .update({ tier: nodeKey })
          .eq("id", userId);

        // 3. Mark transaction confirmed
        const { data: txn } = await adminSupabase
          .from("payment_transactions")
          .update({
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
          })
          .eq("gateway_reference", session.id)
          .select("id, amount, currency, created_at")
          .single();

        // 4. ✅ Process referral commission — based on PURCHASED node
        const { data: commission, error: commError } = await adminSupabase.rpc(
          "process_referral_commission",
          {
            p_referred_user_id: userId,
            p_purchased_node: nodeKey,
            p_transaction_id: txn?.id || null,
          },
        );

        if (commError) {
          console.error("Commission error:", commError.message);
        } else {
          console.log("Commission processed:", commission);
        }

        // 5. Send license receipt email
        if (userData?.email && txn) {
          const validUntil = new Date();
          validUntil.setFullYear(validUntil.getFullYear() + 4);
          
          await sendLicenseReceipt(
            userData.email,
            userData.full_name || "User",
            txn.amount,
            txn.currency || "USD",
            "Operator License",
            validUntil.toISOString(),
            String(txn.id),
            txn.created_at
          );
        }
      }
    }

    // Handle Korapay webhook
    if (
      event.event === "charge.completed" ||
      event.event === "charge.success"
    ) {
      const data = event.data;
      const { userId, nodeKey } = data?.metadata || {};

      if (userId && nodeKey) {
        await adminSupabase
          .from("users")
          .update({ tier: nodeKey })
          .eq("id", userId);

        const { data: txn } = await adminSupabase
          .from("payment_transactions")
          .update({
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
          })
          .eq("gateway_reference", data.reference)
          .select("id")
          .single();

        // Process referral commission
        await adminSupabase.rpc("process_referral_commission", {
          p_referred_user_id: userId,
          p_purchased_node: nodeKey,
          p_transaction_id: txn?.id || null,
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
