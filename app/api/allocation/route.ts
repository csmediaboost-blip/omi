// app/api/allocation/route.ts
import { createSupabaseServer } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: clients }, { data: allocation }, { data: profile }] =
    await Promise.all([
      supabase
        .from("gpu_clients")
        .select("*")
        .eq("status", "active")
        .order("risk_level"),
      supabase
        .from("user_allocations")
        .select("*, gpu_clients(*)")
        .eq("user_id", user.id)
        .in("status", ["active", "failed"])
        .maybeSingle(),
      supabase
        .from("users")
        .select(
          "tier, balance_available, balance_pending, has_operator_license, license_expires_at, last_active_at, optimization_streak, consecutive_inactive_days",
        )
        .eq("id", user.id)
        .single(),
    ]);

  return NextResponse.json({
    clients: clients || [],
    allocation: allocation || null,
    profile,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.action === "assign") {
    const { data, error } = await supabase.rpc("assign_gpu_client", {
      p_user_id: user.id,
      p_client_id: body.client_id,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    const r = data as any;
    if (!r.success)
      return NextResponse.json(
        { error: r.error || r.message },
        { status: 400 },
      );
    return NextResponse.json(r);
  }

  if (body.action === "collect") {
    const { data, error } = await supabase.rpc("collect_allocation_earnings", {
      p_user_id: user.id,
      p_alloc_id: body.allocation_id,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    const r = data as any;
    if (!r.success)
      return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
