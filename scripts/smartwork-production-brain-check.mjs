import fs from "fs";
import path from "path";

const root = process.cwd();

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function readJson(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    return { __error: error.message };
  }
}

function listDir(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full);
}

const requiredFiles = [
  "memory/SMARTWORK_PRODUCTION_WORKER_BLUEPRINT.md",
  "memory/smartwork-production-worker-blueprint.json",
  "configs/smartwork-production-worker.config.json",
  "configs/.env.production.example",
  "scripts/smartwork-production-worker.mjs"
];

const requiredDirs = [
  "data/production-queue/pending",
  "data/production-queue/running",
  "data/production-queue/completed",
  "data/production-queue/failed",
  "reports/production-worker",
  "artifacts/production"
];

const app = readJson("reports/smartwork-app-artifacts-report.json");
const direction = readJson("memory/smartwork-agent-brain-direction-lock.json");
const blueprint = readJson("memory/smartwork-production-worker-blueprint.json");
const config = readJson("configs/smartwork-production-worker.config.json");

const missingFiles = requiredFiles.filter((f) => !exists(f));
const missingDirs = requiredDirs.filter((d) => !exists(d));

const localCheckpointOk =
  app?.ok === true &&
  Number(app?.percent ?? app?.progressPercent ?? app?.progress?.percent) === 100;

const directionOk =
  direction?.finalTarget?.includes("24/7") ||
  direction?.finalTarget?.includes("cloud");

const blueprintOk =
  blueprint?.finalTarget?.includes("24/7") &&
  blueprint?.phase === "production-worker-foundation";

const configOk =
  config?.runtime === "production-worker" &&
  config?.safety?.dryRunDefault === true;

const ok =
  missingFiles.length === 0 &&
  missingDirs.length === 0 &&
  localCheckpointOk &&
  directionOk &&
  blueprintOk &&
  configOk;

const report = {
  ok,
  mode: "SMARTWORK_PRODUCTION_BRAIN_CHECK",
  generatedAt: new Date().toISOString(),
  phase: "production-worker-foundation",
  checks: {
    requiredFiles: missingFiles.length === 0,
    requiredDirs: missingDirs.length === 0,
    localCheckpointOk,
    directionOk,
    blueprintOk,
    configOk
  },
  missingFiles,
  missingDirs,
  queueCounts: {
    pending: listDir("data/production-queue/pending").length,
    running: listDir("data/production-queue/running").length,
    completed: listDir("data/production-queue/completed").length,
    failed: listDir("data/production-queue/failed").length
  },
  nextStep: ok
    ? "Production worker foundation is ready. Next: build service runner/VPS deployment."
    : "Fix missing production foundation parts before VPS deployment.",
  noSiagaInput: true
};

fs.mkdirSync(path.join(root, "reports/production-worker"), { recursive: true });
fs.writeFileSync(
  path.join(root, "reports/production-worker/production-brain-check-report.json"),
  JSON.stringify(report, null, 2) + "\n",
  "utf8"
);

console.log(JSON.stringify(report, null, 2));

if (!ok) process.exit(2);
