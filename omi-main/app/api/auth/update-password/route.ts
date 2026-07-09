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

export const runtime = "nodejs";

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
    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(access_token);

    if (userErr || !userData?.user) {
      return NextResponse.json(
        { error: "Your session has expired. Please request a new reset link." },
        { status: 401 },
      );
    }

    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
      userData.user.id,
      { password },
    );

    if (updateErr) {
      console.error("[api/update-password] admin.updateUserById error:", updateErr);
      return NextResponse.json(
        { error: updateErr.message || "Failed to update password" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[api/update-password] unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected server error. Please try again." },
      { status: 500 },
    );
  }
}