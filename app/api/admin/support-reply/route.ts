// app/api/admin/support-reply/route.ts
// FIX: sender_id has a FK to auth.users — fake UUIDs violate the constraint.
// Run this ONCE in Supabase SQL editor FIRST:
//   ALTER TABLE support_messages ALTER COLUMN sender_id DROP NOT NULL;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminAuth } from "@/lib/api-security";

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
  try {
    // Verify admin authentication
    const authResult = await requireAdminAuth(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { ticketId, body } = await req.json();

    if (!ticketId || !body?.trim()) {
      return NextResponse.json(
        { error: "ticketId and body are required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabaseAdmin
      .from("support_messages")
      .insert({
        ticket_id: ticketId,
        sender_id: null, // NULL avoids FK — is_admin:true identifies it as admin
        body: body.trim(),
        is_admin: true,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("Admin reply insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseAdmin
      .from("support_tickets")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", ticketId);

    return NextResponse.json({ success: true, message: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 },
    );
  }
}
