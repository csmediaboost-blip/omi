// app/api/checkout/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    // 1. Authenticate user via Supabase token
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.id;
    const body = await req.json();
    const { planId, paymentMethod, amount, currency = "USD" } = body;

    // 2. Validate inputs
    if (!planId || !paymentMethod || !amount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    if (paymentMethod !== "balance") {
      return NextResponse.json(
        { error: "Invalid payment method" },
        { status: 400 },
      );
    }

    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // 3. Check user is not banned
    const { data: authUserData } =
      await supabase.auth.admin.getUserById(userId);
    if (authUserData?.user?.banned_until) {
      const bannedUntil = new Date(authUserData.user.banned_until);
      if (bannedUntil > new Date()) {
        return NextResponse.json(
          { error: "Account suspended" },
          { status: 403 },
        );
      }
    }

    // 4. Get user balance
    const { data: balanceData, error: balanceError } = await supabase
      .from("user_balances")
      .select("id, balance")
      .eq("user_id", userId)
      .maybeSingle();

    if (balanceError || !balanceData) {
      return NextResponse.json({ error: "Balance not found" }, { status: 404 });
    }

    const availableBalance = Number(balanceData.balance ?? 0);

    // 5. ✅ CRITICAL — reject if insufficient balance
    if (availableBalance < amount) {
      return NextResponse.json(
        { error: "Insufficient balance", available: availableBalance },
        { status: 402 },
      );
    }

    // 6. Validate the plan exists
    const { data: plan, error: planError } = await supabase
      .from("gpu_plans")
      .select("id")
      .eq("id", planId)
      .maybeSingle();

    if (planError || !plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 404 });
    }

    // 7. Deduct balance FIRST — optimistic lock prevents double-spend
    const newBalance = availableBalance - amount;
    const { error: deductError } = await supabase
      .from("user_balances")
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("balance", availableBalance); // fails if balance changed between read and write

    if (deductError) {
      return NextResponse.json(
        { error: "Balance update failed — please retry" },
        { status: 409 },
      );
    }

    const reference = `bal_${randomUUID()}`;
    const now = new Date().toISOString();

    // 8. Create payment transaction
    const { data: txData, error: txError } = await supabase
      .from("payment_transactions")
      .insert({
        user_id: userId,
        node_key: planId,
        amount,
        currency,
        gateway: "balance",
        gateway_reference: reference,
        status: "confirmed",
        confirmed_at: now,
        created_at: now,
        updated_at: now,
        metadata: JSON.stringify({ source: "balance" }),
      })
      .select()
      .single();

    if (txError || !txData) {
      // Rollback balance
      await supabase
        .from("user_balances")
        .update({ balance: availableBalance, updated_at: now })
        .eq("user_id", userId);
      return NextResponse.json(
        { error: "Transaction creation failed" },
        { status: 500 },
      );
    }

    // 9. Create balance ledger entry
    await supabase.from("balance_ledger").insert({
      user_id: userId,
      amount: -amount,
      type: "debit",
      reference,
      description: `Node purchase: ${planId}`,
      created_at: now,
    });

    // 10. Create node allocation
    const { error: allocError } = await supabase
      .from("node_allocations")
      .insert({
        user_id: userId,
        plan_id: planId,
        amount_invested: amount,
        currency,
        status: "active",
        funded_from: "balance",
        total_earned: 0,
        total_withdrawn: 0,
        created_at: now,
        updated_at: now,
      });

    if (allocError) {
      // Rollback balance and transaction
      await supabase
        .from("user_balances")
        .update({ balance: availableBalance, updated_at: now })
        .eq("user_id", userId);
      await supabase
        .from("payment_transactions")
        .update({ status: "failed" })
        .eq("gateway_reference", reference);
      return NextResponse.json({ error: "Allocation failed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      reference,
      newBalance,
      message: "Node activated successfully",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("[checkout/balance] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
