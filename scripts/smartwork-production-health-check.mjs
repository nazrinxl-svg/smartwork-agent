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
  } catch {
    return null;
  }
}

function countJson(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return 0;
  return fs.readdirSync(full).filter((x) => x.endsWith(".json")).length;
}

const config = readJson("configs/smartwork-production-worker.config.json") ?? {};
const queue = config.queue ?? {
  pendingDir: "data/production-queue/pending",
  runningDir: "data/production-queue/running",
  completedDir: "data/production-queue/completed",
  failedDir: "data/production-queue/failed"
};

const checks = {
  serviceRunnerMemory: exists("memory/SMARTWORK_PRODUCTION_SERVICE_RUNNER.md"),
  systemdTemplate: exists("deploy/systemd/smartwork-production-worker.service"),
  pm2Template: exists("deploy/pm2/ecosystem.config.cjs"),
  vpsSetupTemplate: exists("deploy/vps/setup-smartwork-worker.sh"),
  workerScript: exists("scripts/smartwork-production-worker.mjs"),
  config: exists("configs/smartwork-production-worker.config.json")
};

const ok = Object.values(checks).every(Boolean);

const report = {
  ok,
  mode: "SMARTWORK_PRODUCTION_HEALTH_CHECK",
  generatedAt: new Date().toISOString(),
  checks,
  queueCounts: {
    pending: countJson(queue.pendingDir),
    running: countJson(queue.runningDir),
    completed: countJson(queue.completedDir),
    failed: countJson(queue.failedDir)
  },
  noSiagaInput: true,
  next: ok ? "Service scaffold health OK. Next VPS dry-run deployment." : "Fix missing files."
};

fs.mkdirSync(path.join(root, "reports/production-worker"), { recursive: true });
fs.writeFileSync(
  path.join(root, "reports/production-worker/production-health-check-report.json"),
  JSON.stringify(report, null, 2) + "\n",
  "utf8"
);

console.log(JSON.stringify(report, null, 2));
if (!ok) process.exit(2);
