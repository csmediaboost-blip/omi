import { supabase } from "@/lib/supabase";

export async function submitTask(userId: string, taskId: number) {
  const { data: lastTask } = await supabase
    .from("task_submissions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (lastTask && lastTask.length) {
    const lastTime = new Date(lastTask[0].created_at).getTime();

    const now = Date.now();

    if (now - lastTime < 60000) {
      throw new Error("Please wait before submitting another task");
    }
  }

  await supabase.from("task_submissions").insert({
    user_id: userId,
    task_id: taskId,
    status: "pending",
  });
}
