// app/api/kyc-sign-agreements/route.ts
//
// WHY THIS EXISTS:
// Same mobile fetch() stall issue — the signAgreements() function called
// supabase.from("users").update() directly from the mobile browser.
// Moving it server-side eliminates the potential stall.

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();

    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name) => cookieStore.get(name)?.value,
          set: () => {},
          remove: () => {},
        },
      },
    );

    const {
      data: { session },
      error: sessErr,
    } = await supabaseAuth.auth.getSession();

    if (sessErr || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = getSupabaseServiceClient();
    const { error } = await service
      .from("users")
      .update({ cla_signed: true, terms_signed: true })
      .eq("id", session.user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[kyc-sign-agreements] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}
