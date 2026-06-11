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

const requiredFiles = {
  phase4Memory: "memory/SMARTWORK_PHASE4_VPS_FIRST_RUN.md",
  vpsTargetExample: "configs/smartwork-vps-target.example.json",
  firstRunCommands: "deploy/vps/FIRST_RUN_COMMANDS.md",
  envGuardScript: "scripts/smartwork-production-env-guard.mjs",
  productionWorker: "scripts/smartwork-production-worker.mjs",
  queueConnector: "scripts/smartwork-cloud-queue-connector.mjs",
  deployCheck: "scripts/smartwork-vps-dry-run-deploy-check.mjs",
  systemd: "deploy/systemd/smartwork-production-worker.service",
  pm2: "deploy/pm2/ecosystem.config.cjs"
};

const fileChecks = Object.fromEntries(
  Object.entries(requiredFiles).map(([key, rel]) => [key, exists(rel)])
);

const reports = {
  envGuard: readJson("reports/production-worker/production-env-guard-report.json"),
  prodBrain: readJson("reports/production-worker/production-brain-check-report.json"),
  health: readJson("reports/production-worker/production-health-check-report.json"),
  queue: readJson("reports/production-worker/cloud-queue-connector-report.json"),
  deploy: readJson("reports/production-worker/vps-dry-run-deploy-check-report.json")
};

const reportChecks = {
  envGuardOk: reports.envGuard?.ok === true,
  prodBrainOk: reports.prodBrain?.ok === true,
  healthOk: reports.health?.ok === true,
  queueOk: reports.queue?.ok === true,
  deployOk: reports.deploy?.ok === true
};

const safety = {
  dryRun: process.env.SMARTWORK_DRY_RUN !== "false",
  realSaveDisabled: process.env.SMARTWORK_REAL_SAVE_ENABLED !== "true",
  realSendDisabled: process.env.SMARTWORK_REAL_SEND_ENABLED !== "true",
  noSiagaInput: true,
  noBrowserOpen: true
};

const ok =
  Object.values(fileChecks).every(Boolean) &&
  Object.values(reportChecks).every(Boolean) &&
  safety.dryRun &&
  safety.realSaveDisabled &&
  safety.realSendDisabled;

const report = {
  ok,
  mode: "SMARTWORK_VPS_FIRST_RUN_VALIDATOR",
  generatedAt: new Date().toISOString(),
  fileChecks,
  reportChecks,
  safety,
  firstRun: {
    target: "/opt/smartwork-agent",
    service: "smartwork-production-worker",
    mode: "dry-run"
  },
  next: ok
    ? "VPS first-run dry-run validator is ready."
    : "Fix first-run readiness before VPS execution."
};

writeJson("reports/production-worker/vps-first-run-validator-report.json", report);
console.log(JSON.stringify(report, null, 2));

if (!ok) process.exit(2);
