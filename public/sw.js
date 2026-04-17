// public/sw.js
// Service Worker — required for PWA installation and push notifications
// Place this file at: public/sw.js

const CACHE_NAME = "omnitaskpro-v1";

// Files to cache for offline use
const CACHE_FILES = ["/", "/manifest.json", "/favicon.ico"];

// ── Install: cache core files ──────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CACHE_FILES).catch((err) => {
        console.warn("SW: Failed to cache some files:", err);
      });
    }),
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ─────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

// ── Fetch: network-first strategy ─────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  // Don't intercept API or auth requests
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(event.request).then((cached) => {
          return (
            cached ||
            new Response("Offline — please check your connection.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        });
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
