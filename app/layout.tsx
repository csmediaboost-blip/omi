// app/layout.tsx — FIXED
// Changes from previous version:
// 1. Removed duplicate pwa-install-prompt import (was conflicting with PWAInstallBanner)
// 2. Only PWAInstallBanner remains (the unified component)
// 3. globals.css import is at the top where it belongs

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";
import SupportChat from "@/components/SupportChat";

import { RootProviders } from "./providers";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import MobileBottomNav from "@/components/mobile-bottom-nav";
import RealtimeWrapper from "@/components/RealtimeWrapper";

// ── globals.css MUST be imported here — this loads Tailwind for the whole app
import "./globals.css";

// ─────────────────────────────────────────────────────────────
// Fonts
// ─────────────────────────────────────────────────────────────
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const DOMAIN = "https://omnitaskpro.online";

// ─────────────────────────────────────────────────────────────
// Viewport
// ─────────────────────────────────────────────────────────────
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#10b981",
};

// ─────────────────────────────────────────────────────────────
// Metadata
// ─────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  metadataBase: new URL(DOMAIN),

  title: {
    default:
      "OmniTask Pro — Distributed GPU Computing & AI Investment Platform",
    template: "%s | OmniTask Pro",
  },

  description:
    "OmniTask Pro is a globally regulated GPU computing investment platform. Earn daily returns from enterprise AI workloads. 12,400+ active GPU nodes. 180+ enterprise clients. Join 9,800+ verified investors worldwide.",

  keywords: [
    "GPU computing investment",
    "AI infrastructure investment",
    "GPU node investment",
    "passive income AI",
    "GPU rental income",
    "distributed computing platform",
    "omnitask pro",
    "omnitaskpro",
  ],

  authors: [{ name: "OmniTask Pro Ltd.", url: DOMAIN }],
  creator: "OmniTask Pro Ltd.",
  publisher: "OmniTask Pro Ltd.",

  alternates: { canonical: "/" },

  openGraph: {
    type: "website",
    url: DOMAIN,
    siteName: "OmniTask Pro",
    title: "OmniTask Pro — GPU Computing Investment Platform",
    description: "Earn daily returns from enterprise AI GPU workloads.",
    images: [{ url: `${DOMAIN}/og-image.png`, width: 1200, height: 630 }],
  },

  twitter: {
    card: "summary_large_image",
    title: "OmniTask Pro — GPU Computing Investment Platform",
    description: "Earn daily returns from enterprise AI GPU workloads.",
    images: [`${DOMAIN}/og-image.png`],
  },

  robots: { index: true, follow: true },

  verification: {
    google: "REPLACE_WITH_YOUR_GOOGLE_SEARCH_CONSOLE_VERIFICATION_CODE",
  },

  icons: {
    icon: "/favicon.ico",
    apple: "/logo-main.png",
  },

  manifest: "/manifest.json",
  applicationName: "OmniTask Pro",

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OmniTask Pro",
  },

  formatDetection: { email: false, address: false, telephone: false },
};

// ─────────────────────────────────────────────────────────────
// JSON-LD Structured Data
// ─────────────────────────────────────────────────────────────
const jsonLdOrganization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "OmniTask Pro Ltd.",
  url: DOMAIN,
  logo: `${DOMAIN}/logo.png`,
  description: "Distributed GPU computing investment platform",
  foundingDate: "2024",
  address: {
    "@type": "PostalAddress",
    addressLocality: "London",
    addressCountry: "GB",
  },
};

const jsonLdWebsite = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "OmniTask Pro",
  url: DOMAIN,
};

// ─────────────────────────────────────────────────────────────
// Root Layout
// ─────────────────────────────────────────────────────────────
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#10b981" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="geo.region" content="GB" />
        <meta name="geo.placename" content="London" />

        {/* JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLdOrganization),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebsite) }}
        />
      </head>

      <body className="antialiased">
        <RootProviders>
          <RealtimeWrapper>{children}</RealtimeWrapper>
          <MobileBottomNav />
        </RootProviders>

        {/* Single unified PWA banner — handles both install + notifications */}
        <PWAInstallBanner />
        
        {/* Support chat widget — appears on every page */}
        <SupportChat />
        
        <Toaster richColors position="top-center" />
        <Analytics />
      </body>
    </html>     
  );
}
