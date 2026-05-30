// app/api/checkout/payment-config/route.ts
// Public endpoint — returns ONLY what the checkout UI needs, nothing sensitive

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data, error } = await supabase
      .from("payment_config")
      .select("usd_to_ngn_rate, crypto_wallet_address")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({
        crypto_wallet_address: "",
        usd_to_ngn_rate: 1600,
      });
    }

    return NextResponse.json({
      crypto_wallet_address: data.crypto_wallet_address || "",
      usd_to_ngn_rate: data.usd_to_ngn_rate || 1600,
    });
  } catch {
    return NextResponse.json({
      crypto_wallet_address: "",
      usd_to_ngn_rate: 1600,
    });
  }
}
