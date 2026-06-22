import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Service role client — bypasses RLS entirely
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: Request) {
  try {
    const { planId, locked } = (await req.json()) as {
      planId: string;
      locked: boolean;
    };

    if (!planId || typeof locked !== "boolean") {
      return NextResponse.json(
        { error: "planId and locked (boolean) are required" },
        { status: 400 },
      );
    }

    // Verify caller is admin via their session token
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    if (token) {
      const {
        data: { user },
      } = await adminSupabase.auth.getUser(token);
      if (user) {
        const { data: profile } = await adminSupabase
          .from("users")
          .select("is_admin, role")
          .eq("id", user.id)
          .single();

        const p = profile as { is_admin?: boolean; role?: string } | null;
        if (!p?.is_admin && p?.role !== "admin") {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    // Update using service role — bypasses RLS
    const { error } = await adminSupabase
      .from("gpu_plans")
      .update({ is_admin_locked: locked })
      .eq("id", planId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, planId, locked });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
