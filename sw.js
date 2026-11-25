/* Omniscribe service worker: network-first for the app shell with a cache fallback.
   An online load always gets fresh files, so a deploy never serves stale or mixed-version modules; an offline
   load falls back to the cache. `npm run bundle` stamps VERSION with a content hash and PRECACHE with every
   shipped file, so a new build gets a new cache and the old one is deleted. */
const VERSION = "dev";
const CACHE = `omniscribe-${VERSION}`;
const PRECACHE = ["./", "index.html", "manifest.webmanifest", "favicon.svg", "src/main.js", "src/styles.css"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("omniscribe-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }

        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((cached) => cached || (request.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
