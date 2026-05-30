// app/api/korapay/webhook/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function verifyKorapaySignature(
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  try {
    const hash = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    return hash === signature;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // ── Signature verification (Bug 3 fix) ──────────────────────────────
    const signature = req.headers.get("x-korapay-signature") || "";
    const webhookSecret = process.env.KORAPAY_WEBHOOK_SECRET || "";

    if (webhookSecret && signature) {
      if (!verifyKorapaySignature(rawBody, signature, webhookSecret)) {
        console.error("[webhook] Invalid KoraPay signature — rejecting");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 },
        );
      }
    } else if (webhookSecret && !signature) {
      // Secret is configured but no signature sent — reject
      console.error("[webhook] Missing signature header — rejecting");
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody) as {
      event?: string;
      data?: { reference?: string; [key: string]: unknown };
    };

    const { data, event } = body;
    const reference = data?.reference;

    if (!reference) {
      return NextResponse.json({ error: "Missing reference" }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    if (event === "charge.success") {
      // ── Look up by gateway_reference (Bug 5 fix) ──────────────────────
      const { data: txData, error: txError } = await supabase
        .from("payment_transactions")
        .select("*")
        .eq("gateway_reference", reference)
        .maybeSingle();

      if (txError || !txData) {
        console.error("[webhook] Transaction not found:", reference);
        // Return 200 so KoraPay doesn't keep retrying for unknown refs
        return NextResponse.json({ received: true });
      }

      // Idempotency — don't process already-completed transactions
      if (txData.status === "confirmed" || txData.status === "completed") {
        return NextResponse.json({ received: true });
      }

      const metadata: Record<string, unknown> = txData.metadata
        ? JSON.parse(txData.metadata as string)
        : {};

      // Update transaction status
      await supabase
        .from("payment_transactions")
        .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
        .eq("gateway_reference", reference);

      // Only create allocation if not already created (idempotency)
      const { data: existingAlloc } = await supabase
        .from("node_allocations")
        .select("id")
        .eq("user_id", txData.user_id)
        .eq("plan_id", txData.node_key)
        .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();

      if (!existingAlloc) {
        const now = new Date().toISOString();
        await supabase.from("node_allocations").insert({
          user_id: txData.user_id,
          plan_id: txData.node_key,
          amount_invested: txData.amount,
          status: "active",
          payment_model: (metadata.paymentModel as string) || "flexible",
          instance_type: (metadata.itype as string) || "on_demand",
          total_earned: 0,
          total_withdrawn: 0,
          created_at: now,
          updated_at: now,
        });
      }

      return NextResponse.json({ received: true });
    } else if (event === "charge.failed" || event === "charge.declined") {
      await supabase
        .from("payment_transactions")
        .update({ status: "declined" })
        .eq("gateway_reference", reference);

      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("[webhook] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
