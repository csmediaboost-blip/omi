import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAuth } from "@/lib/api-security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Admin confirms crypto payment received → upgrades user node
export async function POST(req: NextRequest) {
  try {
    // Verify admin authentication
    const authResult = await requireAdminAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const adminSupabase = getAdminSupabase();
    const { reference, txHash } = await req.json();

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

    // Update transaction status
    await adminSupabase
      .from("payment_transactions")
      .update({
        status: "confirmed",
        gateway_reference: txHash || txn.gateway_reference,
        confirmed_at: new Date().toISOString(),
      })
      .eq("gateway_reference", reference);

    // Upgrade user node
    await adminSupabase
      .from("users")
      .update({ tier: txn.node_key })
      .eq("id", txn.user_id);

    return NextResponse.json({ success: true, nodeKey: txn.node_key });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
