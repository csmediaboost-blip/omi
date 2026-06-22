// app/api/contributor-id/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIXES:
//  1. Removed queries for non-existent columns: tier, node_activated_at,
//     node_expiry_date — these no longer exist in the updated schema
//  2. ID card now available to ANY user with at least one:
//     - confirmed payment_transaction, OR
//     - node_allocation, OR
//     - active operator_license
//  3. Tier/node name pulled from node_allocations + gpu_plans join
//  4. License name pulled from operator_licenses
//  5. Activated date = first confirmed payment or first allocation
//  6. Expiry = 4 years from first activation (or license expiry if sooner)
// ─────────────────────────────────────────────────────────────────────────────

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

const LICENSE_LABELS: Record<string, string> = {
  thermal_optimization: "Thermal & Neural Operator",
  rlhf_validation: "RLHF Validation Operator",
  gpu_allocation: "GPU Allocation Operator",
  operator_license: "Certified AI Operator",
  all: "Full Operator License",
};

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

    // ── 1. Load user profile (only columns that actually exist) ──────────────
    const { data: profile } = await adminDb
      .from("users")
      .select(
        "id,email,full_name,kyc_verified,kyc_status,created_at,country",
      )
      .eq("id", user.id)
      .single();

    if (!profile)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    // ── 2. Check eligibility: any confirmed payment OR allocation OR license ──
    const [paymentsRes, allocationsRes, licensesRes] = await Promise.all([
      adminDb
        .from("payment_transactions")
        .select("id,amount,created_at,confirmed_at,node_key,gateway,metadata")
        .eq("user_id", user.id)
        .eq("status", "confirmed")
        .order("created_at", { ascending: true })
        .limit(1),

      adminDb
        .from("node_allocations")
        .select("id,plan_id,amount_invested,created_at,payment_model,mining_period")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(5),

      adminDb
        .from("operator_licenses")
        .select("id,license_type,status,purchased_at,expires_at")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("purchased_at", { ascending: false })
        .limit(1),
    ]);

    const firstPayment = paymentsRes.data?.[0] ?? null;
    const allocations = allocationsRes.data ?? [];
    const activeLicense = licensesRes.data?.[0] ?? null;

    // Must have at least one of these to get an ID card
    if (!firstPayment && allocations.length === 0 && !activeLicense) {
      return NextResponse.json(
        { error: "No active license" },
        { status: 403 },
      );
    }

    // ── 3. Determine activation date ─────────────────────────────────────────
    const activationSource =
      firstPayment?.confirmed_at ||
      firstPayment?.created_at ||
      allocations[0]?.created_at ||
      activeLicense?.purchased_at ||
      profile.created_at;

    const activatedAt = new Date(activationSource);

    // ── 4. Determine expiry (4 years from first activation) ──────────────────
    const expiryDate = activeLicense?.expires_at
      ? new Date(activeLicense.expires_at)
      : new Date(activatedAt.getTime() + 4 * 365 * 24 * 60 * 60 * 1000);

    // ── 5. Build tier/node label from allocations + gpu_plans ────────────────
    let tierKey = "gpu_contributor";
    let tierLabel = "GPU Contributor";
    let nodeDetails: Array<{ name: string; model: string }> = [];

    if (allocations.length > 0) {
      // Load gpu_plans for all plan_ids
      const planIds = [...new Set(allocations.map((a) => a.plan_id))];
      const { data: plans } = await adminDb
        .from("gpu_plans")
        .select("id,name,gpu_model,short_name")
        .in("id", planIds);

      const planMap: Record<string, { name: string; gpu_model: string; short_name: string }> = {};
      for (const p of plans ?? []) planMap[p.id] = p;

      nodeDetails = allocations.map((a) => ({
        name: planMap[a.plan_id]?.name ?? a.plan_id,
        model: planMap[a.plan_id]?.gpu_model ?? "GPU Node",
      }));

      // Use the first (most recent) allocation for the primary tier display
      const firstPlan = planMap[allocations[0].plan_id];
      tierKey = allocations[0].plan_id;
      tierLabel = firstPlan?.short_name || firstPlan?.name || "GPU Node";
    }

    // ── 6. Build license label ────────────────────────────────────────────────
    let licenseLabel: string | null = null;
    if (activeLicense) {
      licenseLabel =
        LICENSE_LABELS[activeLicense.license_type] ??
        activeLicense.license_type;
      if (!allocations.length) {
        tierKey = activeLicense.license_type;
        tierLabel = licenseLabel;
      }
    }

    // ── 7. Determine primary node from first confirmed payment metadata ───────
    let primaryNodeFromPayment: string | null = null;
    if (firstPayment?.metadata) {
      try {
        const meta =
          typeof firstPayment.metadata === "string"
            ? JSON.parse(firstPayment.metadata)
            : firstPayment.metadata;
        primaryNodeFromPayment = meta?.planName || meta?.nodeName || null;
      } catch {}
    }

    // ── 8. Generate member ID ────────────────────────────────────────────────
    const year = new Date(profile.created_at).getFullYear();
    const shortId = profile.id.replace(/-/g, "").slice(0, 8).toUpperCase();
    const memberId = `OT-${year}-${shortId}`;

    return NextResponse.json({
      memberId,
      fullName: profile.full_name || profile.email.split("@")[0],
      email: profile.email,
      country: profile.country || null,

      // Tier info
      tier: tierKey,
      tierLabel,
      licenseLabel,

      // Node details array for display
      nodeDetails,
      primaryNode: primaryNodeFromPayment || nodeDetails[0]?.name || tierLabel,

      // Dates
      activatedAt: activatedAt.toISOString(),
      expiryDate: expiryDate.toISOString(),
      joinedAt: profile.created_at,
      issuedAt: new Date().toISOString(),

      // KYC
      kycVerified: profile.kyc_verified || false,
      kycStatus: profile.kyc_status || "not_started",

      // Stats
      totalNodes: allocations.length,
      hasLicense: !!activeLicense,
    });
  } catch (err: any) {
    console.error("[contributor-id] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}