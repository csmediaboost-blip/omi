import { supabase } from "@/lib/supabase";

export async function checkDailyLimit(userId: string, tier: string) {
  const NODE_LIMITS: any = {
    observer: 2,
    compute: 8,
    neural: 11,
    intelligence: 16,
    cognitive: 25,
  };

  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("task_submissions")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", today);

  const count = data?.length || 0;

  if (count >= NODE_LIMITS[tier]) {
    throw new Error("Daily task limit reached");
  }
}
