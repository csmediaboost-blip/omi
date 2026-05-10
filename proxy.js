// proxy.js  (Next.js middleware — plain JavaScript, no TypeScript)
//
// FIXES:
// 1. Removed "import type { NextRequest }" — that is TypeScript-only syntax.
//    proxy.js is a .js file so it cannot use "import type {}".
// 2. Replaced getUser() with getSession() — getUser() makes a live network
//    call to Supabase on every page load, adding 500ms–2s of latency.
//    getSession() reads from the cookie instantly with zero network calls.

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
// ✅ No "import type" — this is plain JS

const PUBLIC_ROUTES = [
  "/auth/signin",
  "/auth/signup",
  "/auth/reset-password",
  "/auth/update-password",
  "/auth/callback",
  "/auth/set-pin",
  "/auth/reset-pin",
];

const PIN_COOKIE = "pin_verified";

export default async function middleware(req) {
  const res = NextResponse.next();
  const pathname = req.nextUrl.pathname;

  // ── Security headers ─────────────────────────────────────────
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https: wss:;",
  );

  // ── Skip static assets and API routes ────────────────────────
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return res;
  }

  // ── Allow public routes without any auth check ───────────────
  if (pathname === "/" || PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return res;
  }

  // ── SSR Supabase client (reads cookies, no network) ──────────
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) =>
          res.cookies.set({ name, value, ...options }),
        remove: (name, options) =>
          res.cookies.set({ name, value: "", ...options }),
      },
    },
  );

  // ── FAST: getSession() reads JWT from cookie — zero network ──
  // Old code used getUser() which hit Supabase auth server on every
  // page navigation — that was causing 500ms–2s slowdown on every load.
  let session = null;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    session = null;
  }

  // ── Not logged in → redirect to signin ───────────────────────
  if (!session?.user) {
    const signinUrl = new URL("/auth/signin", req.url);
    signinUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(signinUrl);
  }

  const user = session.user;

  // ── PIN verification ─────────────────────────────────────────
  const pinCookie = req.cookies.get(PIN_COOKIE)?.value;
  const pinVerified = pinCookie === user.id;

  if (pathname.startsWith("/auth/verify-pin")) {
    if (pinVerified)
      return NextResponse.redirect(new URL("/dashboard", req.url));
    return res;
  }

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
    if (!pinVerified)
      return NextResponse.redirect(new URL("/auth/verify-pin", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2)$).*)",
  ],
};
