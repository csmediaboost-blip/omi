import { supabase } from "@/lib/supabase";

export async function submitTask(user: any) {
  const today = new Date().toISOString().slice(0, 10);

  const { data: completedToday } = await supabase
    .from("task_submissions")
    .select("*")
    .eq("user_id", user.id)
    .gte("created_at", today);

  const NODE_LIMITS: any = {
    observer: 2,
    compute: 8,
    neural: 11,
    intelligence: 16,
    cognitive: 25,
  };

  const NODE_REWARD: any = {
    observer: 0.02,
    compute: 0.08,
    neural: 0.2,
    intelligence: 0.42,
    cognitive: 0.9,
  };

  const limit = NODE_LIMITS[user.tier];
  const reward = NODE_REWARD[user.tier];

  if (completedToday && completedToday.length >= limit) {
    throw new Error("Daily task limit reached");
  }

  await supabase.from("task_submissions").insert({
    user_id: user.id,
    reward,
  });

  await supabase
    .from("users")
    .update({
      earnings: user.earnings + reward,
      total_task_completed: user.total_task_completed + 1,
    })
    .eq("id", user.id);
}
