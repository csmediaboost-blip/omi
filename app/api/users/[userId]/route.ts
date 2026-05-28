// app/api/users/[userId]/route.ts
import { getSupabaseServiceClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

type RouteContext = { params: Promise<{ userId: string }> };

// ── GET /api/users/[userId] ───────────────────────────────────────────────────
// Returns the full user profile for the given userId.
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { userId } = await params;

  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServiceClient();

    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }
      console.error("[users/GET] DB error:", error.code);
      return NextResponse.json(
        { error: "Failed to fetch user." },
        { status: 500 },
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error("[users/GET] Unexpected error:", err.code ?? "unknown");
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

// ── PATCH /api/users/[userId] ─────────────────────────────────────────────────
// Partially updates allowed fields on a user profile.
// Role and sensitive fields are NOT updatable through this endpoint.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { userId } = await params;

  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  // Whitelist — never let callers overwrite role, balance, or auth fields
  const ALLOWED_FIELDS = [
    "name",
    "bio",
    "profile_image",
    "country_code",
    "currency",
    "kyc_status",
    "tier",
    "is_active",
  ] as const;

  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) updates[field] = body[field];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No updatable fields provided." },
      { status: 400 },
    );
  }

  updates.updated_at = new Date().toISOString();

  try {
    const supabase = getSupabaseServiceClient();

    const { data, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "User not found." }, { status: 404 });
      }
      console.error("[users/PATCH] DB error:", error.code);
      return NextResponse.json(
        { error: "Failed to update user." },
        { status: 500 },
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error("[users/PATCH] Unexpected error:", err.code ?? "unknown");
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}

// ── DELETE /api/users/[userId] ────────────────────────────────────────────────
// Soft-deletes a user by marking them inactive rather than destroying the row.
// Hard-delete is done via Supabase Auth admin panel or a separate admin route.
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { userId } = await params;

  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServiceClient();

    const { error } = await supabase
      .from("users")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      console.error("[users/DELETE] DB error:", error.code);
      return NextResponse.json(
        { error: "Failed to deactivate user." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { success: true, message: "User deactivated." },
      { status: 200 },
    );
  } catch (err: any) {
    console.error("[users/DELETE] Unexpected error:", err.code ?? "unknown");
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
