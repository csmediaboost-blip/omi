// app/api/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  // Rate limit: 3 registration attempts per IP per hour
  const ip = getClientIp(req);
  const { allowed } = await rateLimit(`register:${ip}`, 3, 60 * 60_000);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 },
      );
    }

    // NOTE: `role` is intentionally NOT destructured — users are always created as "user".
    // Role assignment must only happen via admin action after account creation.
    const { email, password, name } = body;

    // Presence check
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Missing required fields." },
        { status: 400 },
      );
    }

    // Type + format validation
    if (
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254
    ) {
      return NextResponse.json(
        { error: "Invalid email address." },
        { status: 400 },
      );
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: "Password must contain at least one letter and one number." },
        { status: 400 },
      );
    }

    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Full name must be at least 2 characters." },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServiceClient();

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email: email.toLowerCase().trim(),
        password,
        email_confirm: false, // Set to true to enforce email verification
        user_metadata: { name: name.trim() },
      });

    if (authError) {
      console.error(
        "[register] Auth creation error:",
        authError.code ?? "unknown",
      );

      if (
        authError.message.toLowerCase().includes("already registered") ||
        authError.message.toLowerCase().includes("already exists")
      ) {
        return NextResponse.json(
          { error: "Email already in use." },
          { status: 400 },
        );
      }

      // Do NOT leak internal error messages to the client
      return NextResponse.json(
        { error: "Registration failed. Please try again." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: true, message: "Account created successfully." },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("[register] Unexpected error:", error.code ?? "unknown");
    return NextResponse.json(
      { error: "Registration failed. Please try again." },
      { status: 500 },
    );
  }
}
