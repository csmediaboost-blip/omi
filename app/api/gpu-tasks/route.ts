// app/api/gpu-tasks/route.ts
// ROOT CAUSE FIX: "has_operator_license" column does NOT exist in DB.
// The real column is "has_opertor_license" (typo in original schema).
// Selecting a non-existent column causes the ENTIRE Supabase query to error,
// setting userErr → returning "User not found" to the client.
// FIX: Only select "has_opertor_license" — the column that actually exists.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function getLocalMidnight() {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString();
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await req.json();
    const { action, userId, taskId, choice, confidence } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    // FIXED: removed "has_operator_license" — only "has_opertor_license" exists
    const { data: user, error: userErr } = await supabaseAdmin
      .from("users")
      .select(
        "has_opertor_license, balance_available, streak_count, last_optimization_at, total_task_completed, total_earned, earnings, approved_count",
      )
      .eq("id", userId)
      .single();

    if (userErr || !user) {
      console.error("User fetch error:", userErr?.message);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const hasLicense = user.has_opertor_license || false;
    if (!hasLicense) {
      return NextResponse.json(
        { error: "Operator license required to earn rewards" },
        { status: 403 },
      );
    }

    // ── DAILY OPTIMIZATION ────────────────────────────────────────────────────
    if (action === "complete_optimization") {
      if (!taskId) {
        return NextResponse.json({ error: "taskId required" }, { status: 400 });
      }

      const { data: existing } = await supabaseAdmin
        .from("daily_optimization_logs")
        .select("id")
        .eq("user_id", userId)
        .gte("completed_at", getLocalMidnight())
        .maybeSingle();

      if (existing) {
        return NextResponse.json(
          { error: "Already completed today's optimization" },
          { status: 409 },
        );
      }

      const { data: task, error: taskErr } = await supabaseAdmin
        .from("daily_optimization_tasks")
        .select("reward_amount, is_active")
        .eq("id", taskId)
        .single();

      if (taskErr || !task || !task.is_active) {
        return NextResponse.json(
          { error: "Task not found or inactive" },
          { status: 404 },
        );
      }

      const reward = task.reward_amount || 0.5;

      const { error: logErr } = await supabaseAdmin
        .from("daily_optimization_logs")
        .insert({
          user_id: userId,
          task_id: taskId,
          completed_at: new Date().toISOString(),
          reward_amount: reward,
        });

      if (logErr) {
        console.error("Log error:", logErr);
        return NextResponse.json({ error: logErr.message }, { status: 500 });
      }

      const now = new Date();
      const lastOpt = user.last_optimization_at
        ? new Date(user.last_optimization_at)
        : null;
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const streakContinues =
        lastOpt &&
        lastOpt >=
          new Date(
            yesterday.getFullYear(),
            yesterday.getMonth(),
            yesterday.getDate(),
          ) &&
        lastOpt < new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const newStreak = streakContinues ? (user.streak_count || 0) + 1 : 1;
      const newBalance = (user.balance_available || 0) + reward;
      const newTotalEarned = (user.total_earned || user.earnings || 0) + reward;

      await supabaseAdmin
        .from("users")
        .update({
          balance_available: newBalance,
          total_earned: newTotalEarned,
          earnings: newTotalEarned,
          streak_count: newStreak,
          last_optimization_at: now.toISOString(),
          last_active_at: now.toISOString(),
          total_task_completed: (user.total_task_completed || 0) + 1,
          consecutive_inactive_days: 0,
        })
        .eq("id", userId);

      const nowIso = now.toISOString();

      await supabaseAdmin
        .from("transaction_ledger")
        .insert({
          user_id: userId,
          type: "task_reward",
          amount: reward,
          description: "Daily Thermal Calibration reward",
          reference_id: taskId,
          metadata: { task_type: "daily_optimization", streak: newStreak },
          created_at: nowIso,
        })
        .maybeSingle();

      await supabaseAdmin
        .from("transactions")
        .insert({
          user_id: userId,
          type: "task_reward",
          amount: reward,
          description: "Daily Thermal Calibration reward",
          reference_id: taskId,
          metadata: { task_type: "daily_optimization", streak: newStreak },
          created_at: nowIso,
        })
        .maybeSingle();

      return NextResponse.json({
        success: true,
        reward,
        newBalance,
        streak: newStreak,
      });
    }

    // ── RLHF ─────────────────────────────────────────────────────────────────
    if (action === "submit_rlhf") {
      if (!taskId || !choice) {
        return NextResponse.json(
          { error: "taskId and choice required" },
          { status: 400 },
        );
      }

      const { data: task, error: taskErr } = await supabaseAdmin
        .from("rlhf_tasks")
        .select("reward_amount, is_active")
        .eq("id", taskId)
        .single();

      if (taskErr || !task || !task.is_active) {
        return NextResponse.json(
          { error: "Task not found or inactive" },
          { status: 404 },
        );
      }

      const reward = task.reward_amount || 0.1;

      const { error: respErr } = await supabaseAdmin
        .from("rlhf_responses")
        .insert({
          user_id: userId,
          task_id: taskId,
          selected_option: choice,
          confidence_score: confidence || 3,
          reward_amount: reward,
          created_at: new Date().toISOString(),
        });

      if (respErr) {
        return NextResponse.json({ error: respErr.message }, { status: 500 });
      }

      const newBalance = (user.balance_available || 0) + reward;
      const newTotalEarned = (user.total_earned || user.earnings || 0) + reward;

      await supabaseAdmin
        .from("users")
        .update({
          balance_available: newBalance,
          total_earned: newTotalEarned,
          earnings: newTotalEarned,
          total_task_completed: (user.total_task_completed || 0) + 1,
          approved_count: (user.approved_count || 0) + 1,
          last_active_at: new Date().toISOString(),
          consecutive_inactive_days: 0,
        })
        .eq("id", userId);

      const nowIso = new Date().toISOString();

      await supabaseAdmin
        .from("transaction_ledger")
        .insert({
          user_id: userId,
          type: "task_reward",
          amount: reward,
          description: `RLHF Validation reward — Option ${choice}`,
          reference_id: taskId,
          metadata: { task_type: "rlhf", choice, confidence },
          created_at: nowIso,
        })
        .maybeSingle();

      await supabaseAdmin
        .from("transactions")
        .insert({
          user_id: userId,
          type: "task_reward",
          amount: reward,
          description: `RLHF Validation reward — Option ${choice}`,
          reference_id: taskId,
          metadata: { task_type: "rlhf", choice, confidence },
          created_at: nowIso,
        })
        .maybeSingle();

      return NextResponse.json({ success: true, reward, newBalance });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("gpu-tasks error:", err);
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 },
    );
  }
}
