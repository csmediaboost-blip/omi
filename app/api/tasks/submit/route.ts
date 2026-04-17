import { supabase } from "@/lib/supabase";
import { checkDailyLimit, validateDailyLimitAgainstDb } from "@/lib/taskLimits";
import { enforceCooldown } from "@/lib/taskCooldown";
import { checkTaskSlots, checkTaskRewardCap } from "@/lib/taskSlots";
import { requireAuth } from "@/lib/api-security";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // SECURITY: Verify user authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { userId: authenticatedUserId } = authResult;

    const body = await req.json();
    const { userId, taskId, tier } = body;

    // Verify requesting user matches userId
    if (userId !== authenticatedUserId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot submit tasks for another user" },
        { status: 403 }
      );
    }

    // SECURITY: Verify daily limit both in-memory and against database
    await checkDailyLimit(userId, tier);
    
    const withinDbLimit = await validateDailyLimitAgainstDb(userId, taskId, tier);
    if (!withinDbLimit) {
      return NextResponse.json(
        { error: "Daily task limit reached (enforced by database)" },
        { status: 429 }
      );
    }

    await checkTaskSlots(taskId);
    
    // SECURITY: Check task reward cap (prevent earning infinite from one task)
    const withinRewardCap = await checkTaskRewardCap(userId, taskId);
    if (!withinRewardCap) {
      return NextResponse.json(
        { error: "You have reached the maximum earnings for this task" },
        { status: 429 }
      );
    }

    await enforceCooldown(userId);

    // Database will reject if same user+task submitted today due to UNIQUE constraint
    const { error } = await supabase.from("task_submissions").insert({
      user_id: userId,
      task_id: taskId,
      status: "pending",
    });

    if (error) {
      if (error.message.includes("duplicate") || error.message.includes("unique")) {
        return NextResponse.json(
          { error: "Task already submitted today" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Task submit error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
