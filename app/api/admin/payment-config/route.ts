// app/api/admin/payment-config/route.ts
// Rewritten to match actual schema:
// payment_config columns: id, korapay_secret_key, usd_to_ngn_rate, crypto_wallet_address, created_at

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  });
}

// GET — return the single config row (or null if empty)
export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("payment_config")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? {});
}

// POST — upsert specific fields
export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const body = await req.json();
  const { action, field, value, id } = body;

  if (action === "upsert") {
    // Check if a row exists
    const { data: existing } = await supabase
      .from("payment_config")
      .select("id")
      .limit(1)
      .maybeSingle();

    let result;
    if (existing?.id) {
      // Update existing row
      result = await supabase
        .from("payment_config")
        .update({ [field]: value })
        .eq("id", existing.id)
        .select()
        .single();
    } else {
      // Insert first row
      result = await supabase
        .from("payment_config")
        .insert({ [field]: value, created_at: new Date().toISOString() })
        .select()
        .single();
    }

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true, data: result.data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
