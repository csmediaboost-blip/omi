// app/api/kyc-upload-url/route.ts
//
// WHY THIS EXISTS:
// supabase.storage.createSignedUploadUrl() and supabase.storage.upload() both
// use the browser's fetch() API internally. On Android Chrome and iOS Safari,
// fetch() calls to Supabase Storage endpoints stall indefinitely — they never
// resolve or reject, so even Promise.race timeouts never fire. This causes the
// infinite spinner on mobile.
//
// FIX: Generate the signed upload URL SERVER-SIDE here, where fetch() is
// Node.js's implementation (rock-solid, no mobile browser bugs). The mobile
// client then receives a plain HTTPS URL and uploads directly to Supabase
// Storage using XMLHttpRequest, which has a native .timeout property that is
// guaranteed to fire on all mobile browsers.
//
// SECURITY:
// - Requires a valid Supabase session cookie (validated via getSession).
// - Uses service role key only on the server — never exposed to the client.
// - Path is scoped to kyc/{userId}/ so users can only upload to their own folder.

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    // ── 1. Validate the user's session via cookie ──────────────────────────
    const cookieStore = await cookies();

    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name) => cookieStore.get(name)?.value,
          set: () => {}, // read-only in Route Handler
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

    // ── 2. Parse and validate the request body ─────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body?.path || typeof body.path !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid path" },
        { status: 400 },
      );
    }

    const { path } = body as { path: string };

    // Security: ensure the path is scoped to this user's folder only.
    // Prevents a user from generating a signed URL for another user's path.
    if (!path.startsWith(`kyc/${uid}/`)) {
      return NextResponse.json({ error: "Path not allowed" }, { status: 403 });
    }

    // Basic path sanitization — no traversal
    if (path.includes("..") || path.includes("//")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    // ── 3. Generate signed URL server-side using service role ──────────────
    // Service role bypasses RLS entirely — no policy evaluation that could
    // stall. This runs in Node.js, not a mobile browser, so fetch() is reliable.
    const serviceClient = getSupabaseServiceClient();

    for (const bucket of ["kyc-documents", "documents"]) {
      const { data, error } = await serviceClient.storage
        .from(bucket)
        .createSignedUploadUrl(path);

      if (error) {
        console.warn(
          `[kyc-upload-url] bucket "${bucket}" failed:`,
          error.message,
        );
        continue;
      }

      if (!data?.signedUrl) {
        console.warn(
          `[kyc-upload-url] no signed URL returned for bucket "${bucket}"`,
        );
        continue;
      }

      return NextResponse.json({
        signedUrl: data.signedUrl,
        bucket,
        path,
      });
    }

    return NextResponse.json(
      { error: "Could not generate upload URL — check bucket configuration" },
      { status: 500 },
    );
  } catch (err: any) {
    console.error("[kyc-upload-url] Unexpected error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}
