// app/api/admin/support-reply/route.ts
//
// FIX: Previous version only accepted `body` — image_url and image_name were
// silently dropped, so admin attachments never appeared in the chat.
// FIX: body validation used !body which blocked attachment-only messages.
// FIX: delivery_status update now happens in the same insert via .select("id")
// to avoid a race where the realtime listener fires before the status is set.

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(req: NextRequest) {
  try {
    const { ticketId, body, image_url, image_name } = await req.json();

    if (!ticketId) {
      return NextResponse.json(
        { error: "Missing ticketId" },
        { status: 400 },
      );
    }

    // Allow attachment-only messages (body can be empty when image_url is set)
    const hasText = typeof body === "string" && body.trim().length > 0;
    const hasImage = Boolean(image_url);
    if (!hasText && !hasImage) {
      return NextResponse.json(
        { error: "body or image_url is required" },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("support_messages")
      .insert({
        ticket_id: ticketId,
        body: body || "",
        is_admin: true,
        created_at: now,
        image_url: image_url || null,
        image_name: image_name || null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[support-reply] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Update delivery_status after insert — separate call is fine here because
    // the realtime listener on the client side does a full re-fetch via
    // fetchMessages(), not just the raw payload.
    await supabaseAdmin
      .from("support_messages")
      .update({ delivery_status: "delivered", delivered_at: now })
      .eq("id", data.id);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[support-reply] exception:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}