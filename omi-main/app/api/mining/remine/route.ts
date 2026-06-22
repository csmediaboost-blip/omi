// app/api/mining/remine/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Re-mine from earned balance API
// Security layers:
//  1. Auth check — must be signed in
//  2. KYC check — must be verified (prevents anonymous fund cycling)
//  3. Rate limit — max 3 re-mines per hour, 10 per 24h
//  4. Atomic balance deduction via DB function (prevents double-spend)
//  5. Amount floor ($0.50) and ceiling (full balance) validation
//  6. Server-side plan existence + price_min check
//  7. Full audit trail: remine_requests + balance_ledger
//  8. Idempotency key — duplicate requests within 10s rejected
//  9. FIXED: now computes and stores amount-based lock_unlock_at
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const RATE_LIMIT_1H  = 3;
const RATE_LIMIT_24H = 10;
const MIN_AMOUNT     = 0.5;     // $0.50 minimum re-mine — matches REMINE_MIN_BALANCE on frontend
const IDEMPOTENCY_WINDOW_MS = 10_000; // reject duplicate within 10s

// ── Amount-based lock days — MUST mirror lib/lock-policy.ts exactly ──────────
function getLockDaysByAmount(amount: number): number {
  if (amount <= 3)   return 7;
  if (amount <= 10)  return 21;
  if (amount <= 20)  return 30;
  if (amount <= 40)  return 55;
  if (amount <= 100) return 90;   // 3 months
  if (amount <= 500) return 180;  // 6 months
  return 730;                      // 24 months
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ua = req.headers.get("user-agent") ?? "unknown";

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id;

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body: {
    plan_id: string;
    amount: number;
    payment_model: "flexible" | "contract";
    mining_period?: string;
    contract_months?: number;
    idempotency_key?: string;
    source_allocation_id?: string; // optional: link to the earning allocation
    tier_index?: number;
    lock_unlock_at?: string; // client-sent — recomputed server-side for safety, not trusted directly
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { plan_id, amount, payment_model, mining_period, contract_months, idempotency_key, source_allocation_id } = body;

  // ── 3. Input validation ────────────────────────────────────────────────────
  if (!plan_id || typeof plan_id !== "string") {
    return NextResponse.json({ error: "plan_id required" }, { status: 400 });
  }
  if (!amount || typeof amount !== "number" || amount < MIN_AMOUNT || !isFinite(amount)) {
    return NextResponse.json({ error: `Minimum re-mine amount is $${MIN_AMOUNT}` }, { status: 400 });
  }
  if (!["flexible", "contract"].includes(payment_model)) {
    return NextResponse.json({ error: "Invalid payment_model" }, { status: 400 });
  }

  // ── 4. Idempotency — reject duplicate POSTs within 10s ────────────────────
  if (idempotency_key) {
    const cutoff = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS).toISOString();
    const { data: existing } = await supabase
      .from("remine_requests")
      .select("id, status")
      .eq("user_id", userId)
      .gte("created_at", cutoff)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Duplicate request detected. Please wait a moment before retrying.", duplicate: true },
        { status: 409 }
      );
    }
  }

  // ── 5. Log attempt immediately (before any deduction) ─────────────────────
  const { data: reqRow, error: reqInsertErr } = await supabase
    .from("remine_requests")
    .insert({
      user_id: userId,
      plan_id,
      amount,
      payment_model,
      mining_period: mining_period ?? null,
      contract_months: contract_months ?? null,
      status: "pending",
      ip_address: ip,
      user_agent: ua.slice(0, 200),
    })
    .select("id")
    .single();

  if (reqInsertErr || !reqRow) {
    return NextResponse.json({ error: "Could not log request. Please try again." }, { status: 500 });
  }
  const requestId = reqRow.id as string;

  async function failRequest(reason: string, httpStatus = 400) {
    await supabase.from("remine_requests").update({
      status: "failed",
      failure_reason: reason,
      completed_at: new Date().toISOString(),
    }).eq("id", requestId);
    return NextResponse.json({ error: reason }, { status: httpStatus });
  }

  // ── 6. KYC check ──────────────────────────────────────────────────────────
  const { data: userData } = await supabase
    .from("users")
    .select("kyc_verified, kyc_status, balance_available, total_remined")
    .eq("id", userId)
    .single();

  if (!userData) return failRequest("User not found", 404);

  const kycOk = userData.kyc_verified || userData.kyc_status === "approved";
  if (!kycOk) {
    return failRequest("KYC verification required to re-mine from balance. Complete identity verification first.", 403);
  }

  const currentBalance: number = userData.balance_available ?? 0;

  // ── 7. Balance check ───────────────────────────────────────────────────────
  if (amount > currentBalance) {
    return failRequest(`Insufficient balance. Available: $${currentBalance.toFixed(2)}, Requested: $${amount.toFixed(2)}`);
  }

  // ── 8. Rate limit check ────────────────────────────────────────────────────
  const { data: rl } = await supabase
    .from("remine_rate_limits")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const now = Date.now();
  let count1h = rl?.count_1h ?? 0;
  let count24h = rl?.count_24h ?? 0;

  // Reset windows if expired
  if (rl?.window_1h && now - new Date(rl.window_1h).getTime() > 3_600_000) count1h = 0;
  if (rl?.window_24h && now - new Date(rl.window_24h).getTime() > 86_400_000) count24h = 0;

  if (count1h >= RATE_LIMIT_1H) {
    return failRequest(`Too many re-mine requests. Maximum ${RATE_LIMIT_1H} per hour. Please wait before retrying.`, 429);
  }
  if (count24h >= RATE_LIMIT_24H) {
    return failRequest(`Daily re-mine limit reached (${RATE_LIMIT_24H}/day). Try again tomorrow.`, 429);
  }

  // ── 9. Plan validation ─────────────────────────────────────────────────────
  const { data: plan } = await supabase
    .from("gpu_plans")
    .select("id, name, price_min, price_max, is_active, is_admin_locked, payment_model")
    .eq("id", plan_id)
    .single();

  if (!plan) return failRequest("Plan not found");
  if (!plan.is_active) return failRequest("This plan is currently unavailable");
  if (plan.is_admin_locked) return failRequest("This plan requires institutional access");
  if (amount < plan.price_min) return failRequest(`Minimum stake for this plan is $${plan.price_min}`);
  if (amount > plan.price_max) return failRequest(`Maximum stake for this plan is $${plan.price_max}`);

  // Validate payment model against plan
  if (plan.payment_model !== "both" && plan.payment_model !== payment_model) {
    return failRequest(`This plan does not support ${payment_model} mining`);
  }

  // ── 10. Atomic balance deduction via DB function ───────────────────────────
  // Uses FOR UPDATE lock inside the function — prevents race conditions
  const { data: deductResult } = await supabase.rpc("deduct_balance_atomic", {
    p_user_id:   userId,
    p_amount:    amount,
    p_note:      `Re-mine: ${plan.name} · ${payment_model} · request ${requestId}`,
    p_ref_alloc: source_allocation_id ?? null,
  });

  const deduct = Array.isArray(deductResult) ? deductResult[0] : deductResult;

  if (!deduct?.success) {
    return failRequest(deduct?.message ?? "Balance deduction failed. Please try again.");
  }

  const balanceAfter: number = deduct.new_balance;

  // ── 11. Update rate limit counters ────────────────────────────────────────
  await supabase.from("remine_rate_limits").upsert({
    user_id:    userId,
    count_1h:   count1h + 1,
    count_24h:  count24h + 1,
    last_at:    new Date().toISOString(),
    window_1h:  count1h === 0 ? new Date().toISOString() : rl?.window_1h,
    window_24h: count24h === 0 ? new Date().toISOString() : rl?.window_24h,
  }, { onConflict: "user_id" });

  // ── 12. Create the new allocation ─────────────────────────────────────────
  const nowIso = new Date().toISOString();
  let miningEndsAt: string | null = null;
  let maturityDate: string | null = null;

  if (payment_model === "flexible" && mining_period) {
    const PERIOD_MS: Record<string, number> = {
      hourly: 3_600_000,
      daily:  86_400_000,
      weekly: 604_800_000,
      monthly: 2_592_000_000,
    };
    const ms = PERIOD_MS[mining_period] ?? PERIOD_MS.daily;
    miningEndsAt = new Date(Date.now() + ms).toISOString();
  }
  if (payment_model === "contract" && contract_months) {
    const d = new Date();
    d.setMonth(d.getMonth() + contract_months);
    maturityDate = d.toISOString();
  }

  // FIXED: compute lock_unlock_at server-side from the validated amount —
  // never trust a client-sent lock date, always derive it from the
  // server-validated amount so users can't manipulate their own lock period.
  const lockDays     = getLockDaysByAmount(amount);
  const lockUnlockAt = new Date(Date.now() + lockDays * 86_400_000).toISOString();

  const { data: newAlloc, error: allocErr } = await supabase
    .from("node_allocations")
    .insert({
      user_id:          userId,
      plan_id,
      amount_invested:  amount,
      status:           "active",
      created_at:       nowIso,
      updated_at:       nowIso,
      payment_model,
      mining_period:    payment_model === "flexible" ? (mining_period ?? "daily") : null,
      mining_ends_at:   miningEndsAt,
      contract_months:  contract_months ?? null,
      contract_label:   contract_months ? `${contract_months} Month${contract_months > 1 ? "s" : ""}` : null,
      maturity_date:    maturityDate,
      total_earned:     0,
      total_withdrawn:  0,
      mining_completed: false,
      funded_from:      "balance",
      funded_amount:    amount,
      remine_parent_id: source_allocation_id ?? null,
      lock_unlock_at:   lockUnlockAt,
      capital_returned: false,
    })
    .select("id")
    .single();

  if (allocErr || !newAlloc) {
    // Rollback: credit balance back
    await supabase.rpc("credit_balance", {
      p_user_id:   userId,
      p_amount:    amount,
      p_type:      "credit_return",
      p_note:      `Rollback: allocation creation failed for request ${requestId}`,
      p_ref_alloc: null,
    });
    return failRequest("Failed to create mining allocation. Your balance has been restored.", 500);
  }

  // ── 13. Update total_remined on user ──────────────────────────────────────
  await supabase
    .from("users")
    .update({ total_remined: (userData.total_remined ?? 0) + amount })
    .eq("id", userId);

  // ── 14. Mark request as completed ─────────────────────────────────────────
  await supabase.from("remine_requests").update({
    status:         "completed",
    balance_before: currentBalance,
    balance_after:  balanceAfter,
    allocation_id:  newAlloc.id,
    completed_at:   new Date().toISOString(),
  }).eq("id", requestId);

  // ── 15. Send in-app notification ──────────────────────────────────────────
  await supabase.from("user_notifications").insert({
    user_id:    userId,
    type:       "remine_started",
    title:      "Re-mine Started",
    body:       `$${amount.toFixed(2)} from your balance is now mining on ${plan.name}. Locked for ${lockDays} days. New balance: $${balanceAfter.toFixed(2)}.`,
    created_at: new Date().toISOString(),
  }); // non-critical

  return NextResponse.json({
    success:         true,
    allocation_id:   newAlloc.id,
    amount_deducted: amount,
    balance_after:   balanceAfter,
    lock_days:       lockDays,
    lock_unlock_at:  lockUnlockAt,
    message:         `Successfully started mining $${amount.toFixed(2)} on ${plan.name}`,
  });
}