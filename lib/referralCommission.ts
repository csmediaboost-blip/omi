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

    const referrerId = paidUser.referred_by;

    // SECURITY 2.1: Prevent multiple referrals of same user
    // Check if a referral already exists between this referrer and referred user
    const { data: existingReferral } = await supabaseAdmin
      .from("referrals")
      .select("id")
      .eq("referrer_id", referrerId)
      .eq("referred_user_id", paidUserId)
      .single();

    if (existingReferral) {
      console.warn(`[FRAUD] Attempted duplicate referral: ${referrerId} -> ${paidUserId}`);
      return; // Already referred, skip commission
    }

    // 2. Calculate commissions
    const referrerEarns = +((paymentAmount * REFERRER_PCT) / 100).toFixed(4);
    const referredBonus = +((paymentAmount * REFERRED_PCT) / 100).toFixed(4);

    // 3. Credit referrer
    const { data: referrer } = await supabaseAdmin
      .from("users")
      .select("balance_available, referral_earnings")
      .eq("id", referrerId)
      .single();

    await supabaseAdmin
      .from("users")
      .update({
        balance_available:
          ((referrer as any)?.balance_available || 0) + referrerEarns,
        referral_earnings:
          ((referrer as any)?.referral_earnings || 0) + referrerEarns,
      })
      .eq("id", referrerId);

    // 4. Credit referred user bonus (only on first payment — check flag)
    if (!paidUser.referral_bonus_claimed) {
      const { data: paidUserFull } = await supabaseAdmin
        .from("users")
        .select("balance_available")
        .eq("id", paidUserId)
        .single();

      await supabaseAdmin
        .from("users")
        .update({
          balance_available:
            ((paidUserFull as any)?.balance_available || 0) + referredBonus,
          referral_bonus_claimed: true,
        })
        .eq("id", paidUserId);
    }

    // 5. Record the referral relationship (prevents future duplicates)
    await supabaseAdmin
      .from("referrals")
      .insert({
        referrer_id: referrerId,
        referred_user_id: paidUserId,
        created_at: new Date().toISOString(),
      })
      .catch(err => {
        if (err.message?.includes("unique")) {
          console.warn(`[FRAUD] Duplicate referral insert blocked: ${referrerId} -> ${paidUserId}`);
        } else {
          throw err;
        }
      });

    // 6. Log the commission
    await supabaseAdmin.from("referral_commissions").insert({
      referrer_id: referrerId,
      referred_user_id: paidUserId,
      commission_amount: referrerEarns,
      commission_pct: REFERRER_PCT,
      payment_amount: paymentAmount,
      payment_ref: paymentRef,
      created_at: new Date().toISOString(),
    });

    // 7. Ledger entries
    await supabaseAdmin
      .from("transaction_ledger")
      .insert([
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

    // 8. Notify referrer
    await supabaseAdmin
      .from("user_notifications")
      .insert({
        user_id: referrerId,
        type: "referral",
        title: "💰 Referral Commission Earned!",
        body: `You earned $${referrerEarns.toFixed(2)} (${REFERRER_PCT}%) from a payment made by someone in your network.`,
        created_at: new Date().toISOString(),
      })
      .catch(() => {});

    console.log(
      `Referral commission: referrer ${referrerId} earned $${referrerEarns}, referred ${paidUserId} earned $${referredBonus} bonus`,
    );
  } catch (err) {
    console.error("Referral commission error:", err);
    // Never throw — don't break the payment flow
  }
}
