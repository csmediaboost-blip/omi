// app/api/admin/users/route.ts
// Server-side only — service role key NEVER sent to browser
// Add to .env.local:  SUPABASE_SERVICE_ROLE_KEY=your_key_here  (no NEXT_PUBLIC_ prefix)

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 60; // Allow caching for 60 seconds

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // ← server only, no NEXT_PUBLIC_
  if (!url || !key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in environment");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function verifyAdminAccess(req: NextRequest): Promise<{ userId: string } | null> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.substring(7);
    const supabase = getAdminClient();

    // Verify the token and get user
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return null;
    }

    // Check if user is admin using service role
    const { data: profile } = await supabase
      .from("users")
      .select("is_admin, role")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin && profile?.role !== "admin") {
      return null;
    }

    return { userId: user.id };
  } catch (error) {
    return null;
  }
}

// GET /api/admin/users — list users with filters
export async function GET(req: NextRequest) {
  try {
    const adminAuth = await verifyAdminAccess(req);
    if (!adminAuth) {
      return NextResponse.json(
        { error: "Forbidden: Admin access required — Make sure SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_*) is in .env.local and restart your dev server" },
        { status: 403 }
      );
    }

    const supabase = getAdminClient();
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const sortBy = searchParams.get("sortBy") || "created_at";
    const sortAsc = searchParams.get("sortAsc") === "true";
    const fKyc = searchParams.get("kyc") || "all";
    const fFrozen = searchParams.get("frozen") || "all";
    const fLicense = searchParams.get("license") || "all";
    const fTier = searchParams.get("tier") || "all";
    const statsOnly = searchParams.get("statsOnly") === "true";

    if (statsOnly) {
      const { data, error } = await supabase
        .from("users")
        .select(
          "kyc_verified,withdrawals_frozen,has_operator_license,balance_available",
        );
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data });
    }

    let q = supabase.from("users").select(
      "id, email, full_name, kyc_status, kyc_verified, withdrawals_frozen, has_operator_license, tier, balance_available, created_at, last_active_at",
      { count: "exact" }
    );

    if (search.trim()) {
      q = q.or(
        `email.ilike.%${search}%,full_name.ilike.%${search}%,kyc_full_name.ilike.%${search}%,referral_code.ilike.%${search}%`,
      );
    }
    if (fKyc !== "all") q = q.eq("kyc_status", fKyc);
    if (fFrozen === "frozen") q = q.eq("withdrawals_frozen", true);
    if (fFrozen === "active") q = q.eq("withdrawals_frozen", false);
    if (fLicense === "licensed") q = q.eq("has_operator_license", true);
    if (fLicense === "unlicensed") q = q.eq("has_operator_license", false);
    if (fTier !== "all") q = q.eq("tier", fTier);

    q = q.order(sortBy, { ascending: sortAsc });
    q = q.range((page - 1) * pageSize, page * pageSize - 1);

    const { data, count, error } = await q;
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    
    // Add caching headers
    const response = NextResponse.json({ data, count });
    response.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return response;
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH /api/admin/users — update a user
export async function PATCH(req: NextRequest) {
  try {
    const adminAuth = await verifyAdminAccess(req);
    if (!adminAuth) {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    const supabase = getAdminClient();
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id)
      return NextResponse.json({ error: "Missing user id" }, { status: 400 });

    const { error } = await supabase.from("users").update(updates).eq("id", id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // If kyc fields included, also update user_kyc table
    if (updates.kyc_status) {
      const status =
        updates.kyc_status === "verified" ? "verified" : updates.kyc_status;
      await supabase
        .from("user_kyc")
        .update({ status, reviewed_at: new Date().toISOString() })
        .eq("user_id", id);
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
