// app/api/auth/update-password/route.ts
//
// Moves the actual password update off the client and onto our own
// domain. This sidesteps in-app-browser / WebView environments (e.g.
// links opened inside Facebook/Messenger, Instagram, etc.) that can
// silently swallow the *response* of cross-origin requests to
// *.supabase.co even though the request itself goes through — which is
// what produces "it updated but the UI never stopped spinning."
//
// The client already has a valid recovery session (established via the
// magic-link redirect + onAuthStateChange, same as before). We just take
// its access_token, verify it server-side, then use the service-role
// admin API to set the new password — no anon key / RLS dependency.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AuthError, User } from "@supabase/supabase-js";

export const runtime = "nodejs";
// Give the function enough headroom to hit our own internal timeouts
// below and still return a response, rather than getting killed by
// Vercel's default limit mid-call (which can leave the client fetch
// hanging instead of erroring cleanly).
export const maxDuration = 30;

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

    if (!access_token || !password) {
      return NextResponse.json(
        { error: "Missing access_token or password" },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    // Verify the token is a real, currently-valid session before doing
    // anything — this stands in for the RLS check we'd otherwise lose by
    // using the service role key.
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
      console.error("[api/update-password] getUser timed out:", e);
      return NextResponse.json(
        { error: "Verifying your session is taking too long. Please try again." },
        { status: 504 },
      );
    }

    if (userErr || !userData?.user) {
      return NextResponse.json(
        { error: "Your session has expired. Please request a new reset link." },
        { status: 401 },
      );
    }

    let updateErr: AuthError | null;
    try {
      ({ error: updateErr } = await withTimeout<{
        data: unknown;
        error: AuthError | null;
      }>(
        supabaseAdmin.auth.admin.updateUserById(userData.user.id, { password }),
        12_000,
        "TIMEOUT_UPDATE_USER",
      ));
    } catch (e) {
      console.error("[api/update-password] updateUserById timed out:", e);
      return NextResponse.json(
        {
          error:
            "Updating your password is taking too long. If it doesn't confirm shortly, it may have already changed — try signing in with the new password.",
        },
        { status: 504 },
      );
    }

    if (updateErr) {
      console.error("[api/update-password] admin.updateUserById error:", updateErr);
      return NextResponse.json(
        { error: updateErr.message || "Failed to update password" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("[api/update-password] unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected server error. Please try again." },
      { status: 500 },
    );
  }
}