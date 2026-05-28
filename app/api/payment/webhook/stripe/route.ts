// app/api/payment/webhook/stripe/route.ts
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
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function verifyStripeSignature(
  body: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const parts = signature
      .split(",")
      .reduce<Record<string, string>>((acc, part) => {
        const [k, v] = part.split("=");
        acc[k] = v;
        return acc;
      }, {});

    const timestamp = parts["t"];
    const sigHash = parts["v1"];
    if (!timestamp || !sigHash) return false;

    // Reject events older than 5 minutes — prevents replay attacks
    const eventAge = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (eventAge > 300) return false;

    const signedPayload = `${timestamp}.${body}`;
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      encoder.encode(signedPayload),
    );
    const computedSig = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computedSig === sigHash;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  if (!webhookSecret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  const isValid = await verifyStripeSignature(body, signature, webhookSecret);
  if (!isValid) {
    console.error("[stripe/webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const adminSupabase = getAdminSupabase();

  try {
    const event = JSON.parse(body);

    // ── checkout.session.completed ────────────────────────────────────────────
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const { userId, nodeKey } = session.metadata || {};

      if (userId && nodeKey) {
        const { data: userData } = await adminSupabase
          .from("users")
          .select("email, full_name")
          .eq("id", userId)
          .single();

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
          .eq("gateway_reference", session.id)
          .select("id, amount, currency, created_at")
          .single();

        // Referral commission — non-blocking, log error but don't fail webhook
        const { error: commissionErr } = await adminSupabase.rpc(
          "process_referral_commission",
          {
            p_referred_user_id: userId,
            p_purchased_node: nodeKey,
            p_transaction_id: txn?.id ?? null,
          },
        );
        if (commissionErr) {
          console.error(
            "[stripe/webhook] Commission error:",
            commissionErr.code,
          );
        }

        // Send receipt email — non-blocking
        if (userData?.email && txn) {
          const validUntil = new Date();
          validUntil.setFullYear(validUntil.getFullYear() + 4);
          try {
            await sendLicenseReceipt(
              userData.email,
              userData.full_name || "User",
              txn.amount,
              txn.currency || "USD",
              "Operator License",
              validUntil.toISOString(),
              String(txn.id),
              txn.created_at,
            );
          } catch (emailErr: any) {
            console.error(
              "[stripe/webhook] Email error:",
              emailErr.code ?? "unknown",
            );
          }
        }
      }
    }

    // ── payment_intent.payment_failed ─────────────────────────────────────────
    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object;
      const { error: failErr } = await adminSupabase
        .from("payment_transactions")
        .update({
          status: "failed",
          failure_reason: "Stripe payment failed",
          updated_at: new Date().toISOString(),
        })
        .eq("gateway_reference", intent.id);
      if (failErr) {
        console.error(
          "[stripe/webhook] Failed txn update error:",
          failErr.code,
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[stripe/webhook] Processing error:", err.code ?? "unknown");
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 400 },
    );
  }
}
