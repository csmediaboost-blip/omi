import { supabase } from "@/lib/supabase";
import { checkDailyLimit } from "@/lib/taskLimits";
import { enforceCooldown } from "@/lib/taskCooldown";
import { checkTaskSlots } from "@/lib/taskSlots";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();

  const { userId, taskId, tier } = body;

  await checkDailyLimit(userId, tier);

  await checkTaskSlots(taskId);

  await enforceCooldown(userId);

  const { error } = await supabase.from("task_submissions").insert({
    user_id: userId,
    task_id: taskId,
    status: "pending",
  });

  if (error) return NextResponse.json({ error: error.message });

  return NextResponse.json({ success: true });
}
