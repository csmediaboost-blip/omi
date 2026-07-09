// app/api/auth/update-pin/route.ts
//
// Same rationale as update-password/route.ts: moves the reauth + PIN
// write off the client and onto our own domain, so in-app-browser /
// WebView environments can't swallow the response and leave the UI
// spinning forever. Also closes the security gap flagged in the old
// reset-pin-form.tsx — pin_hash writes now go through the service role
// key on the server instead of the anon key + RLS from the browser.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { AuthError, User, PostgrestError } from "@supabase/supabase-js";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
// Give the function enough headroom to hit our own internal timeouts
// below and still return a response, rather than getting killed by
// Vercel's default limit mid-call (which can leave the client fetch
// hanging instead of erroring cleanly).
export const maxDuration = 30;

// Separate anon-key client, server-side, used only to verify the
// account password via signInWithPassword (Supabase has no
// service-role equivalent for "check this password is correct").
const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// Must match the client-side hashPin() exactly: SHA-256(pin + userId), hex.
function hashPin(pin: string, userId: string): string {
  return crypto.createHash("sha256").update(pin + userId).digest("hex");
}

// Wrap a Supabase call so a stalled request to Supabase's own servers
// can't hang this function indefinitely. Explicit generic required —
// Promise.race widens to `unknown` under this tsconfig otherwise.
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(message)), ms),
  );
  return Promise.race<T>([promise, timeoutPromise]);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const access_token: string | undefined = body?.access_token;
    const password: string | undefined = body?.password;
    const newPin: string | undefined = body?.newPin;

    if (!access_token || !password || !newPin) {
      return NextResponse.json(
        { error: "Missing access_token, password, or newPin" },
        { status: 400 },
      );
    }

    if (!/^\d{4,6}$/.test(newPin)) {
      return NextResponse.json(
        { error: "PIN must be 4–6 digits" },
        { status: 400 },
      );
    }

    // Verify the caller's session is real before doing anything.
    let userData: { user: User | null };
    let userErr: AuthError | null;
    try {
      ({ data: userData, error: userErr } = await withTimeout<{
        data: { user: User | null };
        error: AuthError | null;
      }>(
        supabaseAdmin.auth.getUser(access_token),
        12_000,
        "TIMEOUT_GET_USER",
      ));
    } catch (e) {
      console.error("[api/update-pin] getUser timed out:", e);
      return NextResponse.json(
        { error: "Verifying your session is taking too long. Please try again." },
        { status: 504 },
      );
    }

    if (userErr || !userData?.user?.email) {
      return NextResponse.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 },
      );
    }

    const { user } = userData;

    // Identity check: re-verify the account password server-side.
    let reauthErr: AuthError | null;
    try {
      ({ error: reauthErr } = await withTimeout<{
        data: unknown;
        error: AuthError | null;
      }>(
        supabaseAnon.auth.signInWithPassword({ email: user.email!, password }),
        12_000,
        "TIMEOUT_REAUTH",
      ));
    } catch (e) {
      console.error("[api/update-pin] signInWithPassword timed out:", e);
      return NextResponse.json(
        { error: "Verifying your password is taking too long. Please try again." },
        { status: 504 },
      );
    }

    if (reauthErr) {
      return NextResponse.json(
        { error: "Password is incorrect." },
        { status: 401 },
      );
    }

    const newHash = hashPin(newPin, user.id);

    let updateErr: PostgrestError | null;
    try {
      ({ error: updateErr } = await withTimeout<{
        error: PostgrestError | null;
      }>(
        supabaseAdmin
          .from("users")
          .update({ pin_hash: newHash, pin_attempts: 0, pin_locked: false })
          .eq("id", user.id),
        12_000,
        "TIMEOUT_UPDATE_PIN",
      ));
    } catch (e) {
      console.error("[api/update-pin] users update timed out:", e);
      return NextResponse.json(
        {
          error:
            "Updating your PIN is taking too long. If it doesn't confirm shortly, it may have already changed — try signing in with the new PIN.",
        },
        { status: 504 },
      );
    }

    if (updateErr) {
      console.error("[api/update-pin] users update error:", updateErr);
      return NextResponse.json(
        { error: updateErr.message || "Failed to update PIN" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[api/update-pin] unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected server error. Please try again." },
      { status: 500 },
    );
  }
}