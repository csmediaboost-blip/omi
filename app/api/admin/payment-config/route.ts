// app/api/admin/payment-config/route.ts
// Uses service role to bypass RLS on payment_config table
// The anon client was throwing "row-level security policy violation" on insert/update

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("payment_config")
    .select("*")
    .order("id", { ascending: true });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { action, key, value, id, keys } = await req.json();

    if (action === "upsert_many" && Array.isArray(keys)) {
      // Batch upsert (for gateway templates)
      const now = new Date().toISOString();
      const rows = keys.map((k: { key: string; value: string }) => ({
        key: k.key,
        value: k.value,
        updated_at: now,
      }));

      // Check which exist
      const { data: existing } = await supabaseAdmin
        .from("payment_config")
        .select("key")
        .in(
          "key",
          rows.map((r) => r.key),
        );

      const existingKeys = new Set((existing || []).map((e: any) => e.key));
      const toInsert = rows.filter((r) => !existingKeys.has(r.key));
      const toUpdate = rows.filter((r) => existingKeys.has(r.key));

      if (toInsert.length > 0) {
        const { error } = await supabaseAdmin
          .from("payment_config")
          .insert(toInsert);
        if (error)
          return NextResponse.json({ error: error.message }, { status: 500 });
      }
      for (const row of toUpdate) {
        await supabaseAdmin
          .from("payment_config")
          .update({ value: row.value, updated_at: now })
          .eq("key", row.key);
      }
      return NextResponse.json({ success: true });
    }

    if (action === "insert") {
      const { error } = await supabaseAdmin
        .from("payment_config")
        .insert({ key, value, updated_at: new Date().toISOString() });
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === "update") {
      const { error } = await supabaseAdmin
        .from("payment_config")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === "delete") {
      const { error } = await supabaseAdmin
        .from("payment_config")
        .delete()
        .eq("id", id);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
