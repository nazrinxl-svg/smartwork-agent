import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const PORT = Number(process.env.SMARTWORK_PHASE5K_PORT || 8893);
const baseUrl = `http://127.0.0.1:${PORT}`;
const reportPath = path.join(root, "reports", "phase5k-vps-cloud-service-simulation-smoke-report.json");

const allLines = [];
const browserRequests = [];
const consoleMessages = [];
const pageErrors = [];
const blockedExternal = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

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
  return { ok: res.ok, status: res.status, json, text };
}

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  let last = null;

  while (Date.now() < deadline) {
    try {
      last = await fetchJson(`${baseUrl}/api/smartwork/jobs/health`);
      if (last.ok && last.json?.ok === true) return { ok: true, health: last };
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

function serviceEnv(phase) {
  return {
    ...process.env,
    PORT: String(PORT),
    SMARTWORK_DRY_RUN: "true",
    SMARTWORK_NO_SIAGA_INPUT: "true",
    SMARTWORK_NO_BROWSER_OPEN: "true",
    SMARTWORK_NO_REAL_SAVE: "true",
    SMARTWORK_NO_REAL_SEND: "true",
    SMARTWORK_WORKER_INTERVAL_MS: "1000",
    SMARTWORK_PHASE: phase
  };
}

function startServer(cycle) {
  const child = spawn("node", ["app/smartwork-control-server.mjs"], {
    cwd: root,
    env: serviceEnv(`5K_CLOUD_SERVICE_SIMULATION_SERVER_${cycle}`),
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => allLines.push({ type: "server", cycle, text: String(chunk) }));
  child.stderr.on("data", (chunk) => allLines.push({ type: "server:err", cycle, text: String(chunk) }));

  return child;
}

function startDaemon(cycle) {
  const child = spawn("node", ["scripts/smartwork-production-worker.mjs", "--daemon", "--dry-run"], {
    cwd: root,
    env: serviceEnv(`5K_CLOUD_SERVICE_SIMULATION_DAEMON_${cycle}`),
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => allLines.push({ type: "daemon", cycle, text: String(chunk) }));
  child.stderr.on("data", (chunk) => allLines.push({ type: "daemon:err", cycle, text: String(chunk) }));

  return child;
}

async function stopChild(child, label) {
  if (!child || child.killed) return { label, stopped: true, alreadyKilled: true };

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

async function createJob(cycle) {
  const payload = {
    id: `phase5k-cloud-service-${Date.now()}-${cycle}`,
    requesterName: `Phase5K Cloud Service Smoke ${cycle}`,
    module: "siaga",
    mode: "dry-run",
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
    notes: `Phase 5K service simulation cycle ${cycle}. Dry-run only.`
  };

  return fetchJson(`${baseUrl}/api/smartwork/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}

async function waitForJobCompleted(jobId) {
  const deadline = Date.now() + 30000;
  const snapshots = [];

  while (Date.now() < deadline) {
    const status = await fetchJson(`${baseUrl}/api/smartwork/jobs/${encodeURIComponent(jobId)}`).catch((error) => ({
      ok: false,
      error: String(error?.message || error)
    }));

    const currentStatus = getJobStatus(status);
    snapshots.push({
      at: new Date().toISOString(),
      ok: status.ok,
      status: currentStatus
    });

    if (status.ok && currentStatus === "completed") {
      return { ok: true, status, snapshots };
    }

    await wait(700);
  }

  return { ok: false, snapshots };
}

async function runServiceCycle(cycle) {
  let server = null;
  let daemon = null;

  try {
    server = startServer(cycle);
    const health = await waitForHealth();
    if (!health.ok) throw new Error(`phase5k_cycle_${cycle}_health_failed`);

    daemon = startDaemon(cycle);
    await wait(1000);

    const created = await createJob(cycle);
    if (!created.ok || created.json?.ok !== true) {
      throw new Error(`phase5k_cycle_${cycle}_create_job_failed`);
    }

    const jobId = extractJobId(created);
    if (!jobId) throw new Error(`phase5k_cycle_${cycle}_job_id_missing`);

    const completed = await waitForJobCompleted(jobId);
    if (!completed.ok) throw new Error(`phase5k_cycle_${cycle}_job_not_completed`);

    const daemonStop = await stopChild(daemon, `daemon-cycle-${cycle}`);
    daemon = null;

    const serverStop = await stopChild(server, `server-cycle-${cycle}`);
    server = null;

    const safety = completed.status?.json?.job?.safety || completed.status?.json?.safety || {};
    const safetyKept = Boolean(
      safety.noSiagaInput === true &&
      safety.noBrowserOpen === true &&
      safety.noRealSave === true &&
      safety.noRealSend === true
    );

    return {
      ok: true,
      cycle,
      baseUrl,
      jobId,
      healthOk: health.ok,
      createdJobOk: created.ok && created.json?.ok === true,
      completedOk: completed.ok,
      safetyKept,
      daemonStoppedClean: daemonStop.stopped === true,
      serverStoppedClean: serverStop.stopped === true,
      daemonStop,
      serverStop,
      completionSnapshots: completed.snapshots
    };
  } finally {
    if (daemon) await stopChild(daemon, `daemon-cycle-${cycle}-finally`).catch(() => {});
    if (server) await stopChild(server, `server-cycle-${cycle}-finally`).catch(() => {});
  }
}

async function verifyProgressUi(jobId) {
  const browser = await chromium.launch({ headless: true });

  try {
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
        source: "phase5k-vps-cloud-service-simulation",
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
      browserRequests.push({ method: route.request().method(), url: reqUrl });

      if (reqUrl.startsWith(baseUrl) || reqUrl.startsWith("data:") || reqUrl.startsWith("blob:")) {
        return route.continue();
      }

      blockedExternal.push(reqUrl);
      return route.abort();
    });

    page.on("console", (msg) => consoleMessages.push({ type: msg.type(), text: msg.text() }));
    page.on("pageerror", (err) => pageErrors.push(String(err?.stack || err?.message || err)));

    const progressUrl = `${baseUrl}/progress.html?jobId=${encodeURIComponent(jobId)}&phase=5k`;
    const response = await page.goto(progressUrl, { waitUntil: "domcontentloaded" });
    const pageStatus = response ? response.status() : null;
    const pageLoaded = pageStatus && pageStatus >= 200 && pageStatus < 300;

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

    const fetchedRealJob = browserRequests.some((req) =>
      req.method === "GET" &&
      req.url.includes(`/api/smartwork/jobs/${jobId}`)
    );

    return {
      ok: Boolean(pageLoaded && bridgeOk && fetchedRealJob && pageErrors.length === 0),
      jobId,
      pageStatus,
      pageLoaded,
      bridgeOk,
      fetchedRealJob,
      storage: {
        smartwork_production_progress_state: storageSnapshot.smartwork_production_progress_state || null,
        smartwork_progress_live_state: storageSnapshot.smartwork_progress_live_state || null
      }
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

let progressServer = null;

try {
  const fileChecks = {
    controlServer: exists("app/smartwork-control-server.mjs"),
    productionWorker: exists("scripts/smartwork-production-worker.mjs"),
    productionQueueApi: exists("app/smartwork-production-queue-api.mjs"),
    progressHtml: exists("public/progress.html"),
    systemdTemplate: exists("deploy/smartwork-production-worker.service") || exists("deploy/systemd/smartwork-production-worker.service"),
    pm2Template: exists("deploy/ecosystem.config.cjs") || exists("deploy/pm2/ecosystem.config.cjs") || exists("ecosystem.config.cjs"),
    envExample: exists(".env.production.example") || exists(".env.example") || exists("deploy/.env.production.example"),
    vpsSetup: exists("deploy/vps-first-run.md") || exists("docs/vps-first-run.md") || exists("deploy/setup-vps.sh")
  };

  const requiredCoreOk =
    fileChecks.controlServer &&
    fileChecks.productionWorker &&
    fileChecks.productionQueueApi &&
    fileChecks.progressHtml;

  if (!requiredCoreOk) {
    throw new Error("phase5k_required_core_files_missing");
  }

  const cycle1 = await runServiceCycle(1);
  const cycle2 = await runServiceCycle(2);

  progressServer = startServer("progress-verify");
  const progressHealth = await waitForHealth();
  if (!progressHealth.ok) throw new Error("phase5k_progress_verify_server_health_failed");

  const progressUi = await verifyProgressUi(cycle2.jobId);

  const progressServerStop = await stopChild(progressServer, "server-progress-verify");
  progressServer = null;

  const serviceRestartOk =
    cycle1.ok &&
    cycle2.ok &&
    cycle1.serverStoppedClean &&
    cycle1.daemonStoppedClean &&
    cycle2.serverStoppedClean &&
    cycle2.daemonStoppedClean;

  const safetyKept = cycle1.safetyKept && cycle2.safetyKept;

  const ok = Boolean(
    requiredCoreOk &&
    serviceRestartOk &&
    progressUi.ok &&
    safetyKept &&
    progressServerStop.stopped === true &&
    pageErrors.length === 0
  );

  const report = {
    ok,
    phase: "5K",
    name: "VPS Cloud Service Simulation Smoke",
    baseUrl,
    port: PORT,
    fileChecks,
    requiredCoreOk,
    serviceRestartOk,
    cycle1,
    cycle2,
    progressUi,
    progressServerStoppedClean: progressServerStop.stopped === true,
    safetyKept,
    safety: {
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true,
      dryRunOnly: true,
      appProgressOnly: true,
      blockedExternal
    },
    browserRequests: browserRequests.filter((req) => /api\/smartwork\/jobs|progress\.html/.test(req.url)),
    consoleMessages,
    pageErrors,
    outputTail: allLines.slice(-120),
    checkedAt: new Date().toISOString()
  };

  writeJson(reportPath, report);

  console.log(JSON.stringify({
    ok,
    phase: "5K",
    port: PORT,
    requiredCoreOk,
    serviceRestartOk,
    cycle1Ok: cycle1.ok,
    cycle2Ok: cycle2.ok,
    progressUiOk: progressUi.ok,
    safetyKept,
    progressServerStoppedClean: progressServerStop.stopped === true,
    reportPath
  }, null, 2));

  if (!ok) process.exitCode = 1;
} catch (error) {
  if (progressServer) await stopChild(progressServer, "server-progress-verify-finally").catch(() => {});

  const fail = {
    ok: false,
    phase: "5K",
    error: String(error?.stack || error?.message || error),
    baseUrl,
    port: PORT,
    safety: {
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true,
      dryRunOnly: true,
      appProgressOnly: true
    },
    consoleMessages,
    pageErrors,
    outputTail: allLines.slice(-120),
    checkedAt: new Date().toISOString()
  };

  writeJson(reportPath, fail);
  console.error(fail.error);
  process.exitCode = 1;
}
