// middleware.ts  (replace your existing file with this)
// ─────────────────────────────────────────────────────────────────────────────
// Changes from your original:
//   1. After PIN check, fetches the user's role from public.users
//   2. /admin routes → requires role = 'admin', otherwise → /dashboard
//   3. Everything else is identical to your original
// ─────────────────────────────────────────────────────────────────────────────

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

const PUBLIC_ROUTES = [
  "/auth/signin",
  "/auth/signup",
  "/auth/reset-password",
  "/auth/update-password",
  "/auth/callback",
  "/auth/set-pin",
  "/auth/reset-pin",
];

// ── Add every admin email here as a backup safety net ──────────────────────
// These are checked in addition to the role column.
// Even if someone edits the DB, they still need to be logged in as one
// of these emails to access /admin.
const ADMIN_EMAILS = [
  "princemercy329@gmail.com", // your primary admin
  // "backup1@gmail.com",       // uncomment and add your backup emails
  // "backup2@gmail.com",
  // "backup3@gmail.com",
  // "backup4@gmail.com",
];

const PIN_COOKIE = "pin_verified";

export default async function middleware(req) {
  const res = NextResponse.next();
  const pathname = req.nextUrl.pathname;

  // ── Security headers ────────────────────────────────────────────────────
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:;",
  );

  // Skip static files and API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return res;
  }

  // Allow homepage and public routes
  if (pathname === "/" || PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return res;
  }

  // ── Supabase SSR client ─────────────────────────────────────────────────
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => {
          res.cookies.set({ name, value, ...options });
        },
        remove: (name, options) => {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  // ── Auth check ──────────────────────────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not logged in → signin
  if (!user) {
    return NextResponse.redirect(new URL("/auth/signin", req.url));
  }

  // ── PIN check ───────────────────────────────────────────────────────────
  const pinCookie = req.cookies.get(PIN_COOKIE)?.value;
  const pinVerified = pinCookie === user.id;

  if (pathname.startsWith("/auth/verify-pin")) {
    if (pinVerified) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return res;
  }

  // Dashboard + admin both need PIN
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
    if (!pinVerified) {
      return NextResponse.redirect(new URL("/auth/verify-pin", req.url));
    }
  }

  // ── Admin role check ────────────────────────────────────────────────────
  // Only runs for /admin routes — after PIN is verified
  if (pathname.startsWith("/admin")) {
    // Dual guard: check both the DB role column AND the email allowlist
    const { data: profile } = await supabase
      .from("users")
      .select("role, email")
      .eq("id", user.id)
      .single();

    const isAdminByRole = profile?.role === "admin";
    const isAdminByEmail = ADMIN_EMAILS.includes(
      profile?.email ?? user.email ?? "",
    );

    // Must pass BOTH checks
    if (!isAdminByRole || !isAdminByEmail) {
      // Not an admin — send them to their dashboard silently
      // Do NOT show an error page that reveals /admin exists
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
