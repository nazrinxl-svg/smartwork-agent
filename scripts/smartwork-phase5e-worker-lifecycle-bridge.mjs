import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const PORT = Number(process.env.SMARTWORK_WORKER_BRIDGE_PORT || 8801);
const baseUrl = process.env.SMARTWORK_API_BASE_URL || `http://127.0.0.1:${PORT}`;
const startServer = args.has("--start-server");
const smokeMode = args.has("--smoke");

function writeJson(rel, data) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n", "utf8");
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

async function waitForHealth(lines) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const r = await fetchJson(`${baseUrl}/api/smartwork/jobs/health`);
      if (r.ok && r.json?.ok === true) return { ok: true, health: r.json };
    } catch {}
    await sleep(250);
  }

  return {
    ok: false,
    stdoutTail: lines.stdout.slice(-30),
    stderrTail: lines.stderr.slice(-30)
  };
}

async function createSmokeJob(jobId) {
  return fetchJson(`${baseUrl}/api/smartwork/jobs`, {
    method: "POST",
    body: JSON.stringify({
      id: jobId,
      source: "phase5e-worker-lifecycle-bridge",
      module: "siaga",
      agent: "siaga",
      requestType: "bulk-monthly",
      requesterName: "Phase5E Worker Smoke",
      accountRef: "phase5e-dry-run-account",
      credentialRef: "phase5e-dry-run-account",
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
    })
  });
}

async function runWorkerOnce(targetJobId = null) {
  const pending = await fetchJson(`${baseUrl}/api/smartwork/jobs/pending`);

  const items = Array.isArray(pending.json?.items) ? pending.json.items : [];
  const job =
    (targetJobId ? items.find((item) => item.id === targetJobId) : null) ||
    items.find((item) => String(item.id || "").startsWith("phase5e-worker-")) ||
    items.find((item) => String(item.id || "").startsWith("phase5d-smoke-")) ||
    null;

  if (!job?.id) {
    return {
      ok: false,
      error: "no_pending_job_for_worker",
      pendingCount: items.length
    };
  }

  const ack = await fetchJson(`${baseUrl}/api/smartwork/jobs/ack`, {
    method: "POST",
    body: JSON.stringify({
      jobId: job.id,
      workerId: "smartwork-phase5e-worker-bridge"
    })
  });

  const running = await fetchJson(`${baseUrl}/api/smartwork/jobs/${job.id}`);

  const complete = await fetchJson(`${baseUrl}/api/smartwork/jobs/complete`, {
    method: "POST",
    body: JSON.stringify({
      jobId: job.id,
      result: {
        mode: "worker-lifecycle-dry-run",
        verifiedBy: "smartwork-phase5e-worker-bridge",
        noSiagaInput: true,
        noBrowserOpen: true,
        noRealSave: true,
        noRealSend: true
      }
    })
  });

  const completed = await fetchJson(`${baseUrl}/api/smartwork/jobs/${job.id}`);

  return {
    ok:
      ack.ok &&
      ack.json?.ok === true &&
      ack.json?.to === "running" &&
      running.ok &&
      running.json?.status === "running" &&
      complete.ok &&
      complete.json?.ok === true &&
      complete.json?.to === "completed" &&
      completed.ok &&
      completed.json?.status === "completed",
    jobId: job.id,
    pending,
    ack,
    running,
    complete,
    completed,
    safetyKept:
      completed.json?.job?.safety?.noSiagaInput === true &&
      completed.json?.job?.safety?.noBrowserOpen === true &&
      completed.json?.job?.safety?.noRealSave === true &&
      completed.json?.job?.safety?.noRealSend === true
  };
}

async function main() {
  const reportPath = "reports/production-worker/phase5e-worker-lifecycle-bridge-report.json";
  const lines = { stdout: [], stderr: [] };
  let child = null;

  const report = {
    ok: false,
    mode: "SMARTWORK_PHASE5E_WORKER_LIFECYCLE_BRIDGE",
    generatedAt: new Date().toISOString(),
    baseUrl,
    startServer,
    smokeMode,
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
    if (startServer) {
      child = spawn(process.execPath, ["app/smartwork-control-server.mjs"], {
        cwd: root,
        env: {
          ...process.env,
          PORT: String(PORT),
          SMARTWORK_DRY_RUN: "true",
          SMARTWORK_NO_SIAGA_INPUT: "true",
          SMARTWORK_NO_BROWSER_OPEN: "true",
          SMARTWORK_REAL_SAVE: "false",
          SMARTWORK_REAL_SEND: "false"
        },
        stdio: ["ignore", "pipe", "pipe"]
      });

      child.stdout.on("data", (chunk) => lines.stdout.push(String(chunk).trim()));
      child.stderr.on("data", (chunk) => lines.stderr.push(String(chunk).trim()));
    }

    const health = await waitForHealth(lines);
    report.steps.health = health;
    if (!health.ok) throw new Error("worker_bridge_server_not_ready");

    const jobId = `phase5e-worker-${Date.now()}`;

    if (smokeMode) {
      report.steps.createSmokeJob = await createSmokeJob(jobId);
      if (!report.steps.createSmokeJob.ok || report.steps.createSmokeJob.json?.ok !== true) {
        throw new Error("worker_bridge_create_smoke_job_failed");
      }
    }

    report.steps.workerOnce = await runWorkerOnce(smokeMode ? jobId : null);

    report.assertions = {
      healthOk: report.steps.health.ok === true,
      createSmokeJobOk: !smokeMode || report.steps.createSmokeJob?.json?.ok === true,
      workerOnceOk: report.steps.workerOnce?.ok === true,
      safetyKept: report.steps.workerOnce?.safetyKept === true
    };

    report.ok = Object.values(report.assertions).every(Boolean);
    report.next = report.ok
      ? "Worker lifecycle bridge works. Next: app progress bridge reads production job status."
      : "Fix worker lifecycle bridge before app progress bridge.";

    writeJson(reportPath, report);
    console.log(JSON.stringify(report, null, 2));

    if (!report.ok) process.exitCode = 2;
  } catch (error) {
    report.ok = false;
    report.error = { message: error?.message || String(error) };
    report.stdoutTail = lines.stdout.slice(-50);
    report.stderrTail = lines.stderr.slice(-50);
    report.next = "Fix Phase 5E worker lifecycle bridge.";
    writeJson(reportPath, report);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 2;
  } finally {
    if (child) {
      try { child.kill("SIGTERM"); } catch {}
    }
  }
}

await main();
