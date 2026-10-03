/* global self, caches, fetch, Response, URL */

const CACHE_NAME = "nazm-shell-v4";
const SHELL_URLS = ["/offline", "/favicon.svg", "/manifest.webmanifest", "/icons/icon-192.svg", "/icons/icon-512.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Only static, content-addressed assets and icons: API and RSC responses hold a signed-in user's data and would
// outlive logout in the cache.
// /fonts/ holds the self-hosted Persian font: without it an offline Persian page falls back to a system face.
const STATIC_PATHS = [/^\/_next\/static\//, /^\/icons\//, /^\/fonts\//, /^\/favicon\./, /^\/manifest\.webmanifest$/];
function cacheable(request, response) {
  const url = new URL(request.url);
  if (!response.ok || url.searchParams.has("_rsc") || request.headers.get("rsc")) return false;
  const sameOrigin = !self.location || url.origin === self.location.origin;
  return sameOrigin && STATIC_PATHS.some((pattern) => pattern.test(url.pathname));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (request.mode === "navigate" || !cacheable(request, response)) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(async () => {
        if (request.mode === "navigate") {
          return caches.match("/offline");
        }
        return (await caches.match(request)) ?? Response.error();
      })
  );
});
