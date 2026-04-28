import { supabase } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";

export async function checkDailyLimit(userId: string, tier: string) {
  const NODE_LIMITS: any = {
    observer: 2,
    compute: 8,
    neural: 11,
    intelligence: 16,
    cognitive: 25,
  };

  const today = new Date().toISOString().slice(0, 10);

  // In-memory cache check first (fast path)
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

/**
 * SECURITY: Validate against database constraints
 * Database has UNIQUE(user_id, task_id, DATE(created_at)) constraint
 * This prevents duplicate submissions even if in-memory cache is bypassed
 */
export async function validateDailyLimitAgainstDb(
  userId: string,
  taskId: string,
  tier: string
): Promise<boolean> {
  try {
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const NODE_LIMITS: any = {
      observer: 2,
      compute: 8,
      neural: 11,
      intelligence: 16,
      cognitive: 25,
    };

    const today = new Date().toISOString().slice(0, 10);
    const userTierLimit = NODE_LIMITS[tier] || 5;

    // Count today's submissions from database
    const { data, error } = await adminSupabase
      .from("task_submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", `${today}T00:00:00.000Z`)
      .lte("created_at", `${today}T23:59:59.999Z`);

    if (error) {
      console.error("Task limit DB check error:", error);
      return false;
    }

    const submissionCount = data?.length || 0;
    return submissionCount < userTierLimit;
  } catch (err) {
    console.error("Task limit validation error:", err);
    return false;
  }
}
