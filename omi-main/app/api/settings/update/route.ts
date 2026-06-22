// app/api/settings/update/route.ts
// SECURITY FIX: Was 14 lines with NO auth — could update ANY user's data.
// Now: session verified, only authenticated user can update their own settings.

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = new Set([
  "full_name",
  "wallet",
  "phone",
  "notification_email",
  "notification_sms",
  "notification_push",
  "two_factor_enabled",
  "language",
  "timezone",
]);

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (toSet) => {
            try {
              toSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              );
            } catch {}
          },
        },
      },
    );

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json(
        { error: "Please sign in to update your settings." },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));

    // NOTE: userId from body is intentionally IGNORED — we use the session userId
    const { full_name, wallet, ...rest } = body;

    const updateData: Record<string, any> = {};

    if (full_name !== undefined) {
      if (typeof full_name !== "string" || full_name.trim().length < 2) {
        return NextResponse.json(
          { error: "Full name must be at least 2 characters." },
          { status: 400 },
        );
      }
      updateData.full_name = full_name.trim();
    }

    if (wallet !== undefined && typeof wallet === "string") {
      updateData.wallet = wallet.trim();
    }

    for (const [key, value] of Object.entries(rest)) {
      if (ALLOWED_FIELDS.has(key)) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update." },
        { status: 400 },
      );
    }

    updateData.updated_at = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", user.id); // Always the session user — never from body

    if (updateErr) {
      console.error("[settings/update] DB error:", updateErr.code);
      return NextResponse.json(
        { error: "Failed to update settings. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[settings/update] Error:", err.code || "unknown");
    return NextResponse.json(
      { error: "An error occurred. Please try again." },
      { status: 500 },
    );
  }
}
