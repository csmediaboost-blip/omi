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

const PIN_COOKIE = "pin_verified";

export default async function middleware(req) {
  const res = NextResponse.next();
  const pathname = req.nextUrl.pathname;

  // ── UPDATED SECURITY HEADERS ────────────────────────────────────
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );

  // Relaxed CSP to allow Supabase and external connections
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

  // ✅ New Supabase client (SSR)
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

  // ✅ Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ❌ Not logged in → redirect to signin
  if (!user) {
    return NextResponse.redirect(new URL("/auth/signin", req.url));
  }

  // ✅ Check PIN cookie — must equal user ID
  const pinCookie = req.cookies.get(PIN_COOKIE)?.value;
  const pinVerified = pinCookie === user.id;

  // On verify-pin page
  if (pathname.startsWith("/auth/verify-pin")) {
    if (pinVerified) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return res;
  }

  // Protected routes — need PIN verified
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
    if (!pinVerified) {
      return NextResponse.redirect(new URL("/auth/verify-pin", req.url));
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
