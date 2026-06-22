/**
 * API Security Utilities
 * - Admin authentication check
 * - Rate limiting (Redis-backed)
 * - Request logging
 * - Audit trail
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function requireAdminAuth(
  req: NextRequest,
): Promise<{ userId: string } | Response> {
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("is_admin, role")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin && profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 },
      );
    }

    return { userId: user.id };
  } catch (error: any) {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 401 },
    );
  }
}

/**
 * Admin rate limiter — uses Redis (Upstash) so it works correctly
 * across Vercel serverless instances.
 */
export async function checkAdminRateLimit(
  identifier: string,
  maxRequests = 100,
  windowSeconds = 60,
): Promise<boolean> {
  try {
    const { rateLimit } = await import("@/lib/ratelimit");
    const { allowed } = await rateLimit(
      `admin:${identifier}`,
      maxRequests,
      windowSeconds * 1000,
    );
    return allowed;
  } catch {
    return true; // Fail open — don't block admins if rate limiter errors
  }
}

export async function logAdminAction(
  userId: string,
  action: string,
  resource: string,
  metadata?: Record<string, any>,
): Promise<void> {
  try {
    const supabase = require("@supabase/supabase-js").createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    await supabase.from("admin_audit_log").insert({
      user_id: userId,
      action,
      resource,
      metadata: JSON.stringify(metadata || {}),
      created_at: new Date().toISOString(),
      ip_address: metadata?.ipAddress || "unknown",
    });
  } catch (err) {
    console.error("[AUDIT] Failed to log admin action:", err);
  }
}

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function validateCsrfToken(
  token: string | null,
  sessionToken: string,
): boolean {
  if (!token || !sessionToken) return false;
  return token === sessionToken;
}
