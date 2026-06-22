// app/robots.ts — Tells Google/Bing/all crawlers what to index
import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/auth/verify-pin",
          "/auth/set-pin",
          "/auth/update-password",
          "/_next/",
        ],
      },
      {
        // Allow Google specifically to crawl everything public
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
    ],
    sitemap: "https://omnitaskpro.online/sitemap.xml",
    host: "https://omnitaskpro.online",
  };
}
