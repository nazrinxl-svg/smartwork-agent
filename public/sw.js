const SMARTWORK_CACHE = "smartwork-agent-pwa-v5ze";
const APP_SHELL = [
  "/",
  "/index.html",
  "/home.html",
  "/request.html",
  "/history.html",
  "/progress.html",
  "/profile.html",
  "/manifest.webmanifest",
  "/icons/smartwork-icon-192.svg",
  "/icons/smartwork-icon-512.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SMARTWORK_CACHE).then((cache) => cache.addAll(APP_SHELL.filter(Boolean))).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== SMARTWORK_CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.hostname === "103.152.242.193") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(SMARTWORK_CACHE).then((cache) => cache.put(request, copy)).catch(() => null);
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/home.html")))
  );
});
