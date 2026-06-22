// app/api/admin/support-messages/route.ts
// Fetches messages using the service role key — bypasses RLS so admin can read all messages

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // service role — never expose to client
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ticketId = searchParams.get("ticketId");

    if (!ticketId) {
      return NextResponse.json(
        { success: false, error: "ticketId is required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("support_messages")
      .select(
        "id, ticket_id, sender_id, body, is_admin, created_at, delivery_status, delivered_at, image_url, image_name",
      )
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[support-messages API] query error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, messages: data || [] });
  } catch (err) {
    console.error("[support-messages API] exception:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
