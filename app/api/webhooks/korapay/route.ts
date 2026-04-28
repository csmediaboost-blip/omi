// app/api/webhooks/korapay/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const processedWebhooks = new Set<string>();

function verifySignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!secret || !signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

async function activateGPUNode(payment: any, meta: any) {
  const supabaseAdmin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const paymentModel = meta.paymentModel || "flexible";
  const isContract = paymentModel === "contract";
  const contractMonths = meta.contractMonths
    ? parseInt(meta.contractMonths)
    : null;
  const maturityDate =
    isContract && contractMonths
      ? new Date(
          Date.now() + contractMonths * 30 * 24 * 3600 * 1000,
        ).toISOString()
      : null;

  const { data: existing } = await supabaseAdmin
    .from("node_allocations")
    .select("id")
    .eq("user_id", payment.user_id)
    .eq("plan_id", payment.node_key)
    .eq("amount_invested", payment.amount)
    .gte("created_at", new Date(Date.now() - 300000).toISOString());
  if (existing && existing.length > 0) return;

  const { error } = await supabaseAdmin.from("node_allocations").insert({
    user_id: payment.user_id,
    plan_id: payment.node_key,
    amount_invested: payment.amount,
    currency: "USD",
    payment_model: paymentModel,
    contract_months: contractMonths,
    contract_label: meta.contractLabel || null,
    contract_min_pct: meta.contractMinPct
      ? parseFloat(meta.contractMinPct)
      : null,
    contract_max_pct: meta.contractMaxPct
      ? parseFloat(meta.contractMaxPct)
      : null,
    maturity_date: maturityDate,
    lock_in_months: meta.lockInMonths ? parseInt(meta.lockInMonths) : 0,
    lock_in_label:
      meta.lockInLabel || (isContract ? meta.contractLabel : "Flexible"),
    lock_in_multiplier: 1,
    instance_type: meta.itype || payment.node_key,
    status: "active",
    total_earned: 0,
    total_withdrawn: 0,
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error("Node activation failed: " + error.message);

  const { data: u } = await supabaseAdmin
    .from("users")
    .select("balance_locked")
    .eq("id", payment.user_id)
    .single();
  await supabaseAdmin
    .from("users")
    .update({
      balance_locked: ((u as any)?.balance_locked || 0) + payment.amount,
    })
    .eq("id", payment.user_id);

  try {
    await supabaseAdmin.from("transaction_ledger").insert({
      user_id: payment.user_id,
      type: "investment",
      amount: payment.amount,
      description: `GPU node activated via KoraPay — ${payment.node_key}`,
      reference_id: String(payment.id),
      created_at: now,
    });
  } catch (_) {}
}

async function activateLicense(payment: any, meta: any) {
  const now = new Date().toISOString();
  const licenseType = meta.licenseType || payment.node_key;
  const resolvedType = licenseType === "operator_license" ? "all" : licenseType;
  const fourYears = new Date(
    Date.now() + 4 * 365 * 24 * 3600 * 1000,
  ).toISOString();

  await supabaseAdmin.from("operator_licenses").upsert(
    {
      user_id: payment.user_id,
      license_type: resolvedType,
      status: "active",
      expires_at: fourYears,
      purchased_at: now,
      amount_paid: payment.amount,
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
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-korapay-signature") || "";
    const secret = process.env.KORAPAY_WEBHOOK_SECRET || "";

    if (!verifySignature(rawBody, signature, secret)) {
      console.error("KoraPay: invalid webhook signature");
      try {
        await supabaseAdmin.from("security_audit_log").insert({
          action: "webhook_signature_fail",
          metadata: { source: "korapay", ip: req.headers.get("x-real-ip") },
          severity: "critical",
        });
      } catch (_) {}
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventId = event.id || event.data?.reference;

    if (eventId && processedWebhooks.has(eventId)) {
      return NextResponse.json({ received: true, note: "duplicate" });
    }
    if (eventId) processedWebhooks.add(eventId);

    if (
      event.event !== "charge.success" &&
      event.event !== "checkout.payment.success"
    ) {
      return NextResponse.json({ received: true });
    }

    const reference = event.data?.reference || event.data?.payment_reference;
    if (!reference) return NextResponse.json({ received: true });

    const { data: payment } = await supabaseAdmin
      .from("payment_transactions")
      .select("*")
      .or(
        `gateway_reference.eq.${reference},gateway_transaction_id.eq.${reference}`,
      )
      .single();

    if (!payment) return NextResponse.json({ received: true });

    if (payment.status === "confirmed" || payment.status === "confmrmed") {
      return NextResponse.json({ received: true, note: "already processed" });
    }

    const webhookAmount = parseFloat(event.data?.amount || "0");
    if (webhookAmount > 0 && Math.abs(webhookAmount - payment.amount) > 0.01) {
      try {
        await supabaseAdmin.from("security_audit_log").insert({
          user_id: payment.user_id,
          action: "webhook_amount_mismatch",
          metadata: { expected: payment.amount, received: webhookAmount },
          severity: "critical",
        });
      } catch (_) {}
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 });
    }

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("payment_transactions")
      .update({
        status: "confirmed",
        confirmed_at: now,
        verified_by_admin: false,
        updated_at: now,
      })
      .eq("id", payment.id);

    const meta = (() => {
      try {
        return JSON.parse(payment.metadata || "{}");
      } catch {
        return {};
      }
    })();
    const purchaseType = meta.purchaseType || "gpu_plan";

    if (purchaseType === "license") {
      await activateLicense(payment, meta);
    } else {
      await activateGPUNode(payment, meta);
    }

    console.log(
      `KoraPay: activated ${purchaseType} for user ${payment.user_id}`,
    );
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("KoraPay webhook error:", err.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
