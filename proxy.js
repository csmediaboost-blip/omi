// proxy.js  (this is your Next.js middleware file)
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

const ADMIN_EMAILS = [
  "princemercy329@gmail.com",
];

const PIN_COOKIE = "pin_verified";

export default async function middleware(req) {
  const { pathname } = req.nextUrl;
  const origin = req.nextUrl.origin;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const res = NextResponse.next();

  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https: wss:;"
  );

  if (pathname === "/" || PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return res;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return req.cookies.get(name)?.value;
        },
        set(name, value, options) {
          req.cookies.set({ name, value, ...options });
          res.cookies.set({ name, value, ...options });
        },
        remove(name, options) {
          req.cookies.set({ name, value: "", ...options });
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const to = new URL("/auth/signin", origin);
    to.searchParams.set("next", pathname);
    return NextResponse.redirect(to);
  }

  const pinCookie = req.cookies.get(PIN_COOKIE)?.value;
  const pinVerified = pinCookie === user.id;

  if (pathname.startsWith("/auth/verify-pin")) {
    if (pinVerified) {
      const next = req.nextUrl.searchParams.get("next") || "/dashboard";
      return NextResponse.redirect(new URL(next, origin));
    }
    return res;
  }

  if (pathname.startsWith("/dashboard") || pathname.startsWith("/admin")) {
    if (!pinVerified) {
      const pinUrl = new URL("/auth/verify-pin", origin);
      pinUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(pinUrl);
    }
  }

  if (pathname.startsWith("/admin")) {
    const { data: profile } = await supabase
      .from("users")
      .select("role, email")
      .eq("id", user.id)
      .single();

    const email = (profile?.email ?? user.email ?? "").toLowerCase();
    const isAdminRole = profile?.role === "admin";
    const isAdminEmail = ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email);

    if (!isAdminRole || !isAdminEmail) {
      return NextResponse.redirect(new URL("/dashboard", origin));
    }

    return res;
  }

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};