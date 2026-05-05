// app/api/contributor-id/route.ts
// Generates contributor ID card — pulls from users + kyc_documents tables
// Only accessible by the authenticated user for their own ID

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getAdminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  try {
    const adminDb = getAdminDb();
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await adminDb
      .from("users")
      .select(
        "id,email,full_name,tier,node_activated_at,node_expiry_date,phone,wallet_address,kyc_verified,kyc_status,created_at",
      )
      .eq("id", user.id)
      .single();

    if (!profile)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Only issue ID if license is active
    const now = new Date();
    const expiry = profile.node_expiry_date
      ? new Date(profile.node_expiry_date)
      : null;
    if (!expiry || expiry < now) {
      return NextResponse.json({ error: "No active license" }, { status: 403 });
    }

    // Generate unique contributor ID: OT-YEAR-SHORTID
    const year = new Date(profile.created_at).getFullYear();
    const shortId = profile.id.replace(/-/g, "").slice(0, 8).toUpperCase();
    const memberId = `OT-${year}-${shortId}`;

    return NextResponse.json({
      memberId,
      fullName: profile.full_name || profile.email.split("@")[0],
      email: profile.email,
      tier: profile.tier,
      activatedAt: profile.node_activated_at,
      expiryDate: profile.node_expiry_date,
      kycVerified: profile.kyc_verified || false,
      joinedAt: profile.created_at,
      issuedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
