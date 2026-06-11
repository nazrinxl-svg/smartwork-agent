import fs from "fs";
import path from "path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));

const once = args.has("--once");
const daemon = args.has("--daemon");
const dryRun = args.has("--dry-run") || process.env.SMARTWORK_DRY_RUN !== "false";

function readJson(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    return { __error: error.message };
  }
}

function writeJson(rel, data) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function ensureDir(rel) {
  fs.mkdirSync(path.join(root, rel), { recursive: true });
}

function listJsonFiles(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(rel, name).replaceAll("\\", "/"))
    .sort();
}

function nowIso() {
  return new Date().toISOString();
}

const config = readJson("configs/smartwork-production-worker.config.json") ?? {};

const queue = {
  pending: config?.queue?.pendingDir ?? "data/production-queue/pending",
  running: config?.queue?.runningDir ?? "data/production-queue/running",
  completed: config?.queue?.completedDir ?? "data/production-queue/completed",
  failed: config?.queue?.failedDir ?? "data/production-queue/failed"
};

for (const dir of Object.values(queue)) ensureDir(dir);
ensureDir("reports/production-worker");
ensureDir("artifacts/production");

function validateJob(job) {
  const errors = [];

  if (!job || typeof job !== "object") errors.push("job_not_object");
  if (!job?.id) errors.push("missing_id");
  if (!job?.module) errors.push("missing_module");
  if (!job?.requestRange?.startDate) errors.push("missing_startDate");
  if (!job?.requestRange?.endDate) errors.push("missing_endDate");

  const supportedModules = ["siaga", "ekinerja"];
  if (job?.module && !supportedModules.includes(String(job.module).toLowerCase())) {
    errors.push("unsupported_module");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}


/* SMARTWORK_PHASE5J_DRY_RUN_LIFECYCLE_V1 */
function phase5jAtomicWriteJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2));
  fs.renameSync(tmpPath, filePath);
}

function phase5jMoveJsonJob(fromPath, toDir, patch = {}) {
  ensureDir(toDir);

  const current = readJson(fromPath);
  const now = new Date().toISOString();
  const next = {
    ...current,
    ...patch,
    id: current?.id || path.basename(fromPath, ".json"),
    updatedAt: now
  };

  const toPath = path.join(toDir, `${next.id}.json`);
  phase5jAtomicWriteJson(toPath, next);

  if (fs.existsSync(fromPath)) {
    fs.unlinkSync(fromPath);
  }

  return {
    fromPath,
    toPath,
    job: next
  };
}

function phase5jCanCompleteDryRunJob(job) {
  const safety = job?.safety || {};
  const dryRunOk =
    job?.dryRun === true ||
    job?.mode === "dry-run" ||
    job?.mode === "dry-run-daemon-smoke" ||
    safety.dryRun === true ||
    process.env.SMARTWORK_DRY_RUN === "true";

  return Boolean(
    dryRunOk &&
    safety.noSiagaInput === true &&
    safety.noBrowserOpen === true &&
    safety.noRealSave === true &&
    safety.noRealSend === true
  );
}

function phase5jCompleteDryRunJob(jobPath) {
  const job = readJson(jobPath);
  const now = new Date().toISOString();

  if (!phase5jCanCompleteDryRunJob(job)) {
    const failed = phase5jMoveJsonJob(jobPath, queue.failed, {
      status: "failed",
      error: "dry_run_safety_flags_missing",
      progress: {
        percent: 0,
        stage: "failed",
        message: "Dry-run worker refused job because safety flags were incomplete."
      },
      safety: {
        ...(job?.safety || {}),
        noSiagaInput: true,
        noBrowserOpen: true,
        noRealSave: true,
        noRealSend: true
      },
      failedAt: now
    });

    return {
      ok: false,
      status: "dry_run_job_refused",
      reason: "dry_run_safety_flags_missing",
      ...failed
    };
  }

  const running = phase5jMoveJsonJob(jobPath, queue.running, {
    status: "running",
    phase: "running",
    state: "running",
    progress: {
      percent: 50,
      stage: "running",
      message: "Production worker dry-run lifecycle started. No SIAGA input, no browser, no real save/send."
    },
    safety: {
      ...(job.safety || {}),
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true,
      dryRun: true,
      rawPasswordStored: false
    },
    startedAt: now
  });

  const completed = phase5jMoveJsonJob(running.toPath, queue.completed, {
    status: "completed",
    phase: "completed",
    state: "completed",
    progress: {
      percent: 100,
      stage: "completed",
      message: "Production worker dry-run lifecycle completed. App progress only."
    },
    percent: 100,
    progressPercent: 100,
    percentage: 100,
    summary: {
      total: 1,
      completed: 1,
      alreadyFilled: 1,
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
      ...(running.job.safety || {}),
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true,
      dryRun: true,
      rawPasswordStored: false
    },
    completedAt: new Date().toISOString()
  });

  return {
    ok: true,
    status: "dry_run_job_completed",
    fromPath: jobPath,
    runningPath: running.toPath,
    completedPath: completed.toPath,
    job: completed.job
  };
}
/* END_SMARTWORK_PHASE5J_DRY_RUN_LIFECYCLE_V1 */

function createReport(extra = {}) {
  const pending = listJsonFiles(queue.pending);
  const running = listJsonFiles(queue.running);
  const completed = listJsonFiles(queue.completed);
  const failed = listJsonFiles(queue.failed);

  return {
    ok: true,
    mode: "SMARTWORK_PRODUCTION_WORKER",
    dryRun,
    once,
    generatedAt: nowIso(),
    queue,
    counts: {
      pending: pending.length,
      running: running.length,
      completed: completed.length,
      failed: failed.length
    },
    safety: {
      noSiagaInput: true,
      noBrowserOpen: true,
      dryRunDefault: true,
      realSaveEnabled: process.env.SMARTWORK_REAL_SAVE_ENABLED === "true"
    },
    ...extra
  };
}

async function tick() {
  const pending = listJsonFiles(queue.pending);

  if (pending.length === 0) {
    const report = createReport({
      status: "idle_no_pending_jobs",
      next: "waiting_for_backend_queue_job"
    });

    writeJson("reports/production-worker/production-worker-report.json", report);
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  if (!dryRun) {
    const jobPath = pending[0];
    const job = readJson(jobPath);
    const validation = validateJob(job);

    const report = createReport({
      status: "job_detected",
      selectedJobPath: jobPath,
      selectedJob: job,
      validation,
      next: validation.ok ? "route_to_module_worker_in_next_phase" : "fix_job_schema_before_running"
    });

    writeJson("reports/production-worker/production-worker-report.json", report);
    console.log(JSON.stringify(report, null, 2));

    if (!validation.ok) process.exitCode = 2;
    return report;
  }

  const processed = [];
  let invalidCount = 0;

  for (const jobPath of pending) {
    const job = readJson(jobPath);
    const validation = validateJob(job);

    if (!validation.ok) {
      invalidCount += 1;
      processed.push({
        ok: false,
        status: "invalid_job_schema",
        jobPath,
        jobId: job?.id || path.basename(jobPath, ".json"),
        validation
      });
      continue;
    }

    const lifecycle = phase5jCompleteDryRunJob(jobPath);
    processed.push({
      ok: lifecycle.ok === true,
      status: lifecycle.status,
      jobPath,
      jobId: lifecycle.job?.id || job?.id || path.basename(jobPath, ".json"),
      validation,
      lifecycle
    });
  }

  const first = processed[0] || null;
  const completedCount = processed.filter((item) => item.status === "dry_run_job_completed").length;
  const refusedCount = processed.filter((item) => item.status === "dry_run_job_refused").length;

  const report = createReport({
    status: invalidCount > 0 ? "dry_run_batch_completed_with_invalid_jobs" : "dry_run_batch_completed",
    selectedJobPath: first?.jobPath || null,
    selectedJob: first?.lifecycle?.job || null,
    validation: first?.validation || null,
    processed,
    processedCount: processed.length,
    completedCount,
    refusedCount,
    invalidCount,
    lifecycle: first?.lifecycle || null,
    next: invalidCount > 0
      ? "fix_invalid_job_schema"
      : "dry_run_jobs_completed_safely"
  });

  writeJson("reports/production-worker/production-worker-report.json", report);
  console.log(JSON.stringify(report, null, 2));

  if (invalidCount > 0) process.exitCode = 2;
  return report;
}
if (daemon) {
  const intervalMs = Number(process.env.SMARTWORK_WORKER_INTERVAL_MS ?? 15000);

  writeJson("reports/production-worker/production-worker-daemon-state.json", {
    ok: true,
    mode: "SMARTWORK_PRODUCTION_WORKER_DAEMON_START",
    dryRun,
    intervalMs,
    startedAt: nowIso(),
    noSiagaInput: true
  });

  await tick();

  setInterval(() => {
    tick().catch((error) => {
      writeJson("reports/production-worker/production-worker-error-report.json", {
        ok: false,
        mode: "SMARTWORK_PRODUCTION_WORKER_DAEMON_ERROR",
        message: error?.message ?? String(error),
        generatedAt: nowIso(),
        noSiagaInput: true
      });
      console.error(error);
    });
  }, intervalMs);
} else {
  await tick();
}

if (!once) {
  console.log("Production worker foundation skeleton is currently dry-run. Use --once --dry-run for diagnostics.");
}
