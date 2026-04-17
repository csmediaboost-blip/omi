import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAuth } from "@/lib/api-security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  try {
    // Verify admin authentication
    const authResult = await requireAdminAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    // Initialize inside handler to defer env var access until runtime
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Use dynamic imports to defer loading until runtime
    const { activateGPUNode } = await import("@/app/admin/payments/activateGPUNode");
    const { processReferralCommission } = await import("@/lib/referralCommission");

    const { paymentId } = await req.json();
    if (!paymentId)
      return NextResponse.json(
        { error: "paymentId required" },
        { status: 400 },
      );

    const { data: payment, error: fetchErr } = await supabaseAdmin
      .from("payment_transactions")
      .select("*")
      .eq("id", paymentId)
      .single();

    if (fetchErr || !payment)
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });

    const now = new Date().toISOString();
    const meta = (() => {
      try {
        return JSON.parse(payment.metadata || "{}");
      } catch {
        return {};
      }
    })();
    const purchaseType = meta.purchaseType || "gpu_plan";

    // Confirm the payment
    await supabaseAdmin
      .from("payment_transactions")
      .update({
        status: "confirmed",
        confirmed_at: now,
        verified_by_admin: true,
        updated_at: now,
      })
      .eq("id", paymentId);

    if (purchaseType === "license") {
      const licenseType = meta.licenseType || payment.node_key;
      const resolvedType =
        licenseType === "operator_license" ? "all" : licenseType;
      const fourYears = new Date(
        Date.now() + 4 * 365 * 24 * 3600 * 1000,
      ).toISOString();
      await processReferralCommission(
        payment.user_id,
        payment.amount,
        String(payment.id),
      );
      await supabaseAdmin.from("operator_licenses").upsert(
        {
          user_id: payment.user_id,
          license_type: resolvedType,
          status: "active",
          expires_at: fourYears,
          purchased_at: now,
          amount_paid: payment.amount,
          transaction_ref: payment.gateway_reference || String(payment.id),
        },
        { onConflict: "user_id,license_type" },
      );

      await supabaseAdmin
        .from("users")
        .update({
          has_operator_license: true,
          license_expires_at: fourYears,
          node_activated_at: now,
        })
        .eq("id", payment.user_id);

      return NextResponse.json({ success: true, type: "license" });
    } else {
      await activateGPUNode(payment, meta);
      return NextResponse.json({ success: true, type: "gpu_plan" });
    }
  } catch (e: any) {
    console.error("approve-payment error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
