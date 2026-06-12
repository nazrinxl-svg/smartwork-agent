import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium, devices } from "playwright";

const root = process.cwd();
const phase = "5ZD";
const appPort = Number(process.env.SMARTWORK_5ZD_PORT || 5197);
const appBase = `http://127.0.0.1:${appPort}`;
const apiBase = "http://103.152.242.193:3107";
const publicDir = path.join(root, "public");
const shotsDir = path.join(root, "shots");
const checkpointDir = path.join(root, "docs", "checkpoints");
const checkpoint = path.join(checkpointDir, "smartwork-phase5zd-phone-public-like-submit-proof-report.json");

fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(checkpointDir, { recursive: true });

const report = {
  ok: false,
  phase,
  releaseDecision: "PHONE_PUBLIC_LIKE_DIRECT_PAYLOAD_TO_DEWAVPS_WORKER_DRY_RUN_READY",
  appBase,
  apiBase,
  device: "iPhone 13 emulation",
  serverMode: "INTERNAL_NODE_STATIC_SERVER_NO_SPAWN",
  originStrategy: "REUSE_PHASE5ZC_KNOWN_GOOD_LOCAL_ORIGIN_127_0_0_1_5197",
  submitMode: "DIRECT_SMARTWORK_VPS_API_PAYLOAD_OBJECT",
  appBridge: {},
  job: {},
  queueCounts: {},
  progress: {},
  proof: {},
  screenshots: {
    request: "shots/smartwork-phase5zd-phone-request-filled.png",
    progress: "shots/smartwork-phase5zd-phone-progress.png"
  },
  safetyConfirmed: {
    dryRun: true,
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    rawPasswordStored: false
  },
  consoleLines: [],
  errors: [],
  createdAt: new Date().toISOString()
};

function writeReport() {
  report.updatedAt = new Date().toISOString();
  fs.writeFileSync(checkpoint, JSON.stringify(report, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json; charset=utf-8"
  }[ext] || "application/octet-stream";
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", appBase);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/request.html";

      const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
      let filePath = path.join(publicDir, safePath);

      if (!filePath.startsWith(publicDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(publicDir, "request.html");
      }

      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      res.writeHead(200, {
        "Content-Type": contentType(filePath),
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      });
      res.end(fs.readFileSync(filePath));
    } catch (err) {
      res.writeHead(500);
      res.end(String(err?.stack || err));
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(appPort, "127.0.0.1", () => resolve(server));
  });
}

async function browserFetchJson(page, url, options = {}) {
  try {
    return await page.evaluate(async ({ url, options }) => {
      const res = await fetch(url, options);
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return {
        ok: res.ok,
        status: res.status,
        json,
        text,
        verifier: "browser_fetch"
      };
    }, { url, options });
  } catch (browserErr) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}

      return {
        ok: res.ok,
        status: res.status,
        json,
        text,
        verifier: "node_fetch_fallback_after_browser_fetch_failed",
        browserError: String(browserErr?.stack || browserErr)
      };
    } catch (nodeErr) {
      return {
        ok: false,
        status: 0,
        json: null,
        text: "",
        verifier: "node_fetch_fallback_failed",
        browserError: String(browserErr?.stack || browserErr),
        error: String(nodeErr?.stack || nodeErr)
      };
    }
  }
}

function safetyOk(json) {
  const safety = json?.safety || json;
  return Boolean(
    safety?.dryRun === true &&
    safety?.noSiagaInput === true &&
    safety?.noBrowserOpen === true &&
    safety?.noRealSave === true &&
    safety?.noRealSend === true
  );
}

let server = null;
let browser = null;

try {
  writeReport();

  server = await startStaticServer();

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices["iPhone 13"], permissions: [] });
  const page = await context.newPage();

  page.on("console", (msg) => report.consoleLines.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto(`${appBase}/request.html`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  const bridgeReady = await page.evaluate(() => Boolean(window.SmartWorkVpsApi?.submit && window.SmartWorkVpsApi?.health));
  const bridgeBase = await page.evaluate(() => window.SmartWorkVpsApi?.base || null);

  const healthFromPhoneApp = await page.evaluate(async () => {
    try { return await window.SmartWorkVpsApi.health(); }
    catch (err) { return { ok: false, error: String(err?.stack || err) }; }
  });

  const completedBefore = Number(healthFromPhoneApp?.counts?.completed ?? 0);

  Object.assign(report.appBridge, { bridgeReady, bridgeBase, noSameOriginProxy: true });
  report.proof.healthFromPhoneApp = healthFromPhoneApp;
  report.queueCounts.beforeCompleted = completedBefore;
  writeReport();

  await page.evaluate(() => {
    const values = {
      requesterName: "Nazrin Phone Proof",
      email: "nazrinxl@gmail.com",
      whatsapp: "6280000000000",
      username: "phase5zd-phone-redacted",
      password: "REDACTED-NOT-STORED",
      startDate: "2026-06-13",
      endDate: "2026-06-13",
      holidays: "",
      notes: "Phase 5ZD phone/public-like dry-run proof. No SIAGA input, no browser automation, no real save/send."
    };
    for (const [name, value] of Object.entries(values)) {
      const el = document.querySelector(`[name="${name}"]`);
      if (el && "value" in el) el.value = value;
    }
  });

  await page.screenshot({ path: path.join(shotsDir, "smartwork-phase5zd-phone-request-filled.png"), fullPage: true });

  const payload = {
    jobId: "phase5zd-phone-public-like-" + Date.now(),
    type: "siaga-attendance",
    source: "smartwork-phone-public-like-proof",
    phase,
    requester: { name: "Nazrin Phone Proof", email: "nazrinxl@gmail.com", whatsapp: "6280000000000" },
    startDate: "2026-06-13",
    endDate: "2026-06-13",
    requestRange: { startDate: "2026-06-13", endDate: "2026-06-13" },
    request: {
      requestType: "phone-public-like-proof",
      startDate: "2026-06-13",
      endDate: "2026-06-13",
      notes: "Phase 5ZD phone/public-like proof only. No SIAGA input, no browser automation, no save/send.",
      holidays: [],
      redacted: true
    },
    accounts: [{
      id: "guru-001",
      name: "Nazrin Phone Proof",
      email: "nazrinxl@gmail.com",
      whatsapp: "6280000000000",
      accountRef: "phase5zd-phone-redacted",
      credentialRef: "phase5zd-phone-redacted",
      startDate: "2026-06-13",
      endDate: "2026-06-13",
      dryRun: true
    }],
    safety: {
      dryRun: true,
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true,
      rawPasswordStored: false
    }
  };

  const submitProof = await page.evaluate(async (payload) => {
    try { return await window.SmartWorkVpsApi.submit(payload); }
    catch (err) { return { ok: false, error: String(err?.stack || err) }; }
  }, payload);

  const jobId =
    submitProof?.jobId ||
    submitProof?.submit?.jobId ||
    submitProof?.submit?.job?.id ||
    submitProof?.job?.id ||
    "";

  if (!jobId) {
    report.errors.push("submit_did_not_return_real_job_id");
  }

  report.proof.submitProof = submitProof;
  report.job.jobId = jobId;
  writeReport();

  let statusResult = null;
  for (let i = 0; i < 30 && jobId; i++) {
    statusResult = await browserFetchJson(page, `${apiBase}/api/smartwork/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: { Origin: appBase }
    });

    const status = statusResult?.json?.status || statusResult?.json?.job?.status || "";
    const percent = Number(statusResult?.json?.percent ?? statusResult?.json?.job?.percent ?? 0);
    if (status === "completed" && percent === 100) break;
    await sleep(1000);
  }

  const jobStatus = statusResult?.json?.status || statusResult?.json?.job?.status || "";
  const jobPercent = Number(statusResult?.json?.percent ?? statusResult?.json?.job?.percent ?? 0);

  Object.assign(report.job, { jobId, status: jobStatus, percent: jobPercent });
  report.proof.statusResult = statusResult;
  writeReport();

  await page.evaluate((jobId) => {
    localStorage.setItem("smartwork_active_job_id", jobId);
    localStorage.setItem("smartwork_production_job_id", jobId);
    localStorage.setItem("smartwork_production_job", JSON.stringify({ jobId }));
  }, jobId);

  await page.goto(`${appBase}/progress.html?jobId=${encodeURIComponent(jobId)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1600);

  const progressBridgeReady = await page.evaluate(() => Boolean(window.SmartWorkVpsProgress?.refresh || window.SmartWorkProductionProgressBridge?.refresh));
  const progressRefresh = await page.evaluate(async () => {
    try {
      if (window.SmartWorkVpsProgress?.refresh) return await window.SmartWorkVpsProgress.refresh();
      if (window.SmartWorkProductionProgressBridge?.refresh) return await window.SmartWorkProductionProgressBridge.refresh();
      return null;
    } catch (err) {
      return { ok: false, error: String(err?.stack || err) };
    }
  });

  report.progress = { progressBridgeReady, progressRefresh };
  writeReport();

  await page.screenshot({ path: path.join(shotsDir, "smartwork-phase5zd-phone-progress.png"), fullPage: true });

  const healthAfter = await browserFetchJson(page, `${apiBase}/api/smartwork/jobs/health`, {
    method: "GET",
    headers: { Origin: appBase }
  });

  const completedAfter = Number(healthAfter?.json?.counts?.completed ?? 0);

  report.proof.healthAfter = healthAfter;
  report.queueCounts.afterCompleted = completedAfter;

  report.ok = Boolean(
    bridgeReady &&
    bridgeBase === apiBase &&
    safetyOk(healthFromPhoneApp) &&
    submitProof?.ok !== false &&
    jobId &&
    statusResult?.ok &&
    jobStatus === "completed" &&
    jobPercent === 100 &&
    safetyOk(healthAfter?.json) &&
    completedAfter >= completedBefore + 1 &&
    progressBridgeReady &&
    fs.existsSync(path.join(shotsDir, "smartwork-phase5zd-phone-request-filled.png")) &&
    fs.existsSync(path.join(shotsDir, "smartwork-phase5zd-phone-progress.png"))
  );

  writeReport();

  console.log(JSON.stringify({
    ok: report.ok,
    phase,
    serverMode: report.serverMode,
    submitMode: report.submitMode,
    bridgeReady,
    bridgeBase,
    jobId,
    jobStatus,
    jobPercent,
    completedBefore,
    completedAfter,
    progressBridgeReady,
    checkpoint: path.relative(root, checkpoint).replaceAll("\\", "/")
  }, null, 2));

  if (!report.ok) process.exitCode = 1;
} catch (err) {
  report.errors.push(String(err?.stack || err));
  writeReport();
  console.error(String(err?.stack || err));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
}
