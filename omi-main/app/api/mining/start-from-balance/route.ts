// app/api/mining/start-from-balance/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();

    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = user.id;

    // ── 2. Parse & validate body ─────────────────────────────────────────────
    const body = await req.json();
    const {
      planId,
      amount,
      paymentModel,
      miningPeriod,
      contractMonths,
      contractLabel,
      instanceType,
    } = body;

    if (!planId || !amount || !paymentModel) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    // ── 3. Fetch plan ────────────────────────────────────────────────────────
    const { data: plan, error: planErr } = await supabase
      .from("gpu_plans")
      .select("*")
      .eq("id", planId)
      .eq("is_active", true)
      .single();

    if (planErr || !plan) {
      return NextResponse.json({ error: "Plan not found or inactive" }, { status: 404 });
    }

    if (amt < plan.price_min || amt > plan.price_max) {
      return NextResponse.json(
        { error: `Amount must be between $${plan.price_min} and $${plan.price_max}` },
        { status: 400 }
      );
    }

    // ── 4. Atomic balance deduction (fraud-safe: use DB-level check) ─────────
    const { data: deducted, error: deductErr } = await supabase
      .from("users")
      .update({
        balance_available: supabase.rpc as any, // placeholder — see raw SQL below
      })
      .eq("id", userId)
      .gte("balance_available", amt) // only deducts if enough balance
      .select("balance_available")
      .single();

    // Use raw RPC for atomic deduction
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      "deduct_balance_and_start_mining",
      {
        p_user_id: userId,
        p_amount: amt,
        p_plan_id: planId,
        p_payment_model: paymentModel,
        p_mining_period: miningPeriod ?? "daily",
        p_contract_months: contractMonths ?? 0,
        p_contract_label: contractLabel ?? "",
        p_instance_type: instanceType ?? plan.instance_type,
      }
    );

    if (rpcErr) {
      console.error("[start-from-balance] RPC error:", rpcErr);
      return NextResponse.json(
        { error: rpcErr.message || "Insufficient balance or plan error" },
        { status: 400 }
      );
    }

    if (!rpcResult?.success) {
      return NextResponse.json(
        { error: rpcResult?.error ?? "Insufficient balance" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      allocationId: rpcResult.allocation_id,
      newBalance: rpcResult.new_balance,
    });

  } catch (e: any) {
    console.error("[start-from-balance] Error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}