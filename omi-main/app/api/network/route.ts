import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const userId = searchParams.get("userId");

  const { data } = await supabase
    .from("referrals")
    .select("*")
    .eq("referrer_id", userId);

  return NextResponse.json(data);
}
