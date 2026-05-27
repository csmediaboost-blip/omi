// app/api/verify-pin/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_ATTEMPTS = 5;

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

    // Verify the caller's session
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

    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: userData, error: userFetchError } = await serviceSupabase
      .from("users")
      .select("pin_hash, pin_attempts, pin_locked, pin_set")
      .eq("id", user.id)
      .single();

    if (userFetchError || !userData) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    // Hard stop — account is locked
    if (userData.pin_locked) {
      return NextResponse.json(
        {
          error:
            "Account locked due to too many failed attempts. Please reset your PIN.",
        },
        { status: 429 },
      );
    }

    // Guard: PIN must be configured before it can be verified
    if (!userData.pin_set || !userData.pin_hash) {
      return NextResponse.json(
        { error: "No PIN set. Please set a PIN first." },
        { status: 400 },
      );
    }

    // ─── PIN comparison ──────────────────────────────────────────────────────
    // Supports both modern bcrypt hashes and legacy SHA-256 hashes.
    // On a successful legacy match the hash is silently migrated to bcrypt.
    let isValidPin = false;

    if (userData.pin_hash.startsWith("$2")) {
      // Modern bcrypt hash
      isValidPin = await bcrypt.compare(pin, userData.pin_hash);
    } else {
      // Legacy SHA-256 hash (pin + userId, hex-encoded)
      const encoded = new TextEncoder().encode(pin + user.id);
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
      const sha256Hash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      isValidPin = sha256Hash === userData.pin_hash;

      // Migrate to bcrypt on first successful legacy verify
      if (isValidPin) {
        const migratedHash = await bcrypt.hash(pin, 12);
        await serviceSupabase
          .from("users")
          .update({ pin_hash: migratedHash })
          .eq("id", user.id)
          .catch((err) =>
            console.error(
              "[verify-pin] Hash migration failed:",
              err.code ?? "unknown",
            ),
          );
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (!isValidPin) {
      const newAttempts = (userData.pin_attempts ?? 0) + 1;
      const shouldLock = newAttempts >= MAX_ATTEMPTS;

      await serviceSupabase
        .from("users")
        .update({ pin_attempts: newAttempts, pin_locked: shouldLock })
        .eq("id", user.id)
        .catch((err) =>
          console.error(
            "[verify-pin] Failed to update attempts:",
            err.code ?? "unknown",
          ),
        );

      const remaining = MAX_ATTEMPTS - newAttempts;
      return NextResponse.json(
        {
          error: shouldLock
            ? "Too many failed attempts. Account locked. Please reset your PIN."
            : `Invalid PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
        },
        { status: 401 },
      );
    }

    // Success — reset lockout counters
    await serviceSupabase
      .from("users")
      .update({
        pin_attempts: 0,
        pin_locked: false,
        last_pin_verified_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .catch((err) =>
        console.error(
          "[verify-pin] Failed to reset attempts:",
          err.code ?? "unknown",
        ),
      );

    return NextResponse.json(
      { success: true, message: "PIN verified successfully." },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("[verify-pin] Unexpected error:", error.code ?? "unknown");
    return NextResponse.json(
      { error: "An error occurred. Please try again." },
      { status: 500 },
    );
  }
}
