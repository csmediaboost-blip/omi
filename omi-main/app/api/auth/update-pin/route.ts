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
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

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
    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(access_token);

    if (userErr || !userData?.user?.email) {
      return NextResponse.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 },
      );
    }

    const { user } = userData;

    // Identity check: re-verify the account password server-side.
    const { error: reauthErr } = await supabaseAnon.auth.signInWithPassword({
      email: user.email!,
      password,
    });
    if (reauthErr) {
      return NextResponse.json(
        { error: "Password is incorrect." },
        { status: 401 },
      );
    }

    const newHash = hashPin(newPin, user.id);

    const { error: updateErr } = await supabaseAdmin
      .from("users")
      .update({
        pin_hash: newHash,
        pin_attempts: 0,
        pin_locked: false,
      })
      .eq("id", user.id);

    if (updateErr) {
      console.error("[api/update-pin] users update error:", updateErr);
      return NextResponse.json(
        { error: updateErr.message || "Failed to update PIN" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[api/update-pin] unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected server error. Please try again." },
      { status: 500 },
    );
  }
}