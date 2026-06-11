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

function writeJson(rel, data) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n", "utf8");
}

const required = {
  productionBlueprint: "memory/SMARTWORK_PRODUCTION_WORKER_BLUEPRINT.md",
  serviceRunner: "memory/SMARTWORK_PRODUCTION_SERVICE_RUNNER.md",
  phase3: "memory/SMARTWORK_PHASE3_VPS_QUEUE_CONNECTOR.md",
  prodConfig: "configs/smartwork-production-worker.config.json",
  queueConfig: "configs/smartwork-cloud-queue.config.json",
  envExample: "configs/.env.production.example",
  worker: "scripts/smartwork-production-worker.mjs",
  health: "scripts/smartwork-production-health-check.mjs",
  queueConnector: "scripts/smartwork-cloud-queue-connector.mjs",
  systemd: "deploy/systemd/smartwork-production-worker.service",
  pm2: "deploy/pm2/ecosystem.config.cjs",
  vpsSetup: "deploy/vps/setup-smartwork-worker.sh",
  checklist: "deploy/vps/DRY_RUN_DEPLOYMENT_CHECKLIST.md"
};

const checks = Object.fromEntries(
  Object.entries(required).map(([key, rel]) => [key, exists(rel)])
);

const prodBrain = readJson("reports/production-worker/production-brain-check-report.json");
const health = readJson("reports/production-worker/production-health-check-report.json");
const queue = readJson("reports/production-worker/cloud-queue-connector-report.json");

const reportChecks = {
  prodBrainOk: prodBrain?.ok === true,
  healthOk: health?.ok === true,
  queueConnectorOk: queue?.ok === true,
  queueSafe: queue?.safety?.noSiagaInput === true && queue?.safety?.noBrowserOpen === true
};

const envSafety = {
  dryRun: process.env.SMARTWORK_DRY_RUN !== "false",
  realSaveDisabled: process.env.SMARTWORK_REAL_SAVE_ENABLED !== "true",
  realSendDisabled: process.env.SMARTWORK_REAL_SEND_ENABLED !== "true"
};

const ok =
  Object.values(checks).every(Boolean) &&
  Object.values(reportChecks).every(Boolean) &&
  Object.values(envSafety).every(Boolean);

const report = {
  ok,
  mode: "SMARTWORK_VPS_DRY_RUN_DEPLOY_CHECK",
  generatedAt: new Date().toISOString(),
  checks,
  reportChecks,
  envSafety,
  target: {
    appDir: "/opt/smartwork-agent",
    service: "smartwork-production-worker",
    firstMode: "dry-run"
  },
  noSiagaInput: true,
  next: ok
    ? "VPS dry-run deployment scaffold is ready."
    : "Fix missing readiness items before VPS provisioning."
};

writeJson("reports/production-worker/vps-dry-run-deploy-check-report.json", report);
console.log(JSON.stringify(report, null, 2));

if (!ok) process.exit(2);
