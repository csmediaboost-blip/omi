// app/api/set-pin/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 },
      );
    }

    const { pin } = body;

    if (!pin || typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json(
        { error: "PIN must be 4–6 digits." },
        { status: 400 },
      );
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid authorization header." },
        { status: 401 },
      );
    }

    const token = authHeader.slice(7);

    // Verify the caller's session using the anon client + their token
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Session expired. Please sign in again." },
        { status: 401 },
      );
    }

    // bcrypt cost factor 12 — resistant to offline brute-force on short PINs
    const pin_hash = await bcrypt.hash(pin, 12);

    // Service-role client for the privileged DB write
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error: updateError } = await serviceSupabase
      .from("users")
      .update({
        pin_hash,
        pin_set: true,
        pin_attempts: 0,
        pin_locked: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      // Log the code only — never surface DB details to the client
      console.error(
        "[set-pin] DB update error:",
        updateError.code ?? "unknown",
      );
      return NextResponse.json(
        { error: "Failed to set PIN. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { success: true, message: "PIN set successfully." },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("[set-pin] Unexpected error:", error.code ?? "unknown");
    return NextResponse.json(
      { error: "An error occurred. Please try again." },
      { status: 500 },
    );
  }
}
