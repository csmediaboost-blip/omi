// app/api/support/upload-attachment/route.ts
// Handles file uploads to Supabase Storage using service role key.
// This avoids mobile browser issues where the Supabase JS client stalls
// on Storage uploads due to auth token refresh race conditions.
//
// FIX: Some mobile browsers (especially Android Chrome/WebView) send
// application/octet-stream for images. We now sniff the real MIME type
// from the file extension when the browser-reported type is missing or generic.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = "support-attachments";

/** Derive a reliable content-type from the file extension when the browser
 *  sends application/octet-stream (common on Android). */
function resolveContentType(file: File): string {
  const reported = file.type;
  if (reported && reported !== "application/octet-stream") return reported;

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
  };
  return map[ext] ?? "application/octet-stream";
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const ticketId = formData.get("ticketId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!ticketId) {
      return NextResponse.json(
        { error: "ticketId is required" },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File must be under 10 MB" },
        { status: 400 },
      );
    }

    // Sanitize filename — remove spaces and special chars that break URLs
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${ticketId}/${Date.now()}_${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Use resolved content-type — fixes Android sending octet-stream for images
    const contentType = resolveContentType(file);

    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("[upload-attachment] storage error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage
      .from(BUCKET)
      .getPublicUrl(path);

    return NextResponse.json({
      url: urlData.publicUrl,
      name: file.name, // return original name for display
      path,
    });
  } catch (err) {
    console.error("[upload-attachment] exception:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}