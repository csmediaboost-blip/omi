// middleware.ts
// Replace your existing middleware.ts with this entire file.
//
// WHAT WAS BROKEN:
//   - After PIN verify, it always redirected to /dashboard — never back to /admin
//   - Cookie set() only wrote to res, not req, so Supabase couldn't read
//     the session on the very same request, causing user = null → signin redirect
//
// WHAT IS FIXED:
//   - Cookie set/remove now writes to BOTH req and res (required for SSR)
//   - PIN redirect passes ?next= so after PIN you land on /admin not /dashboard
//   - verify-pin page reads ?next= and redirects there after success
//   - Admin check: role column = 'admin' AND email in ADMIN_EMAILS allowlist

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ── Public routes (no auth required) ───────────────────────────────────────
const PUBLIC_ROUTES = [
  "/auth/signin",
  "/auth/signup",
  "/auth/reset-password",
  "/auth/update-password",
  "/auth/callback",
  "/auth/set-pin",
  "/auth/reset-pin",
];

// ── Admin email allowlist — add your backup emails here ─────────────────────
const ADMIN_EMAILS = [
  "princemercy329@gmail.com",
  // "your-backup2@gmail.com",
  // "your-backup3@gmail.com",
  // "your-backup4@gmail.com",
];

const PIN_COOKIE = "pin_verified";

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.nextUrl.origin;

  // ── Skip static files and API routes ────────────────────────────────────
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // ── Build response so we can attach cookies and headers ─────────────────
  const res = NextResponse.next();

  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:;"
  );

  // ── Allow homepage and all public routes ─────────────────────────────────
  if (pathname === "/" || PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return res;
  }

  // ── Supabase SSR client ──────────────────────────────────────────────────
  // IMPORTANT: cookie set() must write to BOTH req AND res.
  // If you only write to res, the auth session cannot be read on this
  // same request, which causes getUser() to return null → signin redirect.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return req.cookies.get(name)?.value;
        },
        set(name, value, options) {
          req.cookies.set({ name, value, ...options });   // ← write to req
          res.cookies.set({ name, value, ...options });   // ← write to res
        },
        remove(name, options) {
          req.cookies.set({ name, value: "", ...options });
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  // ── Get authenticated user ───────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in → redirect to signin, remember intended destination
  if (!user) {
    const to = new URL("/auth/signin", origin);
    to.searchParams.set("next", pathname);
    return NextResponse.redirect(to);
  }

  // ── PIN verification check ───────────────────────────────────────────────
  const pinCookie  = req.cookies.get(PIN_COOKIE)?.value;
  const pinVerified = pinCookie === user.id;

  // User is on the verify-pin page
  if (pathname.startsWith("/auth/verify-pin")) {
    if (pinVerified) {
      // Already verified — send them to where they were going
      const next = req.nextUrl.searchParams.get("next") || "/dashboard";
      return NextResponse.redirect(new URL(next, origin));
    }
    return res; // let them see the PIN page
  }

  // /dashboard and /admin both require PIN
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
    if (!pinVerified) {
      // Pass ?next= so after PIN they land back on /admin (not /dashboard)
      const pinUrl = new URL("/auth/verify-pin", origin);
      pinUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(pinUrl);
    }
  }

  // ── Admin role check (only for /admin routes) ────────────────────────────
  if (pathname.startsWith("/admin")) {
    const { data: profile } = await supabase
      .from("users")
      .select("role, email")
      .eq("id", user.id)
      .single();

    const email        = (profile?.email ?? user.email ?? "").toLowerCase();
    const isAdminRole  = profile?.role === "admin";
    const isAdminEmail = ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email);

    if (!isAdminRole || !isAdminEmail) {
      // Not an admin — silently send to dashboard (don't reveal /admin exists)
      return NextResponse.redirect(new URL("/dashboard", origin));
    }

    // ✅ Confirmed admin — let them through
    return res;
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};