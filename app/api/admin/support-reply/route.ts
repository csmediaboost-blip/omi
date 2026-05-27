// app/api/admin/support-reply/route.ts
// FIX: sender_id has a FK to auth.users — fake UUIDs violate the constraint.
// Run this ONCE in Supabase SQL editor FIRST:
//   ALTER TABLE support_messages ALTER COLUMN sender_id DROP NOT NULL;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeText, validateUUID } from "@/lib/sanitize";
import {
  requireAdminAuth,
  logAdminAction,
  getClientIp,
} from "@/lib/api-security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function POST(req: NextRequest) {
  const authResult = await requireAdminAuth(req);
  if (authResult instanceof Response) return authResult;
  const { userId: adminId } = authResult;

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { ticketId, body } = await req.json();

    if (!validateUUID(ticketId)) {
      return NextResponse.json(
        { error: "Invalid ticket ID format" },
        { status: 400 },
      );
    }

    const sanitizedBody = sanitizeText(body, 5000);
    if (!sanitizedBody || sanitizedBody.length === 0) {
      return NextResponse.json(
        { error: "Message cannot be empty" },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("support_messages")
      .insert({
        ticket_id: ticketId,
        sender_id: null,
        body: sanitizedBody,
        message: sanitizedBody,
        is_admin: true,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Admin reply insert error:", error.code);
      return NextResponse.json(
        { error: "An error occurred. Please try again." },
        { status: 500 },
      );
    }

    await supabaseAdmin
      .from("support_tickets")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", ticketId);

    return NextResponse.json({ success: true, message: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: "An error occurred. Please try again." },
      { status: 500 },
    );
  }
}
