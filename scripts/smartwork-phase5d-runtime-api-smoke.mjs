import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const root = process.cwd();
const PORT = Number(process.env.SMARTWORK_SMOKE_PORT || 8799);
const baseUrl = `http://127.0.0.1:${PORT}`;

function writeJson(rel, data) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { ok: false, raw: text };
  }

  return {
    ok: res.ok,
    status: res.status,
    json,
    text
  };
}

async function waitForServer(stdoutLines, stderrLines) {
  const startedAt = Date.now();

  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetchJson(`${baseUrl}/api/smartwork/jobs/health`);
      if (r.ok && r.json?.ok === true) {
        return {
          ok: true,
          health: r.json,
          waitedMs: Date.now() - startedAt
        };
      }
    } catch {}

    await sleep(250);
  }

  return {
    ok: false,
    waitedMs: Date.now() - startedAt,
    stdoutTail: stdoutLines.slice(-40),
    stderrTail: stderrLines.slice(-40)
  };
}

async function main() {
  const reportPath = "reports/production-worker/phase5d-runtime-api-smoke-report.json";
  const stdoutLines = [];
  const stderrLines = [];

  const env = {
    ...process.env,
    PORT: String(PORT),
    SMARTWORK_DRY_RUN: "true",
    SMARTWORK_NO_SIAGA_INPUT: "true",
    SMARTWORK_NO_BROWSER_OPEN: "true",
    SMARTWORK_REAL_SAVE: "false",
    SMARTWORK_REAL_SEND: "false"
  };

  const child = spawn(process.execPath, ["app/smartwork-control-server.mjs"], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    stdoutLines.push(String(chunk).trim());
  });

  child.stderr.on("data", (chunk) => {
    stderrLines.push(String(chunk).trim());
  });

  const smoke = {
    ok: false,
    mode: "SMARTWORK_PHASE5D_RUNTIME_API_SMOKE",
    generatedAt: new Date().toISOString(),
    baseUrl,
    port: PORT,
    safety: {
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true,
      dryRunOnly: true
    },
    steps: {}
  };

  try {
    const ready = await waitForServer(stdoutLines, stderrLines);
    smoke.steps.serverReady = ready;

    if (!ready.ok) {
      throw new Error("server_not_ready");
    }

    const jobId = `phase5d-smoke-${Date.now()}`;

    const payload = {
      id: jobId,
      source: "phase5d-runtime-api-smoke",
      module: "siaga",
      agent: "siaga",
      requestType: "bulk-monthly",
      requesterName: "Phase5D Smoke",
      email: "",
      whatsapp: "",
      accountRef: "phase5d-dry-run-account",
      credentialRef: "phase5d-dry-run-account",
      requestRange: {
        startDate: "2026-06-22",
        endDate: "2026-06-27"
      },
      delivery: {
        mode: "app_download_only"
      },
      safety: {
        dryRun: true,
        noRealSave: true,
        noRealSend: true,
        noSiagaInput: true,
        noBrowserOpen: true,
        rawPasswordStored: false
      }
    };

    const create = await fetchJson(`${baseUrl}/api/smartwork/jobs`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    smoke.steps.createJob = create;

    const readPending = await fetchJson(`${baseUrl}/api/smartwork/jobs/${jobId}`);
    smoke.steps.readPending = readPending;

    const pendingList = await fetchJson(`${baseUrl}/api/smartwork/jobs/pending`);
    smoke.steps.pendingList = {
      ok: pendingList.ok,
      status: pendingList.status,
      containsJob: Array.isArray(pendingList.json?.items)
        ? pendingList.json.items.some((item) => item.id === jobId)
        : false,
      count: pendingList.json?.count ?? null
    };

    const ack = await fetchJson(`${baseUrl}/api/smartwork/jobs/ack`, {
      method: "POST",
      body: JSON.stringify({
        jobId,
        workerId: "phase5d-smoke-worker"
      })
    });
    smoke.steps.ackJob = ack;

    const readRunning = await fetchJson(`${baseUrl}/api/smartwork/jobs/${jobId}`);
    smoke.steps.readRunning = readRunning;

    const complete = await fetchJson(`${baseUrl}/api/smartwork/jobs/complete`, {
      method: "POST",
      body: JSON.stringify({
        jobId,
        result: {
          mode: "dry-run",
          verifiedBy: "phase5d-runtime-api-smoke",
          noSiagaInput: true,
          noBrowserOpen: true
        }
      })
    });
    smoke.steps.completeJob = complete;

    const readCompleted = await fetchJson(`${baseUrl}/api/smartwork/jobs/${jobId}`);
    smoke.steps.readCompleted = readCompleted;

    smoke.files = {
      pendingExists: exists(`data/production-queue/pending/${jobId}.json`),
      runningExists: exists(`data/production-queue/running/${jobId}.json`),
      completedExists: exists(`data/production-queue/completed/${jobId}.json`),
      failedExists: exists(`data/production-queue/failed/${jobId}.json`)
    };

    smoke.assertions = {
      healthOk: ready.health?.ok === true,
      createOk: create.ok && create.json?.ok === true && create.json?.jobId === jobId,
      pendingReadOk: readPending.ok && readPending.json?.status === "pending",
      pendingListContainsJob: smoke.steps.pendingList.containsJob === true,
      ackOk: ack.ok && ack.json?.ok === true && ack.json?.to === "running",
      runningReadOk: readRunning.ok && readRunning.json?.status === "running",
      completeOk: complete.ok && complete.json?.ok === true && complete.json?.to === "completed",
      completedReadOk: readCompleted.ok && readCompleted.json?.status === "completed",
      completedFileExists: smoke.files.completedExists === true,
      removedFromPendingAndRunning: smoke.files.pendingExists === false && smoke.files.runningExists === false,
      safetyKept:
        readCompleted.json?.job?.safety?.noSiagaInput === true &&
        readCompleted.json?.job?.safety?.noBrowserOpen === true &&
        readCompleted.json?.job?.safety?.noRealSave === true &&
        readCompleted.json?.job?.safety?.noRealSend === true
    };

    smoke.ok = Object.values(smoke.assertions).every(Boolean);
    smoke.next = smoke.ok
      ? "Runtime queue lifecycle works. Next: worker lifecycle bridge / app progress bridge."
      : "Fix runtime queue lifecycle before proceeding.";

    writeJson(reportPath, smoke);
    console.log(JSON.stringify(smoke, null, 2));

    if (!smoke.ok) process.exitCode = 2;
  } catch (error) {
    smoke.ok = false;
    smoke.error = {
      message: error?.message || String(error)
    };
    smoke.stdoutTail = stdoutLines.slice(-60);
    smoke.stderrTail = stderrLines.slice(-60);
    smoke.next = "Fix runtime API smoke test.";
    writeJson(reportPath, smoke);
    console.log(JSON.stringify(smoke, null, 2));
    process.exitCode = 2;
  } finally {
    try {
      child.kill("SIGTERM");
    } catch {}
  }
}

await main();
