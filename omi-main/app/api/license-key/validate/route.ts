// app/api/license-key/validate/route.ts
// POST /api/license-key/validate
// Body: { key: string }
// — Checks key exists, belongs to user, is active, not expired
// — Marks it as used

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

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Auth check - get user from authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.substring(7);
    
    // 2. Decode and verify the JWT token to get user ID
    let userId: string;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error("Invalid token format");
      
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64').toString('utf-8')
      );
      
      userId = payload.sub;
      if (!userId) throw new Error("No user ID in token");
    } catch (err: any) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // 3. Parse body
    const body = await req.json().catch(() => ({}));
    const key: string = (body.key || "").trim().toUpperCase();

    if (!key) {
      return NextResponse.json({ error: "Key is required" }, { status: 400 });
    }

    // 4. Look up the key
    const { data: record, error: fetchError } = await supabaseAdmin
      .from("license_keys")
      .select("*")
      .eq("key", key)
      .eq("user_id", userId)
      .single();

    if (fetchError || !record) {
      return NextResponse.json(
        { error: "Key not found. Generate a new key from the license page." },
        { status: 404 }
      );
    }

    // 5. Check status
    if (record.status === "used") {
      return NextResponse.json(
        { error: "This key has already been used. Each key is single-use only." },
        { status: 409 }
      );
    }

    if (record.status === "expired" || new Date(record.expires_at) < new Date()) {
      await supabaseAdmin
        .from("license_keys")
        .update({ status: "expired" })
        .eq("id", record.id);

      return NextResponse.json(
        { error: "This key has expired. Generate a new one from the license page." },
        { status: 410 }
      );
    }

    // 6. Mark as used
    const { error: updateError } = await supabaseAdmin
      .from("license_keys")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("id", record.id);

    if (updateError) {
      console.error("update error:", updateError);
      return NextResponse.json({ error: "Failed to validate key" }, { status: 500 });
    }

    // 7. Update user record
    await supabaseAdmin
      .from("users")
      .update({ license_key_validated: true, license_key: key })
      .eq("id", userId);

    return NextResponse.json({ success: true, key });
  } catch (err: any) {
    console.error("Validation error:", err);
    return NextResponse.json({ error: err.message || "Validation failed" }, { status: 500 });
  }
}
