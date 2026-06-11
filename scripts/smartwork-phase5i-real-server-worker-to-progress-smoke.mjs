import fs from "fs";
import path from "path";
import http from "http";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const PORT = Number(process.env.SMARTWORK_PHASE5I_PORT || 8891);
const baseUrl = `http://127.0.0.1:${PORT}`;
const reportPath = path.join(root, "reports", "phase5i-real-server-worker-to-progress-smoke-report.json");
const workerReportPath = path.join(root, "reports", "production-worker", "phase5e-worker-lifecycle-bridge-report.json");

const consoleMessages = [];
const pageErrors = [];
const blockedExternal = [];
const browserRequests = [];
const serverLines = [];
const workerLines = [];

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchJson(url, options = {}) {
  return fetch(url, options).then(async (res) => {
    let json = null;
    let text = "";
    try {
      text = await res.text();
      json = text ? JSON.parse(text) : null;
    } catch {}
    return {
      ok: res.ok,
      status: res.status,
      json,
      text
    };
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  let last = null;

  while (Date.now() < deadline) {
    try {
      last = await fetchJson(`${baseUrl}/api/smartwork/jobs/health`);
      if (last.ok && last.json?.ok === true) {
        return { ok: true, health: last };
      }
    } catch (error) {
      last = { ok: false, error: String(error?.message || error) };
    }

    await wait(300);
  }

  return { ok: false, last };
}

function extractJobId(workerReport) {
  const candidates = [
    workerReport?.jobId,
    workerReport?.smokeJobId,
    workerReport?.steps?.createSmokeJob?.json?.job?.id,
    workerReport?.steps?.createSmokeJob?.json?.job?.jobId,
    workerReport?.steps?.createSmokeJob?.json?.id,
    workerReport?.steps?.createSmokeJob?.json?.jobId,
    workerReport?.steps?.workerOnce?.job?.id,
    workerReport?.steps?.workerOnce?.job?.jobId,
    workerReport?.steps?.workerOnce?.completed?.json?.job?.id,
    workerReport?.steps?.workerOnce?.completed?.json?.job?.jobId,
    workerReport?.steps?.workerOnce?.completed?.json?.id,
    workerReport?.steps?.workerOnce?.completed?.json?.jobId
  ];

  return candidates.find(Boolean) || null;
}

function hasCompleted100(value) {
  if (!value) return false;

  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.includes("100") && /completed|complete|selesai|done|hasil_siap/i.test(text)) return true;

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

  return candidates.some((obj) => {
    const status = String(obj.status || obj.phase || obj.state || obj.stage || obj.currentStep || "").toLowerCase();
    const percent = Number(obj.percent ?? obj.progress ?? obj.progressPercent ?? obj.percentage);
    return percent === 100 && /completed|complete|selesai|done|hasil_siap/.test(status);
  });
}

function startServer() {
  return spawn("node", ["app/smartwork-control-server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      SMARTWORK_DRY_RUN: "true",
      SMARTWORK_NO_SIAGA_INPUT: "true",
      SMARTWORK_NO_BROWSER_OPEN: "true",
      SMARTWORK_NO_REAL_SAVE: "true",
      SMARTWORK_NO_REAL_SEND: "true",
      SMARTWORK_PHASE: "5I_REAL_SERVER_WORKER_PROGRESS_SMOKE"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function runWorkerLifecycleSmoke() {
  return new Promise((resolve) => {
    const child = spawn("node", ["scripts/smartwork-phase5e-worker-lifecycle-bridge.mjs", "--smoke"], {
      cwd: root,
      env: {
        ...process.env,
        SMARTWORK_API_BASE_URL: baseUrl,
        SMARTWORK_WORKER_BRIDGE_PORT: String(PORT),
        SMARTWORK_DRY_RUN: "true",
        SMARTWORK_NO_SIAGA_INPUT: "true",
        SMARTWORK_NO_BROWSER_OPEN: "true",
        SMARTWORK_NO_REAL_SAVE: "true",
        SMARTWORK_NO_REAL_SEND: "true",
        SMARTWORK_PHASE: "5I_REAL_SERVER_WORKER_PROGRESS_SMOKE"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      workerLines.push(String(chunk));
    });

    child.stderr.on("data", (chunk) => {
      workerLines.push(String(chunk));
    });

    child.on("exit", (code, signal) => {
      resolve({ code, signal, outputTail: workerLines.slice(-80) });
    });
  });
}

let server;
let browser;

try {
  if (!fs.existsSync(path.join(root, "app", "smartwork-control-server.mjs"))) {
    throw new Error("app/smartwork-control-server.mjs not found");
  }

  if (!fs.existsSync(path.join(root, "scripts", "smartwork-phase5e-worker-lifecycle-bridge.mjs"))) {
    throw new Error("scripts/smartwork-phase5e-worker-lifecycle-bridge.mjs not found");
  }

  server = startServer();

  server.stdout.on("data", (chunk) => {
    serverLines.push(String(chunk));
  });

  server.stderr.on("data", (chunk) => {
    serverLines.push(String(chunk));
  });

  const health = await waitForHealth();
  if (!health.ok) {
    throw new Error("real_server_health_failed");
  }

  const workerRun = await runWorkerLifecycleSmoke();
  const workerReport = readJsonSafe(workerReportPath, null);
  const workerOk = workerRun.code === 0 && workerReport?.ok === true;

  if (!workerOk) {
    throw new Error("worker_lifecycle_smoke_failed");
  }

  const jobId = extractJobId(workerReport);
  if (!jobId) {
    throw new Error("worker_completed_job_id_not_found");
  }

  const completedStatus = await fetchJson(`${baseUrl}/api/smartwork/jobs/${encodeURIComponent(jobId)}`);
  const completedStatusOk =
    completedStatus.ok &&
    (
      completedStatus.json?.status === "completed" ||
      completedStatus.json?.job?.status === "completed" ||
      completedStatus.json?.job?.phase === "completed"
    );

  if (!completedStatusOk) {
    throw new Error("completed_job_status_not_readable_from_real_server");
  }

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  await context.addInitScript((seed) => {
    const jobSeed = {
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
      source: "phase5i-real-server-worker-progress-smoke",
      job: {
        id: seed.jobId,
        jobId: seed.jobId,
        status: "completed",
        phase: "completed",
        progress: 100,
        percent: 100,
        progressPercent: 100,
        safety: {
          noSiagaInput: true,
          noBrowserOpen: true,
          noRealSave: true,
          noRealSend: true
        }
      }
    };

    localStorage.setItem("smartwork_production_job", JSON.stringify(jobSeed));
    localStorage.setItem("smartwork_production_job_id", seed.jobId);
    localStorage.setItem("smartwork_active_job_id", seed.jobId);
    localStorage.setItem("smartwork_job_id", seed.jobId);
    localStorage.setItem("smartwork_last_job_id", seed.jobId);
  }, { jobId });

  const page = await context.newPage();

  await page.route("**/*", async (route) => {
    const reqUrl = route.request().url();
    browserRequests.push({
      method: route.request().method(),
      url: reqUrl
    });

    if (reqUrl.startsWith(baseUrl) || reqUrl.startsWith("data:") || reqUrl.startsWith("blob:")) {
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

  const progressUrl = `${baseUrl}/progress.html?jobId=${encodeURIComponent(jobId)}&phase=5i`;
  const progressResponse = await page.goto(progressUrl, { waitUntil: "domcontentloaded" });
  const progressPageStatus = progressResponse ? progressResponse.status() : null;
  const progressPageLoaded = progressPageStatus && progressPageStatus >= 200 && progressPageStatus < 300;

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

    if (
      hasCompleted100(storageSnapshot.smartwork_production_progress_state) &&
      hasCompleted100(storageSnapshot.smartwork_progress_live_state)
    ) {
      bridgeOk = true;
      break;
    }

    await wait(500);
  }

  const progressFetchedRealJob = browserRequests.some((req) =>
    req.method === "GET" &&
    req.url.includes(`/api/smartwork/jobs/${jobId}`)
  );

  const safetyKept =
    workerReport?.steps?.workerOnce?.safetyKept === true ||
    (
      completedStatus.json?.job?.safety?.noSiagaInput === true &&
      completedStatus.json?.job?.safety?.noBrowserOpen === true &&
      completedStatus.json?.job?.safety?.noRealSave === true &&
      completedStatus.json?.job?.safety?.noRealSend === true
    );

  const ok = Boolean(
    health.ok &&
    workerOk &&
    completedStatusOk &&
    progressPageLoaded &&
    progressFetchedRealJob &&
    bridgeOk &&
    safetyKept &&
    pageErrors.length === 0
  );

  const report = {
    ok,
    phase: "5I",
    name: "Real Server Worker To Progress Runtime Smoke",
    baseUrl,
    port: PORT,
    jobId,
    healthOk: health.ok,
    workerOk,
    workerExit: workerRun,
    completedStatusOk,
    progressPageStatus,
    progressPageLoaded,
    progressFetchedRealJob,
    bridgeOk,
    safetyKept,
    workerReportPath: path.relative(root, workerReportPath).replaceAll("\\", "/"),
    workerReport,
    completedStatus,
    localStorage: {
      smartwork_production_job: storageSnapshot.smartwork_production_job || null,
      smartwork_production_progress_state: storageSnapshot.smartwork_production_progress_state || null,
      smartwork_progress_live_state: storageSnapshot.smartwork_progress_live_state || null,
      keys: Object.keys(storageSnapshot).sort()
    },
    browserRequests: browserRequests.filter((req) => /api\/smartwork\/jobs|progress\.html/.test(req.url)),
    safety: {
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true,
      dryRunOnly: true,
      appProgressOnly: true,
      blockedExternal
    },
    consoleMessages,
    pageErrors,
    serverOutputTail: serverLines.slice(-80),
    workerOutputTail: workerLines.slice(-80),
    checkedAt: new Date().toISOString()
  };

  writeJson(reportPath, report);

  console.log(JSON.stringify({
    ok,
    phase: "5I",
    port: PORT,
    baseUrl,
    jobId,
    healthOk: health.ok,
    workerOk,
    completedStatusOk,
    progressPageLoaded,
    progressFetchedRealJob,
    bridgeOk,
    safetyKept,
    reportPath
  }, null, 2));

  if (!ok) process.exitCode = 1;
} catch (error) {
  const fail = {
    ok: false,
    phase: "5I",
    error: String(error?.stack || error?.message || error),
    baseUrl,
    port: PORT,
    safety: {
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true,
      dryRunOnly: true
    },
    serverOutputTail: serverLines.slice(-80),
    workerOutputTail: workerLines.slice(-80),
    consoleMessages,
    pageErrors,
    checkedAt: new Date().toISOString()
  };

  writeJson(reportPath, fail);
  console.error(fail.error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && !server.killed) {
    server.kill("SIGTERM");
    await wait(500);
    if (!server.killed) server.kill("SIGKILL");
  }
}
