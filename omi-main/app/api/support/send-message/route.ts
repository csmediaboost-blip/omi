// app/api/support/send-message/route.ts
//
// FIX (this version): the background call to /api/support/ai-reply was firing
// via an un-awaited fetch(). On Vercel serverless, once this route returns its
// response, the function can be frozen/terminated — an un-awaited fetch has NO
// guarantee of completing. This caused intermittent missed AI replies (worked
// sometimes, silently died other times — exactly the "hi" message with no reply).
//
// Fix: use Vercel's waitUntil() from @vercel/functions, which keeps the
// function alive until the background promise settles, even after the
// response has been sent to the client.
//
// Run: npm install @vercel/functions

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";

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

    const hasText = typeof body === "string" && body.trim().length > 0;
    const hasImage = Boolean(image_url);
    if (!hasText && !hasImage) {
      return NextResponse.json(
        { error: "body or image_url is required" },
        { status: 400 },
      );
    }

    // Verify ticket exists and is open
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("support_tickets")
      .select("id, status, user_id, guest_email")
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

    // Insert the user's message
    const { error: insertError } = await supabaseAdmin
      .from("support_messages")
      .insert({
        ticket_id: ticketId,
        sender_id: null,
        body: body || "",
        is_admin: false,
        created_at: new Date().toISOString(),
        image_url: image_url || null,
        image_name: image_name || null,
      });

    if (insertError) {
      console.error("[send-message] insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // ── Fire AI reply in the background, kept alive with waitUntil() ────────
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (req.headers.get("origin") ?? "http://localhost:3000");

    const aiReplyPromise = fetch(`${baseUrl}/api/support/ai-reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId,
        userId: ticket.user_id ?? null,
        guestEmail: ticket.guest_email ?? null,
        currentMessage: {
          body: body || "",
          image_name: image_name || null,
        },
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error("[send-message] ai-reply returned non-OK:", res.status, errText);
        }
      })
      .catch((err) => {
        console.error("[send-message] ai-reply background call failed:", err);
      });

    // This is the critical fix: tells Vercel to keep the function alive
    // until aiReplyPromise settles, instead of freezing immediately after
    // the response below is returned.
    waitUntil(aiReplyPromise);
    // ─────────────────────────────────────────────────────────────────────────

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