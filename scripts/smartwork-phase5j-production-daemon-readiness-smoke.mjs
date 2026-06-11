import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const PORT = Number(process.env.SMARTWORK_PHASE5J_PORT || 8892);
const baseUrl = `http://127.0.0.1:${PORT}`;
const reportPath = path.join(root, "reports", "phase5j-production-daemon-readiness-smoke-report.json");

const serverLines = [];
const daemonLines = [];
const browserRequests = [];
const consoleMessages = [];
const pageErrors = [];
const blockedExternal = [];

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  let text = "";
  let json = null;

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

function extractJobId(response) {
  return (
    response?.json?.job?.id ||
    response?.json?.job?.jobId ||
    response?.json?.id ||
    response?.json?.jobId ||
    null
  );
}

function getJobStatus(payload) {
  return String(
    payload?.json?.status ||
    payload?.json?.job?.status ||
    payload?.json?.job?.phase ||
    payload?.json?.job?.state ||
    ""
  ).toLowerCase();
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
      SMARTWORK_PHASE: "5J_PRODUCTION_DAEMON_READINESS_SMOKE"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function startDaemon() {
  return spawn("node", ["scripts/smartwork-production-worker.mjs", "--daemon", "--dry-run"], {
    cwd: root,
    env: {
      ...process.env,
      SMARTWORK_DRY_RUN: "true",
      SMARTWORK_NO_SIAGA_INPUT: "true",
      SMARTWORK_NO_BROWSER_OPEN: "true",
      SMARTWORK_NO_REAL_SAVE: "true",
      SMARTWORK_NO_REAL_SEND: "true",
      SMARTWORK_PHASE: "5J_PRODUCTION_DAEMON_READINESS_SMOKE"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function stopChild(child, label) {
  if (!child || child.killed) {
    return { label, stopped: true, alreadyKilled: true };
  }

  child.kill("SIGTERM");

  const result = await Promise.race([
    new Promise((resolve) => child.once("exit", (code, signal) => resolve({ label, stopped: true, code, signal }))),
    wait(2500).then(() => ({ label, stopped: false, timeout: true }))
  ]);

  if (!result.stopped && !child.killed) {
    child.kill("SIGKILL");
    await wait(500);
    return { ...result, forceKilled: true };
  }

  return result;
}

async function createJob(index) {
  const payload = {
    id: `phase5j-daemon-${Date.now()}-${index}`,
    requesterName: `Phase5J Daemon Smoke ${index}`,
    module: "siaga",
    mode: "dry-run-daemon-smoke",
    requestType: "daily",
    accountRef: "guru-001",
    requestRange: {
      startDate: "2026-06-22",
      endDate: "2026-06-27"
    },
    deliveryMode: "app_download_only",
    dryRun: true,
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    safety: {
      dryRun: true,
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true
    },
    notes: "Phase 5J daemon readiness dry-run smoke. No SIAGA input, no browser, no real save/send."
  };

  return fetchJson(`${baseUrl}/api/smartwork/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function waitForJobsCompleted(jobIds) {
  const deadline = Date.now() + 45000;
  const snapshots = [];

  while (Date.now() < deadline) {
    const checks = [];

    for (const jobId of jobIds) {
      const status = await fetchJson(`${baseUrl}/api/smartwork/jobs/${encodeURIComponent(jobId)}`).catch((error) => ({
        ok: false,
        error: String(error?.message || error)
      }));

      checks.push({
        jobId,
        ok: status.ok,
        status: getJobStatus(status),
        response: status
      });
    }

    snapshots.push({
      at: new Date().toISOString(),
      checks: checks.map((item) => ({
        jobId: item.jobId,
        ok: item.ok,
        status: item.status
      }))
    });

    if (checks.every((item) => item.ok && item.status === "completed")) {
      return {
        ok: true,
        checks,
        snapshots
      };
    }

    await wait(1000);
  }

  return {
    ok: false,
    snapshots
  };
}

let server;
let daemon;
let browser;

try {
  if (!fs.existsSync(path.join(root, "app", "smartwork-control-server.mjs"))) {
    throw new Error("app/smartwork-control-server.mjs not found");
  }

  if (!fs.existsSync(path.join(root, "scripts", "smartwork-production-worker.mjs"))) {
    throw new Error("scripts/smartwork-production-worker.mjs not found");
  }

  server = startServer();

  server.stdout.on("data", (chunk) => serverLines.push(String(chunk)));
  server.stderr.on("data", (chunk) => serverLines.push(String(chunk)));

  const health = await waitForHealth();
  if (!health.ok) throw new Error("real_server_health_failed");

  const createResponses = [];
  for (let i = 1; i <= 2; i++) {
    const created = await createJob(i);
    createResponses.push(created);
    if (!created.ok || created.json?.ok !== true) {
      throw new Error(`phase5j_create_job_${i}_failed`);
    }
  }

  const jobIds = createResponses.map(extractJobId).filter(Boolean);
  if (jobIds.length !== 2) {
    throw new Error("phase5j_created_job_ids_missing");
  }

  daemon = startDaemon();

  daemon.stdout.on("data", (chunk) => daemonLines.push(String(chunk)));
  daemon.stderr.on("data", (chunk) => daemonLines.push(String(chunk)));

  const completed = await waitForJobsCompleted(jobIds);
  if (!completed.ok) {
    throw new Error("phase5j_daemon_did_not_complete_all_jobs");
  }

  const targetJobId = jobIds[0];

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
      source: "phase5j-production-daemon-readiness-smoke",
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
  }, { jobId: targetJobId });

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

  page.on("console", (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on("pageerror", (err) => pageErrors.push(String(err?.stack || err?.message || err)));

  const progressUrl = `${baseUrl}/progress.html?jobId=${encodeURIComponent(targetJobId)}&phase=5j`;
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
    req.url.includes(`/api/smartwork/jobs/${targetJobId}`)
  );

  const daemonStop = await stopChild(daemon, "production-worker-daemon");
  daemon = null;

  const serverStop = await stopChild(server, "smartwork-control-server");
  server = null;

  const safetyKept = completed.checks.every((item) => {
    const safety = item.response?.json?.job?.safety || item.response?.json?.safety || {};
    return (
      safety.noSiagaInput === true &&
      safety.noBrowserOpen === true &&
      safety.noRealSave === true &&
      safety.noRealSend === true
    );
  });

  const daemonStoppedClean = daemonStop.stopped === true;
  const serverStoppedClean = serverStop.stopped === true;

  const ok = Boolean(
    health.ok &&
    jobIds.length === 2 &&
    completed.ok &&
    progressPageLoaded &&
    progressFetchedRealJob &&
    bridgeOk &&
    safetyKept &&
    daemonStoppedClean &&
    serverStoppedClean &&
    pageErrors.length === 0
  );

  const report = {
    ok,
    phase: "5J",
    name: "Production Daemon Readiness Smoke",
    baseUrl,
    port: PORT,
    jobIds,
    targetJobId,
    healthOk: health.ok,
    createdJobsOk: createResponses.every((r) => r.ok && r.json?.ok === true),
    daemonCompletedAllJobs: completed.ok,
    completedStatuses: completed.checks.map((item) => ({
      jobId: item.jobId,
      ok: item.ok,
      status: item.status
    })),
    progressPageStatus,
    progressPageLoaded,
    progressFetchedRealJob,
    bridgeOk,
    safetyKept,
    daemonStoppedClean,
    serverStoppedClean,
    daemonStop,
    serverStop,
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
    createResponses,
    completionSnapshots: completed.snapshots,
    serverOutputTail: serverLines.slice(-80),
    daemonOutputTail: daemonLines.slice(-80),
    consoleMessages,
    pageErrors,
    checkedAt: new Date().toISOString()
  };

  writeJson(reportPath, report);

  console.log(JSON.stringify({
    ok,
    phase: "5J",
    port: PORT,
    baseUrl,
    jobIds,
    targetJobId,
    healthOk: health.ok,
    createdJobsOk: report.createdJobsOk,
    daemonCompletedAllJobs: completed.ok,
    progressPageLoaded,
    progressFetchedRealJob,
    bridgeOk,
    safetyKept,
    daemonStoppedClean,
    serverStoppedClean,
    reportPath
  }, null, 2));

  if (!ok) process.exitCode = 1;
} catch (error) {
  const daemonStop = daemon ? await stopChild(daemon, "production-worker-daemon").catch((e) => ({ stopped: false, error: String(e) })) : null;
  daemon = null;

  const serverStop = server ? await stopChild(server, "smartwork-control-server").catch((e) => ({ stopped: false, error: String(e) })) : null;
  server = null;

  const fail = {
    ok: false,
    phase: "5J",
    error: String(error?.stack || error?.message || error),
    baseUrl,
    port: PORT,
    daemonStop,
    serverStop,
    safety: {
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true,
      dryRunOnly: true,
      appProgressOnly: true
    },
    serverOutputTail: serverLines.slice(-80),
    daemonOutputTail: daemonLines.slice(-80),
    consoleMessages,
    pageErrors,
    checkedAt: new Date().toISOString()
  };

  writeJson(reportPath, fail);
  console.error(fail.error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (daemon) await stopChild(daemon, "production-worker-daemon-finally").catch(() => {});
  if (server) await stopChild(server, "smartwork-control-server-finally").catch(() => {});
}
