// supabase/functions/payout-processor/index.ts
// Deploy: supabase functions deploy payout-processor
// Cron: set in supabase/config.toml or dashboard
// Schedule: Every Friday at 10:00, 14:00, 18:00 UTC

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const KORAPAY_SECRET = Deno.env.get("KORAPAY_SECRET_KEY") || "";
const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") || "";

// ── Determine which batch slot is running now ─────────────────────
function getBatchSlot(): string {
  const hour = new Date().getUTCHours();
  if (hour < 10) return "morning";
  if (hour < 14) return "afternoon";
  return "evening";
}

function getBatchId(slot: string): string {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `BATCH-${today}-${slot.toUpperCase()}`;
}

// ── Release pending balances to available (runs every Friday AM) ──
async function releasePendingBalances() {
  const { data: users } = await supabase
    .from("users")
    .select("id, balance_pending")
    .gt("balance_pending", 0);

  if (!users?.length) return;

  for (const user of users) {
    await supabase.rpc("release_pending_to_available", { p_user_id: user.id });

    // Notify user
    await supabase.rpc("create_notification", {
      p_user_id: user.id,
      p_type: "system",
      p_title: "Earnings Available",
      p_body: `Your pending balance of $${user.balance_pending.toFixed(2)} has been released and is now available for withdrawal.`,
      p_data: { amount: user.balance_pending },
    });
  }

  console.log(`Released pending balances for ${users.length} users`);
}

// ── Process Korapay payout ────────────────────────────────────────
async function processKorapayPayout(
  walletAddress: string,
  amount: number,
  reference: string,
): Promise<{ success: boolean; ref?: string; error?: string }> {
  try {
    const res = await fetch(
      "https://api.korapay.com/merchant/api/v1/virtual-bank-account/disbursements/initiate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${KORAPAY_SECRET}`,
        },
        body: JSON.stringify({
          reference,
          destination: {
            type: "bank_account",
            amount: amount * 1550, // Convert USD to NGN approx
            currency: "NGN",
            bank_account: { bank: "058", account: walletAddress },
            customer: { name: "OmniTask Contributor" },
          },
        }),
      },
    );
    const data = await res.json();
    if (data.status) return { success: true, ref: data.data?.reference };
    return { success: false, error: data.message };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Process Stripe payout ─────────────────────────────────────────
async function processStripePayout(
  walletAddress: string,
  amount: number,
): Promise<{ success: boolean; ref?: string; error?: string }> {
  try {
    const params = new URLSearchParams({
      amount: String(Math.round(amount * 100)),
      currency: "usd",
      method: "instant",
      destination: walletAddress,
    });
    const res = await fetch("https://api.stripe.com/v1/payouts", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${STRIPE_SECRET}`,
      },
      body: params,
    });
    const data = await res.json();
    if (data.id) return { success: true, ref: data.id };
    return { success: false, error: data.error?.message };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Main batch processor ──────────────────────────────────────────
async function processBatch(batchId: string) {
  const { data: requests } = await supabase
    .from("withdrawal_requests")
    .select("*, users(tier, ip_address)")
    .eq("batch_id", batchId)
    .eq("status", "queued")
    .order("created_at");

  if (!requests?.length) {
    console.log(`No pending withdrawals in batch ${batchId}`);
    return;
  }

  console.log(`Processing ${requests.length} withdrawals in ${batchId}`);

  for (const req of requests) {
    const reference = `OT-${req.id}-${Date.now()}`;

    // Determine gateway from stored field
    const gateway = req.gateway || "manual";
    let result: { success: boolean; ref?: string; error?: string } = {
      success: false,
      error: "No gateway configured",
    };

    if (gateway === "korapay" && KORAPAY_SECRET) {
      result = await processKorapayPayout(
        req.wallet_address,
        req.amount,
        reference,
      );
    } else if (gateway === "stripe" && STRIPE_SECRET) {
      result = await processStripePayout(req.wallet_address, req.amount);
    } else {
      // Manual / crypto — mark completed and admin processes manually
      result = { success: true, ref: `MANUAL-${reference}` };
    }

    if (result.success) {
      await supabase
        .from("withdrawal_requests")
        .update({
          status: "completed",
          paid_at: new Date().toISOString(),
          gateway_ref: result.ref,
        })
        .eq("id", req.id);

      // Release locked balance
      await supabase.rpc("release_pending_to_available", {
        p_user_id: req.user_id,
      });

      // Notify user
      await supabase.rpc("create_notification", {
        p_user_id: req.user_id,
        p_type: "withdrawal_completed",
        p_title: "Withdrawal Processed",
        p_body: `Your withdrawal of $${req.amount.toFixed(2)} has been processed successfully.`,
        p_data: { amount: req.amount, ref: result.ref },
      });
    } else {
      await supabase
        .from("withdrawal_requests")
        .update({ status: "failed", failure_reason: result.error })
        .eq("id", req.id);

      // Restore balance on failure
      await supabase
        .from("users")
        .select("balance_available, balance_locked, total_withdrawn")
        .eq("id", req.user_id)
        .single()
        .then(async ({ data: u }) => {
          if (u) {
            await supabase
              .from("users")
              .update({
                balance_available: (u.balance_available || 0) + req.amount,
                balance_locked: Math.max(
                  (u.balance_locked || 0) - req.amount,
                  0,
                ),
                total_withdrawn: Math.max(
                  (u.total_withdrawn || 0) - req.amount,
                  0,
                ),
              })
              .eq("id", req.user_id);
          }
        });

      await supabase.rpc("create_notification", {
        p_user_id: req.user_id,
        p_type: "withdrawal_failed",
        p_title: "Withdrawal Failed",
        p_body: `Your withdrawal of $${req.amount.toFixed(2)} could not be processed. Funds have been returned to your available balance. Please contact support.`,
        p_data: { amount: req.amount, error: result.error },
      });
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const today = new Date();
    const isFriday = today.getUTCDay() === 5;

    // Release pending balances on Friday morning before processing
    const slot = getBatchSlot();
    if (isFriday && slot === "morning") {
      await releasePendingBalances();
    }

    // Process the current batch slot
    if (isFriday) {
      const batchId = getBatchId(slot);
      await processBatch(batchId);
      return new Response(JSON.stringify({ ok: true, batch: batchId }), {
        status: 200,
      });
    }

    return new Response(
      JSON.stringify({ ok: true, message: "Not Friday — no payouts" }),
      { status: 200 },
    );
  } catch (err) {
    console.error("Payout processor error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
    });
  }
});
