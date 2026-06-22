// app/api/admin/support-reply/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ──────────────────────────────────────────────────────────────────────────
// SECURITY: Verify the request actually comes from an authenticated admin.
//
// Previously this route had NO auth check and a hardcoded sender_id —
// meaning anyone who discovered this endpoint could post messages as
// "admin" into any support ticket. This must be fixed.
//
// This implementation expects the client to send the user's Supabase
// access token in the Authorization header (Bearer <token>), then checks
// a "profiles" table for role === "admin". Adjust the table/column names
// to match your actual schema if different.
// ──────────────────────────────────────────────────────────────────────────
async function verifyAdmin(
  req: NextRequest,
): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return { ok: false, error: "Missing authorization token" };
  }

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { ok: false, error: "Invalid or expired token" };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile || profile.role !== "admin") {
    return { ok: false, error: "Not authorized" };
  }

  return { ok: true, userId: userData.user.id };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdmin(req);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error || "Unauthorized" },
        { status: 401 },
      );
    }

    const { ticketId, body } = await req.json();

    if (!ticketId || !body) {
      return NextResponse.json(
        { error: "Missing ticketId or body" },
        { status: 400 },
      );
    }

    // Verify ticket exists
    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from("support_tickets")
      .select("id, status")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from("support_messages")
      .insert({
        ticket_id: ticketId,
        body: body,
        is_admin: true,
        sender_id: auth.userId, // use the real authenticated admin's id
        created_at: new Date().toISOString(),
        // delivery_status / delivered_at removed — these columns may not
        // exist on support_messages. If you've added them via migration,
        // confirm the exact column names/types and we can re-add:
        // delivery_status: "delivered",
        // delivered_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("API error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
