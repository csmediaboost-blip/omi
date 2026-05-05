import { supabase } from "@/lib/supabase";

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
