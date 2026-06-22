// app/admin/payments/activateGPUNode.ts
// Shared server-side utility — import this in PaymentsClient API calls
// and in the KoraPay webhook route
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function activateGPUNode(
  payment: {
    id: number;
    user_id: string;
    node_key: string;
    amount: number;
    metadata?: string | null;
  },
  meta: Record<string, any>,
) {
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

  // Idempotency check — avoid duplicate allocations
  const { data: existing } = await supabaseAdmin
    .from("node_allocations")
    .select("id")
    .eq("user_id", payment.user_id)
    .eq("plan_id", payment.node_key)
    .eq("amount_invested", payment.amount)
    .gte("created_at", new Date(Date.now() - 60000).toISOString());

  if (existing && existing.length > 0) {
    console.log("Node allocation already exists — skipping duplicate");
    return;
  }

  const { error: insertError } = await supabaseAdmin
    .from("node_allocations")
    .insert({
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

  if (insertError)
    throw new Error("Failed to create node allocation: " + insertError.message);

  // Update user balance_locked
  const { data: userData } = await supabaseAdmin
    .from("users")
    .select("balance_locked")
    .eq("id", payment.user_id)
    .single();

  await supabaseAdmin
    .from("users")
    .update({
      balance_locked: ((userData as any)?.balance_locked || 0) + payment.amount,
    })
    .eq("id", payment.user_id);

  // Write to ledger
  try {
    await supabaseAdmin.from("transaction_ledger").insert({
      user_id: payment.user_id,
      type: "investment",
      amount: payment.amount,
      description: `GPU node investment activated — ${payment.node_key}`,
      reference_id: String(payment.id),
      created_at: now,
    });
  } catch (_) {}
}
