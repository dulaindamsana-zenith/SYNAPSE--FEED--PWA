/* ============================================================
   sw.js - Synapse Service Worker
   Strategy: Cache-First for all static assets.
   Network-First for external requests (fonts, etc).
   Offline fallback served from cache on navigation.
   ============================================================ */
"use strict";

const CACHE_VERSION = "synapse-v1";
const OFFLINE_URL   = "./index.html";

const PRECACHE_ASSETS = [
  "./index.html",
  "./app.js",
  "./data.js",
  "./db.js",
  "./styles.css",
  "./manifest.json",
];

/* ---------- Install: precache all static assets ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

/* ---------- Activate: prune old caches ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ---------- Fetch: Cache-First with network fallback ---------- */
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests (CDN, external APIs)
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  if (url.origin !== location.origin && !url.hostname.endsWith("googleapis.com") && !url.hostname.endsWith("gstatic.com")) return;

  // Google Fonts: Network-First so we get updates, fallback to cache
  if (url.hostname.endsWith("googleapis.com") || url.hostname.endsWith("gstatic.com")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Navigation requests: Cache-First, offline fallback to index.html
  if (request.mode === "navigate") {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((response) => {
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
              return response;
            })
            .catch(() => caches.match(OFFLINE_URL))
      )
    );
    return;
  }

  // All other same-origin assets: Cache-First
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          // Only cache successful same-origin responses
          if (response.ok && url.origin === location.origin) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
    )
  );
});

/* ---------- Background Sync placeholder ----------
   The SRS review queue already persists to IndexedDB; a real
   backend sync would post queued reviews here. Wired up but
   intentionally a no-op until a server exists.
--------------------------------------------------------- */
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-srs-reviews") {
    event.waitUntil(
      self.clients
        .matchAll()
        .then((clients) =>
          clients.forEach((client) =>
            client.postMessage({ type: "SW_SYNC_REQUEST", tag: "sync-srs-reviews" })
          )
        )
    );
  }
});

/* ---------- Push notification handler (skeleton) ---------- */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { payload = { title: "Synapse", body: event.data.text() }; }
  event.waitUntil(
    self.registration.showNotification(payload.title || "Synapse", {
      body: payload.body || "You have new ideas waiting.",
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-96.png",
      tag: payload.tag || "synapse-default",
      data: { url: payload.url || "./index.html#/home" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "./index.html#/home";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes("index.html") || c.url.endsWith("/"));
        if (existing) return existing.focus().then((c) => c.navigate(targetUrl));
        return self.clients.openWindow(targetUrl);
      })
  );
});
