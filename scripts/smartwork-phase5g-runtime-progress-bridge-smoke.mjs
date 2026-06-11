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

const completedJob = {
  ok: true,
  job: {
    id: jobId,
    jobId,
    type: "smartwork.siaga.attendance",
    status: "completed",
    phase: "completed",
    progress: 100,
    percent: 100,
    progressPercent: 100,
    message: "Phase 5G runtime smoke completed job",
    summary: {
      total: 6,
      completed: 6,
      alreadyFilled: 6,
      skipped: 0,
      needsPlan: 0,
      percent: 100
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

const apiHits = [];
const consoleMessages = [];
const pageErrors = [];
const blockedExternal = [];

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
  return "application/octet-stream";
}

function safeStaticPath(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "");
  const file = clean || "progress.html";
  const resolved = path.resolve(root, file);
  if (!resolved.startsWith(root)) return null;
  return resolved;
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

  const filePath = safeStaticPath(url.pathname);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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

  let parsed = null;
  try { parsed = typeof value === "string" ? JSON.parse(value) : value; } catch {}

  const has100 = text.includes("100");
  const hasCompleted = /completed|complete|selesai|done/i.test(text);
  const hasJob = text.includes(jobId) || text.includes("phase5g-runtime-smoke");

  if (has100 && hasCompleted && hasJob) return true;

  const candidates = [];
  function collect(obj) {
    if (!obj || typeof obj !== "object") return;
    candidates.push(obj);
    for (const v of Object.values(obj)) collect(v);
  }
  collect(parsed);

  return candidates.some((obj) => {
    const status = String(obj.status || obj.phase || obj.state || "").toLowerCase();
    const percent = Number(obj.percent ?? obj.progress ?? obj.progressPercent ?? obj.percentage);
    const id = String(obj.jobId || obj.id || "");
    return percent === 100 && /completed|complete|selesai|done/.test(status) && (id === jobId || hasJob);
  });
}

let browser;
let serverAddress;

try {
  serverAddress = await listen(server);
  const baseUrl = `http://127.0.0.1:${serverAddress.port}`;
  const progressUrl = `${baseUrl}/progress.html?jobId=${encodeURIComponent(jobId)}&phase=5g`;

  const { chromium } = await import("playwright");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

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

  await page.goto(progressUrl, { waitUntil: "domcontentloaded" });

  await page.evaluate((jobIdArg) => {
    const requestPayload = {
      jobId: jobIdArg,
      id: jobIdArg,
      source: "phase5g-runtime-smoke",
      status: "completed",
      progress: 100,
      percent: 100,
      updatedAt: new Date().toISOString()
    };

    const keys = [
      "smartwork_production_job_id",
      "smartwork_active_job_id",
      "smartwork_job_id",
      "smartwork_last_job_id",
      "smartwork_request_job_id",
      "smartwork_current_job_id"
    ];

    for (const key of keys) localStorage.setItem(key, jobIdArg);

    localStorage.setItem("smartwork_latest_job", JSON.stringify(requestPayload));
    localStorage.setItem("smartwork_request", JSON.stringify(requestPayload));

    window.dispatchEvent(new StorageEvent("storage", {
      key: "smartwork_production_job_id",
      newValue: jobIdArg
    }));
  }, jobId);

  await page.reload({ waitUntil: "domcontentloaded" });

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
  const ok = Boolean(bridgeOk && relevantApiHit && pageErrors.length === 0);

  const report = {
    ok,
    phase: "5G",
    name: "Runtime Progress Bridge Smoke",
    jobId,
    progressUrl,
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
    bridgeOk,
    relevantApiHit,
    apiHitCount: apiHits.length,
    productionStatePresent: Boolean(storageSnapshot.smartwork_production_progress_state),
    liveStatePresent: Boolean(storageSnapshot.smartwork_progress_live_state),
    reportPath
  }, null, 2));

  if (!ok) {
    process.exitCode = 1;
  }
} catch (err) {
  const fail = {
    ok: false,
    phase: "5G",
    error: String(err?.stack || err?.message || err),
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
