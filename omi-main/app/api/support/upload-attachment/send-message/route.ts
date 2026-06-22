// app/api/support/send-message/route.ts
// Inserts a user message using service role — bypasses RLS so guests can send
// messages without needing to be authenticated.
//
// BUG FIX: .single() on the ticket lookup throws a 406 error when no row
// matches (e.g. stale ticketId in localStorage). Switched to .maybeSingle()
// which returns null instead of throwing, so we return a clean 404.
//
// BUG FIX: body validation used !body which treats "" as missing. A message
// with only an attachment legitimately has body="" — the check now only
// requires at least one of body (non-empty string) OR image_url.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
        { error: "ticketId is required" },
        { status: 400 },
      );
    }

    // Allow empty body string when there is a file attachment; only reject
    // when both body is empty/missing AND there is no image.
    const hasText = typeof body === "string" && body.trim().length > 0;
    const hasImage = Boolean(image_url);
    if (!hasText && !hasImage) {
      return NextResponse.json(
        { error: "body or image_url is required" },
        { status: 400 },
      );
    }

    // Use maybeSingle() — .single() throws a 406 when 0 rows match, which
    // crashes the route with an unhandled error rather than returning a
    // clean 404. This was causing "user can't send messages" errors when the
    // ticketId stored in localStorage was stale or belonged to a closed ticket.
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("support_tickets")
      .select("id, status")
      .eq("id", ticketId)
      .maybeSingle();

    if (ticketError) {
      console.error("[send-message] ticket lookup error:", ticketError);
      return NextResponse.json(
        { error: "Failed to verify ticket" },
        { status: 500 },
      );
    }

    if (!ticket) {
      return NextResponse.json(
        { error: "Ticket not found — please refresh and try again" },
        { status: 404 },
      );
    }

    if (ticket.status === "closed" || ticket.status === "resolved") {
      return NextResponse.json(
        { error: "This support ticket is closed" },
        { status: 409 },
      );
    }

    const { error } = await supabaseAdmin.from("support_messages").insert({
      ticket_id: ticketId,
      sender_id: null, // not available server-side without user JWT
      body: body || "", // empty string is fine when there's an image
      is_admin: false,
      created_at: new Date().toISOString(),
      image_url: image_url || null,
      image_name: image_name || null,
    });

    if (error) {
      console.error("[send-message] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[send-message] exception:", msg);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
