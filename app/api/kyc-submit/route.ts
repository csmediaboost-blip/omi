// app/api/kyc-submit/route.ts
//
// WHY THIS EXISTS:
// On Android Chrome and iOS Safari, fetch() calls to Supabase PostgREST (the
// DB API) stall indefinitely on mobile — same bug as Storage. Moving all DB
// writes server-side (Node.js fetch, rock-solid) completely eliminates the
// "Saving KYC record timed out" error on mobile.
//
// SECURITY:
// - Requires a valid Supabase session cookie.
// - User ID is taken from the verified session, never from the request body.
// - Uses service role key only on the server.

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    // ── 1. Validate session ────────────────────────────────────────────────
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

    // ── 2. Parse body ──────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }

    const {
      documentType,
      documentNumber,
      documentUrl,
      fullName,
      country,
      phone,
      address,
      city,
      gender,
      dateOfBirth,
    } = body as {
      documentType: string;
      documentNumber: string;
      documentUrl: string;
      fullName: string;
      country: string;
      phone: string;
      address: string;
      city: string;
      gender: string;
      dateOfBirth: string;
    };

    // Basic validation
    if (!fullName?.trim())
      return NextResponse.json(
        { error: "Full name required" },
        { status: 400 },
      );
    if (!country?.trim())
      return NextResponse.json({ error: "Country required" }, { status: 400 });
    if (!phone?.trim())
      return NextResponse.json({ error: "Phone required" }, { status: 400 });
    if (!documentType?.trim())
      return NextResponse.json(
        { error: "Document type required" },
        { status: 400 },
      );
    if (!documentNumber?.trim())
      return NextResponse.json(
        { error: "Document number required" },
        { status: 400 },
      );

    const service = getSupabaseServiceClient();

    // ── 3. Insert KYC document record ─────────────────────────────────────
    const { error: docErr } = await service.from("kyc_documents").insert({
      user_id: uid,
      document_type: documentType,
      document_number: documentNumber.trim(),
      document_url: documentUrl || null,
      full_name: fullName.trim(),
      country,
      phone: phone.trim(),
      address: address?.trim() ?? "",
      city: city?.trim() ?? "",
      gender,
      date_of_birth: dateOfBirth,
      status: "pending",
    });

    // Ignore "table does not exist" errors gracefully
    if (
      docErr &&
      docErr.code !== "42P01" &&
      !docErr.message?.includes("does not exist")
    ) {
      console.error("[kyc-submit] kyc_documents insert error:", docErr);
      return NextResponse.json(
        { error: `Could not save record: ${docErr.message}` },
        { status: 500 },
      );
    }

    // ── 4. Update user profile ─────────────────────────────────────────────
    const { error: updErr } = await service
      .from("users")
      .update({
        full_name: fullName.trim(),
        kyc_full_name: fullName.trim(),
        kyc_status: "pending",
        phone: phone.trim(),
        phone_verified: true,
        country,
      })
      .eq("id", uid);

    if (updErr) {
      console.error("[kyc-submit] users update error:", updErr);
      return NextResponse.json(
        { error: `Could not update profile: ${updErr.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[kyc-submit] Unexpected error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}
