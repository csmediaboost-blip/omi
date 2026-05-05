import { NextRequest, NextResponse } from "next/server";
import { createTask, listTasks } from "@/lib/db-service";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 30; // Cache task list for 30 seconds

export async function POST(req: NextRequest) {
  try {
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
        .select("id, title, description, category, difficulty, budget, created_at, status")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(50); // Limit to 50 tasks for better performance

      if (error) throw error;
      
      const response = NextResponse.json(data);
      response.headers.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
      return response;
    }

    // ✅ Otherwise use listTasks with filters
    const tasks = await listTasks({
      category: category || undefined,
      difficulty: difficulty || undefined,
      status: status || "open",
    });

    const response = NextResponse.json(tasks);
    response.headers.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
    return response;
  } catch (error: any) {
    console.error("Task listing error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list tasks" },
      { status: 500 },
    );
  }
}
