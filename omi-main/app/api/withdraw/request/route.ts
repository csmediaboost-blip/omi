// app/api/withdraw/request/route.ts
// SECURITY FIX: Complete rewrite — was 8 lines with NO auth whatsoever.

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      },
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Please sign in to request a withdrawal." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);

    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal amount." }, { status: 400 });
    }
    if (amount < 10) {
      return NextResponse.json({ error: "Minimum withdrawal is $10.00." }, { status: 400 });
    }
    if (amount > 50000) {
      return NextResponse.json({ error: "Maximum single withdrawal is $50,000." }, { status: 400 });
    }

    // Redirect to the full validated flow
    return NextResponse.json({
      error: "Please use the withdrawal form in your dashboard which includes security PIN verification.",
    }, { status: 400 });
  } catch (err: any) {
    console.error("[withdraw/request] Error:", err.code || "unknown");
    return NextResponse.json({ error: "An error occurred. Please try again." }, { status: 500 });
  }
}