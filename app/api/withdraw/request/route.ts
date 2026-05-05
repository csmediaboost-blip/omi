import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { userId, amount } = await req.json();

  await supabase.from("withdrawal_requests").insert({
    user_id: userId,
    amount,
    status: "pending",
  });

  return NextResponse.json({ success: true });
}
