import { supabase } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

export async function checkTaskSlots(taskId: number) {
  const { data: task } = await supabase
    .from("tasks")
    .select("slots")
    .eq("id", taskId)
    .single();

  // ✅ Guard against null task
  if (!task) {
    throw new Error("Task not found");
  }

  // ✅ If slots is 0 or null, task is unlimited — skip check
  if (!task.slots || task.slots === 0) {
    return;
  }

  const { count } = await supabase
    .from("task_submissions")
    .select("*", { count: "exact", head: true })
    .eq("task_id", taskId)
    .eq("status", "approved");

  if (count !== null && count >= task.slots) {
    throw new Error("Task slots filled");
  }
}

/**
 * SECURITY 2.3: Verify user hasn't exceeded reward cap for this task
 * 
 * Prevents earning infinite money from a single task even if slots=0
 */
export async function checkTaskRewardCap(
  userId: string,
  taskId: number
): Promise<boolean> {
  try {
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Get task with reward cap
    const { data: task } = await adminSupabase
      .from("tasks")
      .select("max_reward_per_task, payout_amount")
      .eq("id", taskId)
      .single();

    if (!task) {
      throw new Error("Task not found");
    }

    // If no cap set, allow
    if (!task.max_reward_per_task) {
      return true;
    }

    // Check how much user has earned from this task
    const { data: submissions } = await adminSupabase
      .from("task_submissions")
      .select("id")
      .eq("user_id", userId)
      .eq("task_id", taskId)
      .eq("status", "approved");

    const userEarnings = (submissions?.length || 0) * (task.payout_amount || 0);

    // Reject if user already earned the max
    if (userEarnings >= task.max_reward_per_task) {
      console.warn(`[FRAUD] User ${userId} exceeded reward cap for task ${taskId}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Task reward cap check error:", err);
    // Default to allowing if check fails
    return true;
  }
}
