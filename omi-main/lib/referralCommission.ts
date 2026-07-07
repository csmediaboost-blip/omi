// lib/referralCommission.ts
// Call this from your checkout/approve-payment API routes after a payment succeeds
// It credits 20% to the referrer and 10% bonus to the referred user

import { createClient } from "@supabase/supabase-js";

const REFERRER_PCT = 20; // referrer earns 20% of payment
const REFERRED_PCT = 10; // referred user gets 10% added to their balance

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function processReferralCommission(
  paidUserId: string,
  paymentAmount: number,
  paymentRef: string,
  purchasedNode?: string, // pass plan_id / node_key from the payment metadata
) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Find who referred this user
    const { data: paidUser } = await supabaseAdmin
      .from("users")
      .select("referred_by, full_name, referral_bonus_claimed")
      .eq("id", paidUserId)
      .single();

    if (!paidUser?.referred_by) return; // No referrer — skip

    const referrerId = paidUser.referred_by as string;

    // 2. Calculate commissions
    const referrerEarns = +((paymentAmount * REFERRER_PCT) / 100).toFixed(4);
    const referredBonus = +((paymentAmount * REFERRED_PCT) / 100).toFixed(4);

    // ─── 3. Credit referrer ───────────────────────────────────────────────────
    // FIX: Read current values then increment — credits both balance_available
    //      AND referral_earnings (previously only balance was updated, causing
    //      the bonus to be invisible on the frontend dashboard)
    const { data: referrer } = await supabaseAdmin
      .from("users")
      .select("balance_available, referral_earnings")
      .eq("id", referrerId)
      .single();

    await supabaseAdmin
      .from("users")
      .update({
        balance_available: ((referrer as any)?.balance_available || 0) + referrerEarns, // ✅ what frontend shows
        referral_earnings: ((referrer as any)?.referral_earnings || 0) + referrerEarns, // ✅ lifetime total
        updated_at: new Date().toISOString(),
      })
      .eq("id", referrerId);

    // ─── 4. Credit referred user bonus (first payment only) ──────────────────
    if (!paidUser.referral_bonus_claimed) {
      const { data: paidUserFull } = await supabaseAdmin
        .from("users")
        .select("balance_available")
        .eq("id", paidUserId)
        .single();

      await supabaseAdmin
        .from("users")
        .update({
          balance_available: ((paidUserFull as any)?.balance_available || 0) + referredBonus, // ✅ visible on dashboard
          referral_bonus_claimed: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paidUserId);
    }

    // ─── 5. Log the commission ────────────────────────────────────────────────
    // FIX: corrected column names to match actual DB schema:
    //   ❌ payment_amount  →  ✅ source_amount
    //   ❌ payment_ref     →  ✅ (removed — column does not exist)
    //   ✅ added: purchased_node, source_type, paid_at
    await supabaseAdmin.from("referral_commissions").insert({
      referrer_id: referrerId,
      referred_user_id: paidUserId,
      purchased_node: purchasedNode || null,     // ✅ DB column exists
      commission_pct: REFERRER_PCT,
      commission_amount: referrerEarns,
      source_amount: paymentAmount,              // ✅ was: payment_amount ❌
      source_type: "gpu_plan",                   // ✅ was: missing ❌
      paid_at: new Date().toISOString(),          // ✅ was: missing ❌
      created_at: new Date().toISOString(),
    });

    // ─── 6. Ledger entries ────────────────────────────────────────────────────
    // transaction_ledger columns: user_id, type, amount, description, reference_id, created_at
    await supabaseAdmin.from("transaction_ledger").insert([
      {
        user_id: referrerId,
        type: "referral_commission",
        amount: referrerEarns,
        description: `${REFERRER_PCT}% referral commission from payment of $${paymentAmount}`,
        reference_id: paymentRef,
        created_at: new Date().toISOString(),
      },
      ...(!paidUser.referral_bonus_claimed
        ? [
            {
              user_id: paidUserId,
              type: "referral_bonus",
              amount: referredBonus,
              description: `${REFERRED_PCT}% welcome bonus from referral`,
              reference_id: paymentRef,
              created_at: new Date().toISOString(),
            },
          ]
        : []),
    ]);

    // ─── 7. Notify referrer ───────────────────────────────────────────────────
    try {
      await supabaseAdmin.from("user_notifications").insert({
        user_id: referrerId,
        type: "referral",
        title: "💰 Referral Commission Earned!",
        body: `You earned $${referrerEarns.toFixed(2)} (${REFERRER_PCT}%) from a payment made by someone in your network.`,
        created_at: new Date().toISOString(),
      });
    } catch {
      // never let notification failure break the flow
    }

    console.log(
      `[referral] ✅ Referrer ${referrerId} earned $${referrerEarns}, referred ${paidUserId} earned $${referredBonus} bonus`,
    );
  } catch (err) {
    console.error("[referral] Commission error:", err);
    // Never throw — don't break the payment flow
  }
}