// public/sw.js
// Service Worker — stale-while-revalidate strategy for instant loading
//
// IMPORTANT: Bump CACHE_VERSION on every production deploy to bust stale caches.
// In CI/CD, run: sed -i "s/CACHE_VERSION = \"[^\"]*\"/CACHE_VERSION = \"$(date +%Y%m%d%H%M%S)\"/" public/sw.js

const CACHE_VERSION = "v3-20260527";
const CACHE_NAME = `omnitaskpro-${CACHE_VERSION}`;
const STALE_CACHE = `omnitaskpro-stale-${CACHE_VERSION}`;

const CACHE_FILES = ["/", "/manifest.json", "/favicon.ico"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CACHE_FILES).catch((err) => {
        console.warn("[SW] Failed to cache files:", err);
      });
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STALE_CACHE)
          .map((key) => {
            console.log("[SW] Deleting old cache:", key);
            return caches.delete(key);
          }),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Never cache API, auth, or authenticated app routes
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/admin/") ||
    url.pathname.startsWith("/dashboard/") ||
    url.pathname.startsWith("/portfolio/") ||
    url.pathname.startsWith("/withdraw/")
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() => new Response("Offline", { status: 503 }))
    );
    return;
  }

  // Static assets — cache first, revalidate in background
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|ico|svg|woff|woff2)$/)
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const networkFetch = fetch(event.request).then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  // Navigation — network first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          caches.open(STALE_CACHE).then((c) => c.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || new Response("Offline", { status: 503 });
      })
  );
});