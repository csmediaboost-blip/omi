// app/api/admin/korapay-accounts/route.ts
// Service-role-only API for managing korapay_accounts table.
// GET  → returns all accounts (keys masked) + today's usage per slot
// POST → upsert / toggle / delete a slot

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ── Verify admin — matches EXACT same logic as AdminLayout ────────────────────
// AdminLayout grants access when: is_admin === true OR role === "admin"
// This function must mirror that or admins get bounced back to dashboard.
async function verifyAdmin(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    console.warn("[korapay-accounts] No token in Authorization header");
    return null;
  }

  // Verify the JWT and get the user
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: { user }, error: userErr } = await anonClient.auth.getUser(token);
  if (userErr || !user) {
    console.warn("[korapay-accounts] Token invalid:", userErr?.message);
    return null;
  }

  // Use service role to read profile — bypasses RLS
  const admin = getSupabaseAdmin();
  const { data: profile, error: profileErr } = await admin
    .from("users")
    .select("is_admin, role")
    .eq("id", user.id)
    .single();

  if (profileErr) {
    console.warn("[korapay-accounts] Profile lookup failed:", profileErr.message);
    return null;
  }

  const p = profile as { is_admin?: boolean; role?: string } | null;

  // Mirror AdminLayout: is_admin === true OR role === "admin"
  const isAdmin = p?.is_admin === true || p?.role === "admin";

  if (!isAdmin) {
    console.warn(
      `[korapay-accounts] User ${user.id} is not admin. ` +
      `is_admin=${p?.is_admin}, role=${p?.role}`,
    );
    return null;
  }

  return user.id;
}

export async function GET(req: NextRequest) {
  const adminId = await verifyAdmin(req);
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  // Get all accounts
  const { data: accounts, error: accErr } = await supabase
    .from("korapay_accounts")
    .select("id, slot, label, secret_key, is_active, daily_limit_ngn, created_at")
    .order("slot");

  if (accErr) {
    return NextResponse.json({ error: accErr.message }, { status: 500 });
  }

  // Get today's usage per slot
  const { data: usageData, error: usageErr } = await supabase
    .rpc("get_korapay_daily_usage_by_slot");

  if (usageErr) {
    console.warn("[korapay-accounts] Usage query failed:", usageErr.message);
  }

  // Return full key in secret_key_full so edit form can pre-populate it
  // secret_key is masked for display
  const processedAccounts = (accounts || []).map((a) => ({
    ...a,
    secret_key_full: a.secret_key || "",
    secret_key: a.secret_key
      ? a.secret_key.slice(0, 15) + "•".repeat(Math.max(0, (a.secret_key.length || 0) - 15))
      : "",
  }));

  return NextResponse.json({
    accounts: processedAccounts,
    usage: usageData || [],
  });
}

export async function POST(req: NextRequest) {
  const adminId = await verifyAdmin(req);
  if (!adminId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action, slot } = body;

  if (!action || !slot) {
    return NextResponse.json({ error: "Missing action or slot" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // ── UPSERT ───────────────────────────────────────────────────────────────
  if (action === "upsert") {
    const { label, secret_key, daily_limit_ngn } = body;

    if (!secret_key?.trim()) {
      return NextResponse.json({ error: "secret_key is required" }, { status: 400 });
    }
    if (!secret_key.trim().startsWith("sk_")) {
      return NextResponse.json(
        { error: "KoraPay keys must start with sk_live_ or sk_test_" },
        { status: 400 },
      );
    }
    if (slot < 1 || slot > 10) {
      return NextResponse.json({ error: "Slot must be between 1 and 10" }, { status: 400 });
    }

    const { error } = await supabase
      .from("korapay_accounts")
      .upsert(
        {
          slot,
          label: label || `Account ${slot}`,
          secret_key: secret_key.trim(),
          daily_limit_ngn: Number(daily_limit_ngn) || 498000,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slot" },
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  // ── TOGGLE ────────────────────────────────────────────────────────────────
  if (action === "toggle") {
    const { is_active } = body;

    // Prevent disabling all slots — always keep at least 1 active
    if (!is_active) {
      const { count } = await supabase
        .from("korapay_accounts")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .neq("slot", slot);

      if ((count ?? 0) === 0) {
        return NextResponse.json(
          { error: "Cannot disable — at least one slot must remain active" },
          { status: 400 },
        );
      }
    }

    const { error } = await supabase
      .from("korapay_accounts")
      .update({ is_active, updated_at: new Date().toISOString() })
      .eq("slot", slot);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (action === "delete") {
    if (slot === 1) {
      return NextResponse.json(
        { error: "Cannot delete slot 1 (primary account)" },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("korapay_accounts")
      .delete()
      .eq("slot", slot);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}