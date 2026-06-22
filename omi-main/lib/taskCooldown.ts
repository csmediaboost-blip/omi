import { supabase } from "@/lib/supabase";

export async function enforceCooldown(userId: string) {
  const { data: lastTask } = await supabase
    .from("task_submissions")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (!lastTask || lastTask.length === 0) return;

  const lastTime = new Date(lastTask[0].created_at).getTime();

  const now = Date.now();

  const cooldown = 60000;

  if (now - lastTime < cooldown) {
    throw new Error("Please wait before submitting another task");
  }
}
