// public/sw.js
// Service Worker — stale-while-revalidate strategy for instant loading

const CACHE_NAME = "omnitaskpro-v2";
const STALE_CACHE = "omnitaskpro-stale";

// Files to cache for offline use
const CACHE_FILES = ["/", "/manifest.json", "/favicon.ico"];

// ── Install: cache core files ──────────────────────────────────────────────
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

// ── Activate: clean old caches ─────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STALE_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

// ── Fetch: stale-while-revalidate strategy ────────────────────────────────
self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  
  // Never cache API or auth requests - always network-first
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(() => new Response("Offline", { status: 503 }))
    );
    return;
  }

  // Stale-while-revalidate: return cached immediately, update in background
  event.respondWith(
    caches.match(event.request).then((cached) => {
      // Return cached response immediately (stale)
      const fetchPromise = fetch(event.request).then((response) => {
        // Cache successful fresh responses
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
        }
        return response;
      }).catch(() => {
        // Offline: return stale cache or error
        return cached || new Response("Offline — check your connection.", { status: 503 });
      });

      // Return cached content immediately if available
      return cached || fetchPromise;
    }),
  );
});

// ── Push notifications ─────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = { title: "OmniTask Pro", body: "You have a new notification." };
  try {
    data = event.data.json();
  } catch {
    data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "OmniTask Pro", {
      body: data.body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-72x72.png",
      vibrate: [200, 100, 200],
      data: { url: data.url || "/" },
      actions: [
        { action: "open", title: "Open App" },
        { action: "dismiss", title: "Dismiss" },
      ],
    }),
  );
});

// ── Notification click ─────────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "dismiss") return;

  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if open
        for (const client of clientList) {
          if (
            client.url.includes(self.registration.scope) &&
            "focus" in client
          ) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) return clients.openWindow(url);
      }),
  );
});
