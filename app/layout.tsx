export const revalidate = false; // Never cache root layout - always fresh for auth
export const dynamic = "auto"; // Let Next.js decide based on content

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";
import SupportChat from "@/components/SupportChat";

import { RootProviders } from "./providers";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import MobileBottomNav from "@/components/mobile-bottom-nav";
import RealtimeWrapper from "@/components/RealtimeWrapper";
import { PWAProvider } from "@/hooks/usePWAInstall";

// ── globals.css MUST be imported here — this loads Tailwind for the whole app
import "./globals.css";

// ─────────────────────────────────────────────────────────────
// Fonts
// ─────────────────────────────────────────────────────────────
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
  preload: true,
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
  preload: true,
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
    icon: "/favicon-rounded.png",
    apple: "/favicon-rounded.png",
    shortcut: "/favicon-rounded.png",
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
      className={`bg-background scroll-smooth ${geistSans.variable} ${geistMono.variable}`}
      lang="en"
    >
      <head>
        {/* Preload critical fonts */}
        <link
          rel="preload"
          href={geistSans.src || "/"}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* Prevent FOUC - force layout immediately with critical CSS */}
        <style dangerouslySetInnerHTML={{__html: `
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html { 
            width: 100%; 
            height: 100%;
            background-color: #030712;
            font-family: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif;
          }
          body { 
            width: 100%;
            height: 100%;
            background-color: #030712;
            color: #e2e8f0;
            line-height: 1.5;
            font-weight: 400;
          }
          html.light { background-color: #f1f5f9; color: #1e293b; }
          /* Prevent layout shift during font load */
          @font-face {
            font-family: var(--font-geist-sans);
            src: url(${geistSans.src || ""}) format('woff2');
            font-display: swap;
          }
        `}} />
      </head>
      <body className="antialiased">
        <PWAProvider>
          <RootProviders>
            {children}
            <PWAInstallBanner />
            <Toaster />
            <SupportChat />
            <RealtimeWrapper>
              <MobileBottomNav />
            </RealtimeWrapper>
          </RootProviders>
          <Analytics />
        </PWAProvider>
      </body>
    </html>
  );
}
