// PWA service worker: network-first for everything (always fresh code when online),
// cache only as an offline fallback. Bump CACHE to invalidate old caches.
const CACHE = "fittin-v3";
const OFFLINE_FALLBACK = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_FALLBACK, "/"])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // skip Supabase/Stripe/3rd-party

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && (request.mode === "navigate" || /\.(?:css|js|png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request).then((r) => r || caches.match(OFFLINE_FALLBACK)))
  );
});
