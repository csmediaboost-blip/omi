// app/api/kyc-profile/route.ts
//
// WHY THIS EXISTS:
// supabase.auth.getSession() and supabase.from("users").select() both use
// fetch() internally. On Android Chrome / iOS Safari, fetch() to Supabase
// endpoints stalls indefinitely — causing "Session check timed out" on mobile.
//
// This route runs entirely server-side (Node.js fetch, no stalls).
// It reads the session from the cookie, loads the user profile, and creates
// the profile row if it doesn't exist yet — all in one round trip.
// The mobile browser only makes ONE fetch() call to its own Next.js server.

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    // ── 1. Read session from cookie ────────────────────────────────────────
    const cookieStore = await cookies();

    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name) => cookieStore.get(name)?.value,
          set: () => {},
          remove: () => {},
        },
      },
    );

    const {
      data: { session },
      error: sessErr,
    } = await supabaseAuth.auth.getSession();

    if (sessErr || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const uid = session.user.id;
    const email = session.user.email ?? "";
    const service = getSupabaseServiceClient();

    // ── 2. Load profile ────────────────────────────────────────────────────
    const { data, error } = await service
      .from("users")
      .select(
        "id,email,full_name,phone,phone_verified,kyc_verified,kyc_status,kyc_full_name,payout_registered,cla_signed,terms_signed",
      )
      .eq("id", uid)
      .single();

    // ── 3. Auto-create profile if missing ─────────────────────────────────
    if (
      error &&
      (error.code === "PGRST116" || error.message?.includes("no rows"))
    ) {
      const { data: created, error: createErr } = await service
        .from("users")
        .insert({
          id: uid,
          email,
          kyc_status: "not_started",
          kyc_verified: false,
          phone_verified: false,
          payout_registered: false,
          cla_signed: false,
          terms_signed: false,
        })
        .select(
          "id,email,full_name,phone,phone_verified,kyc_verified,kyc_status,kyc_full_name,payout_registered,cla_signed,terms_signed",
        )
        .single();

      if (createErr) {
        return NextResponse.json(
          { error: `Could not create profile: ${createErr.message}` },
          { status: 500 },
        );
      }
      return NextResponse.json({ profile: created });
    }

    if (error) {
      return NextResponse.json(
        { error: `Failed to load profile: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ profile: data });
  } catch (err: any) {
    console.error("[kyc-profile] Unexpected error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}
