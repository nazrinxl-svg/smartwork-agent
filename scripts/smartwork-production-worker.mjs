import fs from "fs";
import path from "path";

const root = process.cwd();
const args = new Set(process.argv.slice(2));

const once = args.has("--once");
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
    return;
  }

  const jobPath = pending[0];
  const job = readJson(jobPath);
  const validation = validateJob(job);

  const report = createReport({
    status: dryRun ? "dry_run_job_detected" : "job_detected",
    selectedJobPath: jobPath,
    selectedJob: job,
    validation,
    next: validation.ok
      ? "route_to_module_worker_in_next_phase"
      : "fix_job_schema_before_running"
  });

  writeJson("reports/production-worker/production-worker-report.json", report);
  console.log(JSON.stringify(report, null, 2));

  if (!validation.ok) process.exitCode = 2;
}

await tick();

if (!once) {
  console.log("Production worker foundation skeleton is currently dry-run. Use --once --dry-run for diagnostics.");
}
