import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const reportPath = path.join(root, "reports", "phase5g-runtime-progress-bridge-smoke-report.json");

const jobId = `phase5g-runtime-smoke-${Date.now()}`;
const now = new Date().toISOString();

const apiHits = [];
const consoleMessages = [];
const pageErrors = [];
const blockedExternal = [];

function walk(dir, out = []) {
  const skip = new Set(["node_modules", ".git", "reports", "backup-code", ".smartwork-browser", "browser-profile"]);
  if (!fs.existsSync(dir)) return out;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase() === "progress.html") {
      out.push(full);
    }
  }

  return out;
}

function findProgressHtml() {
  const candidates = walk(root);
  candidates.sort((a, b) => {
    const score = (file) => {
      const rel = path.relative(root, file).replaceAll("\\", "/");
      let s = 0;
      if (rel === "progress.html") s += 1000;
      if (/app\/progress\.html$/i.test(rel)) s += 800;
      if (/public\/progress\.html$/i.test(rel)) s += 700;
      if (/mobile\/progress\.html$/i.test(rel)) s += 650;
      if (/ui\/progress\.html$/i.test(rel)) s += 600;
      if (rel.includes("backup")) s -= 1000;
      return s;
    };

    return score(b) - score(a);
  });

  return candidates[0] || null;
}

const progressHtmlPath = findProgressHtml();
const progressDir = progressHtmlPath ? path.dirname(progressHtmlPath) : null;

const completedJob = {
  ok: true,
  job: {
    id: jobId,
    jobId,
    type: "smartwork.siaga.attendance",
    status: "completed",
    phase: "completed",
    state: "completed",
    progress: 100,
    percent: 100,
    progressPercent: 100,
    percentage: 100,
    message: "Phase 5G runtime smoke completed job",
    summary: {
      total: 6,
      completed: 6,
      alreadyFilled: 6,
      skipped: 0,
      needsPlan: 0,
      percent: 100,
      progress: 100
    },
    artifacts: {
      pdfReady: true,
      proofReady: true,
      appOnly: true
    },
    safety: {
      dryRun: true,
      noSiagaInput: true,
      noRealSaveSend: true,
      appProgressOnly: true
    },
    createdAt: now,
    updatedAt: now,
    completedAt: now
  }
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  if (filePath.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function safeResolve(base, urlPath) {
  if (!base) return null;
  const clean = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "");
  const resolved = path.resolve(base, clean);
  if (!resolved.startsWith(base)) return null;
  return resolved;
}

function resolveStaticFile(urlPath) {
  if (urlPath === "/" || urlPath === "/progress.html") return progressHtmlPath;

  const fromProgressDir = safeResolve(progressDir, urlPath);
  if (fromProgressDir && fs.existsSync(fromProgressDir) && fs.statSync(fromProgressDir).isFile()) {
    return fromProgressDir;
  }

  const fromRoot = safeResolve(root, urlPath);
  if (fromRoot && fs.existsSync(fromRoot) && fs.statSync(fromRoot).isFile()) {
    return fromRoot;
  }

  return null;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type"
    });
    res.end();
    return;
  }

  if (url.pathname === "/api/smartwork/jobs" && req.method === "POST") {
    apiHits.push({ method: req.method, path: url.pathname, at: new Date().toISOString() });
    sendJson(res, 200, completedJob);
    return;
  }

  if (url.pathname === `/api/smartwork/jobs/${jobId}` || url.pathname.startsWith("/api/smartwork/jobs/")) {
    apiHits.push({ method: req.method, path: url.pathname, at: new Date().toISOString() });
    sendJson(res, 200, completedJob);
    return;
  }

  const filePath = resolveStaticFile(url.pathname);
  if (!filePath) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Not found: ${url.pathname}`);
    return;
  }

  res.writeHead(200, {
    "content-type": contentType(filePath),
    "cache-control": "no-store"
  });
  fs.createReadStream(filePath).pipe(res);
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasCompleted100(value) {
  if (!value) return false;

  const text = typeof value === "string" ? value : JSON.stringify(value);
  const rawOk = text.includes("100") && /completed|complete|selesai|done|hasil_siap/i.test(text);

  let parsed = null;
  try {
    parsed = typeof value === "string" ? JSON.parse(value) : value;
  } catch {}

  const candidates = [];
  function collect(obj) {
    if (!obj || typeof obj !== "object") return;
    candidates.push(obj);
    for (const v of Object.values(obj)) collect(v);
  }
  collect(parsed);

  const objectOk = candidates.some((obj) => {
    const status = String(obj.status || obj.phase || obj.state || obj.statusText || "").toLowerCase();
    const percent = Number(obj.percent ?? obj.progress ?? obj.progressPercent ?? obj.percentage);
    return percent === 100 && /completed|complete|selesai|done|hasil_siap/.test(status);
  });

  return rawOk || objectOk;
}

let browser;

try {
  if (!progressHtmlPath) {
    throw new Error("No progress.html found in repo. Cannot run runtime bridge smoke.");
  }

  const serverAddress = await listen(server);
  const baseUrl = `http://127.0.0.1:${serverAddress.port}`;
  const progressUrl = `${baseUrl}/progress.html?jobId=${encodeURIComponent(jobId)}&phase=5g`;

  const { chromium } = await import("playwright");
  browser = await chromium.launch({ headless: true });

  const context = await browser.newContext();

  await context.addInitScript((seed) => {
    const requestPayload = {
      jobId: seed.jobId,
      id: seed.jobId,
      source: "phase5g-runtime-smoke",
      status: "completed",
      phase: "completed",
      state: "completed",
      progress: 100,
      percent: 100,
      progressPercent: 100,
      percentage: 100,
      updatedAt: new Date().toISOString()
    };

    const productionJobPayload = {
      ok: true,
      id: seed.jobId,
      jobId: seed.jobId,
      status: "completed",
      phase: "completed",
      state: "completed",
      progress: 100,
      percent: 100,
      progressPercent: 100,
      percentage: 100,
      source: "phase5g-runtime-smoke",
      job: {
        ...requestPayload,
        type: "smartwork.siaga.attendance",
        message: "Phase 5G runtime smoke completed job",
        summary: {
          total: 6,
          completed: 6,
          alreadyFilled: 6,
          skipped: 0,
          needsPlan: 0,
          percent: 100,
          progress: 100
        },
        artifacts: {
          pdfReady: true,
          proofReady: true,
          appOnly: true
        },
        safety: {
          dryRun: true,
          noSiagaInput: true,
          noRealSaveSend: true,
          appProgressOnly: true
        }
      }
    };

    const keys = [
      "smartwork_production_job_id",
      "smartwork_active_job_id",
      "smartwork_job_id",
      "smartwork_last_job_id",
      "smartwork_request_job_id",
      "smartwork_current_job_id"
    ];

    for (const key of keys) localStorage.setItem(key, seed.jobId);

    localStorage.setItem("smartwork_production_job", JSON.stringify(productionJobPayload));
    localStorage.setItem("smartwork_latest_job", JSON.stringify(requestPayload));
    localStorage.setItem("smartwork_request", JSON.stringify(requestPayload));
  }, { jobId });

  const page = await context.newPage();

  await page.route("**/*", async (route) => {
    const reqUrl = route.request().url();
    if (
      reqUrl.startsWith(baseUrl) ||
      reqUrl.startsWith("data:") ||
      reqUrl.startsWith("blob:")
    ) {
      return route.continue();
    }

    blockedExternal.push(reqUrl);
    return route.abort();
  });

  page.on("console", (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });

  page.on("pageerror", (err) => {
    pageErrors.push(String(err?.stack || err?.message || err));
  });

  const response = await page.goto(progressUrl, { waitUntil: "domcontentloaded" });
  const pageStatus = response ? response.status() : null;

  const deadline = Date.now() + 15000;
  let storageSnapshot = {};
  let bridgeOk = false;

  while (Date.now() < deadline) {
    storageSnapshot = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        out[key] = localStorage.getItem(key);
      }
      return out;
    });

    const prod = storageSnapshot.smartwork_production_progress_state;
    const live = storageSnapshot.smartwork_progress_live_state;

    if (hasCompleted100(prod) && hasCompleted100(live)) {
      bridgeOk = true;
      break;
    }

    await wait(500);
  }

  const relevantApiHit = apiHits.some((hit) => hit.path.includes(`/api/smartwork/jobs/${jobId}`));
  const pageLoaded = pageStatus && pageStatus >= 200 && pageStatus < 300;
  const ok = Boolean(pageLoaded && bridgeOk && relevantApiHit && pageErrors.length === 0);

  const report = {
    ok,
    phase: "5G",
    name: "Runtime Progress Bridge Smoke",
    jobId,
    progressHtmlPath,
    progressDir,
    progressUrl,
    pageStatus,
    pageLoaded,
    bridgeOk,
    relevantApiHit,
    apiHits,
    expected: {
      readsJobCompletedFromApi: true,
      writesProductionProgressState100: true,
      writesLiveProgressState100: true,
      dryRunOnly: true
    },
    safety: {
      noSiagaInput: true,
      noRealSiagaBrowserAutomation: true,
      noRealSaveSend: true,
      appDownloadProgressOnly: true,
      blockedExternal
    },
    localStorage: {
      smartwork_production_job: storageSnapshot.smartwork_production_job || null,
      smartwork_production_progress_state: storageSnapshot.smartwork_production_progress_state || null,
      smartwork_progress_live_state: storageSnapshot.smartwork_progress_live_state || null,
      keys: Object.keys(storageSnapshot).sort()
    },
    consoleMessages,
    pageErrors,
    checkedAt: new Date().toISOString()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    ok,
    phase: "5G",
    jobId,
    progressHtmlPath,
    pageStatus,
    pageLoaded,
    bridgeOk,
    relevantApiHit,
    apiHitCount: apiHits.length,
    productionStatePresent: Boolean(storageSnapshot.smartwork_production_progress_state),
    liveStatePresent: Boolean(storageSnapshot.smartwork_progress_live_state),
    reportPath
  }, null, 2));

  if (!ok) process.exitCode = 1;
} catch (err) {
  const fail = {
    ok: false,
    phase: "5G",
    error: String(err?.stack || err?.message || err),
    progressHtmlPath,
    apiHits,
    consoleMessages,
    pageErrors,
    checkedAt: new Date().toISOString()
  };
  fs.writeFileSync(reportPath, JSON.stringify(fail, null, 2));
  console.error(fail.error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.close();
}
