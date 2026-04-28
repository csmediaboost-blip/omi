import { NextRequest, NextResponse } from "next/server";
import { createTask, listTasks } from "@/lib/db-service";
import { supabase } from "@/lib/supabase";
import { requireAuth } from "@/lib/api-security";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // SECURITY: Verify user authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }
    const { userId: authenticatedUserId } = authResult;

    const {
      userId,
      title,
      description,
      category,
      difficulty,
      budget,
      deadline,
      requirements,
    } = await req.json();

    if (!userId || !title || !description || !budget) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // SECURITY: Users can only create tasks for themselves
    if (userId !== authenticatedUserId) {
      return NextResponse.json(
        { error: "Forbidden: Cannot create tasks for another user" },
        { status: 403 }
      );
    }

    const task = await createTask({
      clientId: userId,
      title,
      description,
      category,
      difficulty: difficulty || "medium",
      budget,
      deadline: new Date(deadline),
      requirements,
      status: "open",
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error: any) {
    console.error("Task creation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create task" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const difficulty = searchParams.get("difficulty");
    const status = searchParams.get("status");

    // ✅ If no filters, fetch directly from Supabase (for TaskMarketplace)
    if (!category && !difficulty && !status) {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return NextResponse.json(data);
    }

    // ✅ Otherwise use listTasks with filters
    const tasks = await listTasks({
      category: category || undefined,
      difficulty: difficulty || undefined,
      status: status || "open",
    });

    return NextResponse.json(tasks);
  } catch (error: any) {
    console.error("Task listing error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list tasks" },
      { status: 500 },
    );
  }
}
