import fs from "fs";
import path from "path";

const root = process.cwd();

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

function listJsonFiles(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(rel, name).replaceAll("\\", "/"))
    .sort();
}

function safeJobSummary(job) {
  if (!job || typeof job !== "object") return null;
  return {
    id: job.id ?? null,
    module: job.module ?? null,
    mode: job.mode ?? null,
    accountRef: job.accountRef ?? null,
    requestRange: job.requestRange ?? null,
    deliveryMode: job.delivery?.mode ?? null,
    dryRun: job.safety?.dryRun ?? null,
    noRealSave: job.safety?.noRealSave ?? null,
    noSiagaInput: job.safety?.noSiagaInput ?? null
  };
}

const config = readJson("configs/smartwork-cloud-queue.config.json") ?? {};
const provider = config.provider ?? "local-file";
const dryRun = config.mode !== "live" || process.env.SMARTWORK_DRY_RUN !== "false";

const local = config.localFile ?? {
  pendingDir: "data/production-queue/pending",
  runningDir: "data/production-queue/running",
  completedDir: "data/production-queue/completed",
  failedDir: "data/production-queue/failed"
};

const httpApi = config.httpApi ?? {};
const pendingFiles = listJsonFiles(local.pendingDir);

const jobs = pendingFiles.map((rel) => ({
  path: rel,
  job: safeJobSummary(readJson(rel))
}));

const httpReady =
  httpApi.enabled === true &&
  Boolean(process.env[httpApi.baseUrlEnv ?? "SMARTWORK_API_BASE_URL"]) &&
  Boolean(process.env[httpApi.tokenEnv ?? "SMARTWORK_WORKER_TOKEN"]);

const report = {
  ok: true,
  mode: "SMARTWORK_CLOUD_QUEUE_CONNECTOR",
  generatedAt: new Date().toISOString(),
  provider,
  dryRun,
  localFile: {
    pendingDir: local.pendingDir,
    pendingCount: pendingFiles.length,
    jobs
  },
  httpApi: {
    enabled: httpApi.enabled === true,
    ready: httpReady,
    note: httpApi.enabled === true
      ? "HTTP queue configured but not called in dry-run connector check."
      : "HTTP queue disabled; using local-file dry-run queue."
  },
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: process.env.SMARTWORK_REAL_SAVE_ENABLED !== "true",
    noRealSend: process.env.SMARTWORK_REAL_SEND_ENABLED !== "true"
  },
  next: "When backend API is ready, enable httpApi and keep SMARTWORK_DRY_RUN=true for first VPS test."
};

writeJson("reports/production-worker/cloud-queue-connector-report.json", report);
console.log(JSON.stringify(report, null, 2));

if (!report.safety.noRealSave || !report.safety.noRealSend) process.exit(2);
