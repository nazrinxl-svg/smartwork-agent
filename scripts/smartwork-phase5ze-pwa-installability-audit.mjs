import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium, devices } from "playwright";

const root = process.cwd();
const publicDir = path.join(root, "public");
const appPort = Number(process.env.SMARTWORK_5ZE_PORT || 5217);
const appBase = `http://127.0.0.1:${appPort}`;
const checkpointDir = path.join(root, "docs", "checkpoints");
const checkpoint = path.join(checkpointDir, "smartwork-phase5ze-pwa-installability-report.json");
const shotsDir = path.join(root, "shots");

fs.mkdirSync(checkpointDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

function typeOf(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", appBase);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/home.html";
      let filePath = path.join(publicDir, path.normalize(pathname).replace(/^(\.\.[/\\])+/, ""));
      if (!filePath.startsWith(publicDir)) {
        res.writeHead(403); res.end("Forbidden"); return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(publicDir, "home.html");
      }
      if (!fs.existsSync(filePath)) {
        res.writeHead(404); res.end("Not found"); return;
      }
      res.writeHead(200, { "Content-Type": typeOf(filePath), "Cache-Control": "no-store" });
      res.end(fs.readFileSync(filePath));
    } catch (err) {
      res.writeHead(500); res.end(String(err?.stack || err));
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(appPort, "127.0.0.1", () => resolve(server));
  });
}

let server;
let browser;

try {
  server = await startStaticServer();
  browser = await chromium.launch({ headless: true });

  const context = await browser.newContext({ ...devices["iPhone 13"] });
  const page = await context.newPage();
  const consoleLines = [];
  page.on("console", (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto(`${appBase}/home.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const audit = await page.evaluate(async () => {
    const manifestLink = document.querySelector('link[rel="manifest"]')?.getAttribute("href") || "";
    const themeColor = document.querySelector('meta[name="theme-color"]')?.getAttribute("content") || "";
    const mobileCapable = document.querySelector('meta[name="mobile-web-app-capable"]')?.getAttribute("content") || "";
    const appleCapable = document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content") || "";

    let manifest = null;
    let manifestOk = false;
    if (manifestLink) {
      const res = await fetch(manifestLink);
      manifestOk = res.ok;
      manifest = await res.json();
    }

    let swReady = false;
    let swController = false;
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      swReady = Boolean(reg);
      swController = Boolean(navigator.serviceWorker.controller);
    }

    return {
      manifestLink,
      themeColor,
      mobileCapable,
      appleCapable,
      manifestOk,
      manifest,
      swReady,
      swController
    };
  });

  await page.screenshot({
    path: path.join(shotsDir, "smartwork-phase5ze-pwa-home.png"),
    fullPage: true
  });

  const manifest = audit.manifest || {};
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];

  const checks = {
    hasManifestLink: Boolean(audit.manifestLink),
    manifestFetchOk: audit.manifestOk === true,
    hasName: Boolean(manifest.name),
    hasShortName: Boolean(manifest.short_name),
    hasStartUrl: Boolean(manifest.start_url),
    displayStandalone: manifest.display === "standalone",
    hasThemeColor: Boolean(audit.themeColor || manifest.theme_color),
    has192Icon: icons.some((icon) => String(icon.sizes || "").includes("192")),
    has512Icon: icons.some((icon) => String(icon.sizes || "").includes("512")),
    serviceWorkerReady: audit.swReady === true,
    screenshotReady: fs.existsSync(path.join(shotsDir, "smartwork-phase5ze-pwa-home.png"))
  };

  const report = {
    ok: Object.values(checks).every(Boolean),
    phase: "5ZE",
    releaseDecision: "PWA_INSTALLABILITY_PACK_READY",
    appBase,
    checks,
    audit,
    screenshots: {
      home: "shots/smartwork-phase5ze-pwa-home.png"
    },
    consoleLines,
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(checkpoint, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    ok: report.ok,
    phase: report.phase,
    releaseDecision: report.releaseDecision,
    checks,
    checkpoint: path.relative(root, checkpoint).replaceAll("\\", "/")
  }, null, 2));

  if (!report.ok) process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
}
