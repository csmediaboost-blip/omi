/** @type {import('next').NextConfig} */

const nextConfig = {
  // TypeScript errors must NOT be silenced — they often surface real runtime crashes
  typescript: {
    ignoreBuildErrors: false,
  },

  images: {
    unoptimized: false,
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  compress: true,
  reactStrictMode: true,

  headers: async () => {
    return [
      // ── Security headers on every route ──────────────────────────────────
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            // Tighten or relax connect-src to match your actual third-party services.
            // Remove 'unsafe-eval' once your bundler/framework no longer requires it.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.korapay.com https://api.stripe.com",
              "frame-src 'none'",
              "object-src 'none'",
            ].join("; "),
          },
        ],
      },

      // ── Authenticated app routes — never cached by CDN ───────────────────
      {
        source:
          "/(dashboard|admin|portfolio|referrals|kyc|withdraw|settings|academy|support)(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, private",
          },
        ],
      },

      // ── API routes — never cached ─────────────────────────────────────────
      {
        source: "/api/(.*)",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },

      // ── Next.js static assets — long-lived, content-addressed ────────────
      {
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },

      // ── Public static files (images, fonts, icons, manifests) ────────────
      {
        source: "/(.*\\.(?:png|jpg|jpeg|gif|webp|ico|svg|woff|woff2|ttf|otf))",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=3600",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
