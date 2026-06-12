const fs = require("fs");
const path = require("path");

const root = process.cwd();
const publicDir = path.join(root, "public");
const iconsDir = path.join(publicDir, "icons");
fs.mkdirSync(iconsDir, { recursive: true });

function writeIconSvg(size) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="url(#g)"/>
  <circle cx="${size/2}" cy="${Math.round(size*0.42)}" r="${Math.round(size*0.18)}" fill="white" opacity="0.96"/>
  <rect x="${Math.round(size*0.26)}" y="${Math.round(size*0.52)}" width="${Math.round(size*0.48)}" height="${Math.round(size*0.25)}" rx="${Math.round(size*0.08)}" fill="white" opacity="0.96"/>
  <circle cx="${Math.round(size*0.42)}" cy="${Math.round(size*0.62)}" r="${Math.round(size*0.035)}" fill="#2563eb"/>
  <circle cx="${Math.round(size*0.58)}" cy="${Math.round(size*0.62)}" r="${Math.round(size*0.035)}" fill="#2563eb"/>
  <path d="M ${Math.round(size*0.38)} ${Math.round(size*0.70)} Q ${Math.round(size*0.50)} ${Math.round(size*0.76)} ${Math.round(size*0.62)} ${Math.round(size*0.70)}" stroke="#2563eb" stroke-width="${Math.max(3, Math.round(size*0.018))}" fill="none" stroke-linecap="round"/>
</svg>`;
  fs.writeFileSync(path.join(iconsDir, `smartwork-icon-${size}.svg`), svg);
}

writeIconSvg(192);
writeIconSvg(512);

const manifest = {
  name: "SmartWork Agent",
  short_name: "SmartWork",
  description: "AI work automation assistant for request, progress, and proof delivery.",
  id: "/",
  start_url: "/home.html",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#f8fafc",
  theme_color: "#2563eb",
  categories: ["productivity", "education", "utilities"],
  lang: "id-ID",
  icons: [
    {
      src: "/icons/smartwork-icon-192.svg",
      sizes: "192x192",
      type: "image/svg+xml",
      purpose: "any maskable"
    },
    {
      src: "/icons/smartwork-icon-512.svg",
      sizes: "512x512",
      type: "image/svg+xml",
      purpose: "any maskable"
    }
  ]
};

fs.writeFileSync(path.join(publicDir, "manifest.webmanifest"), JSON.stringify(manifest, null, 2));

const sw = `const SMARTWORK_CACHE = "smartwork-agent-pwa-v5ze";
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
`;
fs.writeFileSync(path.join(publicDir, "sw.js"), sw);

const htmlFiles = fs.readdirSync(publicDir).filter((name) => name.endsWith(".html"));
const pwaHead = `
  <link rel="manifest" href="/manifest.webmanifest">
  <meta name="theme-color" content="#2563eb">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="SmartWork">
  <link rel="apple-touch-icon" href="/icons/smartwork-icon-192.svg">
`;

const swScript = `
<script id="smartwork-pwa-register-v5ze">
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[SmartWork PWA] service worker registration failed", err);
      });
    });
  }
</script>
`;

for (const name of htmlFiles) {
  const file = path.join(publicDir, name);
  let html = fs.readFileSync(file, "utf8");

  if (!html.includes("manifest.webmanifest")) {
    html = html.replace(/<\/head>/i, `${pwaHead}\n</head>`);
  }

  if (!html.includes("smartwork-pwa-register-v5ze")) {
    html = html.replace(/<\/body>/i, `${swScript}\n</body>`);
  }

  fs.writeFileSync(file, html);
}

console.log(JSON.stringify({
  ok: true,
  phase: "5ZE",
  manifest: "public/manifest.webmanifest",
  serviceWorker: "public/sw.js",
  icons: [
    "public/icons/smartwork-icon-192.svg",
    "public/icons/smartwork-icon-512.svg"
  ],
  htmlPatched: htmlFiles
}, null, 2));
