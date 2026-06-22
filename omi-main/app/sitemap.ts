// app/sitemap.ts — Auto-generates XML sitemap for Google
// Accessible at https://omnitaskpro.online/sitemap.xml

import { MetadataRoute } from "next";

const DOMAIN = "https://omnitaskpro.online";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    // ── Core pages ────────────────────────────────────────────────────────────
    {
      url: DOMAIN,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${DOMAIN}/auth/signup`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${DOMAIN}/auth/signin`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // ── Dashboard ────────────────────────────────────────────────────────────
    {
      url: `${DOMAIN}/dashboard`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${DOMAIN}/dashboard/gpu-plans`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${DOMAIN}/dashboard/financials`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${DOMAIN}/dashboard/tasks`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${DOMAIN}/dashboard/company-disclosure`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${DOMAIN}/dashboard/verification`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${DOMAIN}/dashboard/referrals`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    // ── Legal & Info ─────────────────────────────────────────────────────────
    {
      url: `${DOMAIN}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${DOMAIN}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${DOMAIN}/contributor-agreement`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${DOMAIN}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${DOMAIN}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${DOMAIN}/company-disclosure`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
