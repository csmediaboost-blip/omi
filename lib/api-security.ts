/**
 * API Security Utilities
 * - Admin authentication check
 * - Rate limiting
 * - CSRF token validation
 * - Request logging
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Verify user is authenticated and has admin role
 */
export async function requireAdminAuth(req: NextRequest): Promise<{ userId: string } | Response> {
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
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from("users")
      .select("is_admin, role")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin && profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    return { userId: user.id };
  } catch (error: any) {
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 401 }
    );
  }
}

/**
 * Simple in-memory rate limiter for admin endpoints
 * Stores: { [key]: { count, resetAt } }
 */
const adminRateLimits = new Map<string, { count: number; resetAt: number }>();

export function checkAdminRateLimit(identifier: string, maxRequests = 100, windowSeconds = 60): boolean {
  const now = Date.now();
  const key = `admin:${identifier}`;
  const entry = adminRateLimits.get(key);

  if (!entry || now > entry.resetAt) {
    adminRateLimits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Log admin actions for audit trail
 */
export async function logAdminAction(
  userId: string,
  action: string,
  resource: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    const supabase = require("@supabase/supabase-js").createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
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
    // Don't fail the request if logging fails
  }
}

/**
 * Get client IP address from request
 */
export function getClientIp(req: NextRequest): string {
  return (
    (req.headers.get("x-forwarded-for")?.split(",")[0] || 
    req.headers.get("x-real-ip") || 
    "unknown").trim()
  );
}

/**
 * Validate CSRF token (if needed)
 */
export function validateCsrfToken(token: string | null, sessionToken: string): boolean {
  if (!token || !sessionToken) return false;
  // CSRF token should match session
  return token === sessionToken;
}
