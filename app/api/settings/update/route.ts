import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { userId, full_name, wallet } = await req.json();

  await supabase
    .from("users")
    .update({
      full_name,
      wallet,
    })
    .eq("id", userId);

  return NextResponse.json({ success: true });
}
