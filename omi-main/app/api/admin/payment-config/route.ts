// app/api/admin/payment-config/route.ts
// SECURED: requireAdminAuth required for GET and POST + audit logging + key masking

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  requireAdminAuth,
  logAdminAction,
  getClientIp,
} from "@/lib/api-security";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  });
}

export async function GET(req: NextRequest) {
  const authResult = await requireAdminAuth(req);
  if (authResult instanceof Response) return authResult;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("payment_config")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Failed to load config" },
      { status: 500 },
    );
  }

  // Mask secret key — only show last 6 chars so admin can confirm it's set
  const masked = data ? { ...data } : {};
  if (masked.korapay_secret_key) {
    masked.korapay_secret_key =
      "••••••" + String(masked.korapay_secret_key).slice(-6);
  }

  return NextResponse.json(masked ?? {});
}

export async function POST(req: NextRequest) {
  const authResult = await requireAdminAuth(req);
  if (authResult instanceof Response) return authResult;
  const { userId: adminId } = authResult;

  const supabase = getSupabase();
  const body = await req.json();
  const { action, field, value } = body;

  if (action === "upsert") {
    const { data: existing } = await supabase
      .from("payment_config")
      .select("id")
      .limit(1)
      .maybeSingle();

    let result;
    if (existing?.id) {
      result = await supabase
        .from("payment_config")
        .update({ [field]: value })
        .eq("id", existing.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from("payment_config")
        .insert({ [field]: value, created_at: new Date().toISOString() })
        .select()
        .single();
    }

    if (result.error) {
      return NextResponse.json(
        { error: "Config update failed" },
        { status: 500 },
      );
    }

    // Log field name but NOT the value (it's a secret key)
    await logAdminAction(adminId, "update_payment_config", "payment_config", {
      field,
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
