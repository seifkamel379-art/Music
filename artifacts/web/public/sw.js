/* music&sk Service Worker — background audio + cache */
const CACHE = "musicsk-v2";
const PRECACHE = ["/", "/index.html", "/manifest.json", "/logo.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  /* Always network-first for API calls and audio streams */
  if (url.pathname.startsWith("/api/") || url.searchParams.has("v")) {
    e.respondWith(fetch(e.request).catch(() => new Response("", { status: 503 })));
    return;
  }

  /* Cache-first for static assets */
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((resp) => {
        if (!resp || resp.status !== 200 || resp.type === "opaque") return resp;
        const clone = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return resp;
      }).catch(() => {
        /* SPA fallback */
        if (e.request.mode === "navigate") return caches.match("/index.html");
        return new Response("", { status: 503 });
      });
    })
  );
});
