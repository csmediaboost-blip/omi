import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET() {
  const adminSupabase = getAdminSupabase();
  const { data, error } = await adminSupabase
    .from("payment_config")
    .select("key, value");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Convert to key-value object, but only expose public keys to client
  const config: Record<string, string> = {};
  (data || []).forEach((row) => {
    // Only expose non-secret keys to the frontend
    if (!row.key.includes("secret")) {
      config[row.key] = row.value || "";
    }
  });

  return NextResponse.json(config);
}
