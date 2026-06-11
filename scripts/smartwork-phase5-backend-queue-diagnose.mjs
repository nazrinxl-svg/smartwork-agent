import fs from "fs";
import path from "path";

const root = process.cwd();

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function readText(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return "";
  return fs.readFileSync(full, "utf8");
}

function writeJson(rel, data) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function extractLines(text, regex) {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter((item) => regex.test(item.text))
    .slice(0, 80);
}

function fileInfo(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return { exists: false };

  const text = readText(rel);

  return {
    exists: true,
    bytes: Buffer.byteLength(text, "utf8"),
    hasFetch: text.includes("fetch("),
    hasLocalStorage: text.includes("localStorage"),
    hasSmartworkRequest: text.includes("smartwork_request"),
    hasProductionQueue: text.includes("production-queue"),
    hasApiSmartwork: text.includes("/api/smartwork"),
    routeLines: extractLines(text, /app\.(get|post|put|delete|patch)\s*\(/),
    apiLines: extractLines(text, /\/api\/smartwork|production-queue|intake|request|progress|history|artifact/i)
  };
}

const files = {
  server: "app/smartwork-control-server.mjs",
  requestPage: "public/request.html",
  progressPage: "public/progress.html",
  historyPage: "public/history.html",
  homePage: "public/home.html",
  productionWorker: "scripts/smartwork-production-worker.mjs",
  cloudQueueConnector: "scripts/smartwork-cloud-queue-connector.mjs",
  cloudQueueConfig: "configs/smartwork-cloud-queue.config.json",
  productionWorkerConfig: "configs/smartwork-production-worker.config.json"
};

const info = Object.fromEntries(
  Object.entries(files).map(([key, rel]) => [key, { path: rel, ...fileInfo(rel) }])
);

const serverText = readText(files.server);

const existingApiSurface = {
  hasServer: exists(files.server),
  hasApiSmartworkJobs: serverText.includes("/api/smartwork/jobs"),
  hasApiSmartworkRequests: serverText.includes("/api/smartwork/requests"),
  hasApiSmartworkProgress: serverText.includes("/api/smartwork/progress"),
  hasApiSmartworkHistory: serverText.includes("/api/smartwork/history"),
  hasQueuePending: serverText.includes("production-queue/pending") || serverText.includes("data/production-queue/pending"),
  hasBodyParser: serverText.includes("express.json") || serverText.includes("bodyParser"),
  hasStaticPublic: serverText.includes("express.static") || serverText.includes("public")
};

const phase5Need = {
  queueContractSchema: !exists("configs/smartwork-production-job.schema.json"),
  backendCreateJobEndpoint: !existingApiSurface.hasApiSmartworkJobs,
  backendJobStatusEndpoint: !existingApiSurface.hasApiSmartworkJobs,
  appSubmitBridge: true,
  workerLifecycleBridge: true,
  noSiagaInput: true
};

const recommendedNextPatch = [
  "Add production job schema config.",
  "Add backend local-file queue helper module.",
  "Add guarded API routes: POST /api/smartwork/jobs, GET /api/smartwork/jobs/:id, GET /api/smartwork/jobs.",
  "Keep all routes dry-run and app_download_only.",
  "Do not change SIAGA runner yet."
];

const report = {
  ok: true,
  mode: "SMARTWORK_PHASE5_BACKEND_QUEUE_DIAGNOSIS",
  generatedAt: new Date().toISOString(),
  branchHint: "test/ui-request-next-20260611-004522",
  phase: "5A-backend-queue-diagnosis-only",
  files: info,
  existingApiSurface,
  phase5Need,
  recommendedNextPatch,
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    diagnosisOnly: true
  },
  next: "Patch backend production queue API skeleton only after reviewing this report."
};

writeJson("reports/production-worker/phase5-backend-queue-diagnosis-report.json", report);

console.log(JSON.stringify(report, null, 2));
