/**
 * Payment Failure Recovery Endpoint
 * 
 * Purpose: Manually trigger webhook retry for stuck payments
 * This handles cases where Korapay or Stripe webhooks failed to process
 * 
 * Security: Requires admin authentication + payment ID validation
 */

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

interface PaymentRecoveryRequest {
  paymentId: string;
  reason?: string;
}

interface WebhookPayload {
  paymentId: string;
  status: string;
  gateway: string;
  gatewayReference: string;
}

/**
 * Manually retry a payment webhook
 */
export async function POST(req: NextRequest) {
  try {
    // Verify admin authentication
    const authResult = await requireAdminAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { userId: adminId } = authResult;

    const body: PaymentRecoveryRequest = await req.json();
    const { paymentId, reason } = body;

    if (!paymentId) {
      return NextResponse.json(
        { error: "paymentId is required" },
        { status: 400 }
      );
    }

    const adminSupabase = getAdminSupabase();

    // Fetch the payment
    const { data: payment, error: fetchError } = await adminSupabase
      .from("payment_transactions")
      .select("*")
      .eq("id", paymentId)
      .single();

    if (fetchError || !payment) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    // Check if already confirmed
    if (payment.status === "confirmed") {
      return NextResponse.json(
        { message: "Payment already confirmed", alreadyConfirmed: true },
        { status: 200 }
      );
    }

    // Log recovery attempt
    await adminSupabase.from("payment_recovery_attempts").insert({
      payment_id: paymentId,
      previous_status: payment.status,
      recovery_reason: reason || "Manual recovery",
      admin_id: adminId,
      created_at: new Date().toISOString(),
    }).catch(err => console.error("Failed to log recovery attempt:", err));

    // Retry the payment confirmation
    // This mimics what the webhook handler would do
    let webhookSucceeded = false;
    let webhookError: string | null = null;

    try {
      // Call the approve-payment endpoint (internal)
      const approveRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/admin/approve-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": process.env.INTERNAL_API_SECRET || "",
        },
        body: JSON.stringify({ paymentId }),
      });

      if (approveRes.ok) {
        webhookSucceeded = true;
        
        // Update payment recovery status
        await adminSupabase
          .from("payment_transactions")
          .update({
            status: "confirmed",
            confirmed_at: new Date().toISOString(),
            recovery_details: {
              recovered_at: new Date().toISOString(),
              recovered_by_admin: adminId,
            },
          })
          .eq("id", paymentId);
      } else {
        webhookError = `Approve failed: ${approveRes.statusText}`;
      }
    } catch (err: any) {
      webhookError = err.message || "Unknown error during recovery";
    }

    if (webhookSucceeded) {
      return NextResponse.json({
        success: true,
        message: "Payment recovered and confirmed",
        payment: {
          id: paymentId,
          previousStatus: payment.status,
          newStatus: "confirmed",
        },
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: webhookError || "Payment recovery failed",
          payment: {
            id: paymentId,
            previousStatus: payment.status,
          },
        },
        { status: 500 }
      );
    }
  } catch (err: any) {
    console.error("Payment recovery error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * List stuck payments (status != "confirmed" and older than 1 hour)
 */
export async function GET(req: NextRequest) {
  try {
    // Verify admin authentication
    const authResult = await requireAdminAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const adminSupabase = getAdminSupabase();

    // Find stuck payments
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

    const { data: stuckPayments, error } = await adminSupabase
      .from("payment_transactions")
      .select("id, user_id, amount, gateway, status, created_at")
      .neq("status", "confirmed")
      .lt("created_at", oneHourAgo)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      stuckPayments: stuckPayments || [],
      count: stuckPayments?.length || 0,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
