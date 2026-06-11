import fs from "fs";
import path from "path";

const root = process.cwd();
const reportPath = path.join(root, "reports", "phase5l-production-deployment-pack-finalizer-report.json");

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  const file = path.join(root, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function has(rel, text) {
  return read(rel).includes(text);
}

const files = {
  readme: "deploy/production-pack/README.md",
  envDryRun: "deploy/production-pack/.env.production.dry-run.example",
  pm2: "deploy/production-pack/pm2.ecosystem.config.cjs",
  serverSystemd: "deploy/production-pack/smartwork-control-server.service",
  workerSystemd: "deploy/production-pack/smartwork-production-worker.service",
  firstRun: "deploy/production-pack/first-run-dry-run.sh",
  controlServer: "app/smartwork-control-server.mjs",
  worker: "scripts/smartwork-production-worker.mjs",
  queueApi: "app/smartwork-production-queue-api.mjs",
  progressHtml: "public/progress.html"
};

const checks = {
  allPackFilesExist: Object.values(files).every(exists),
  readmeHasFirstRun: has(files.readme, "First Run VPS Dry-Run"),
  readmeHasRollback: has(files.readme, "Rollback"),
  envLocksDryRun: has(files.envDryRun, "SMARTWORK_DRY_RUN=true"),
  envLocksNoSiaga: has(files.envDryRun, "SMARTWORK_NO_SIAGA_INPUT=true"),
  envLocksNoBrowser: has(files.envDryRun, "SMARTWORK_NO_BROWSER_OPEN=true"),
  envLocksNoRealSave: has(files.envDryRun, "SMARTWORK_NO_REAL_SAVE=true"),
  envLocksNoRealSend: has(files.envDryRun, "SMARTWORK_NO_REAL_SEND=true"),
  pm2HasServer: has(files.pm2, "smartwork-control-server"),
  pm2HasWorker: has(files.pm2, "smartwork-production-worker"),
  pm2WorkerDaemonDryRun: has(files.pm2, "--daemon --dry-run"),
  systemdServerSafe: has(files.serverSystemd, "SMARTWORK_DRY_RUN=true") && has(files.serverSystemd, "SMARTWORK_NO_REAL_SAVE=true"),
  systemdWorkerSafe: has(files.workerSystemd, "SMARTWORK_DRY_RUN=true") && has(files.workerSystemd, "--daemon --dry-run"),
  firstRunHasVerifier: has(files.firstRun, "prod:deployment-pack:verify"),
  firstRunHasHealthcheck: has(files.firstRun, "/api/smartwork/jobs/health"),
  controlServerExists: exists(files.controlServer),
  workerExists: exists(files.worker),
  queueApiExists: exists(files.queueApi),
  progressHtmlExists: exists(files.progressHtml)
};

const ok = Object.values(checks).every(Boolean);

const report = {
  ok,
  phase: "5L",
  name: "Production Deployment Pack Finalizer",
  files,
  checks,
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    dryRunOnly: true,
    noRealDeploy: true,
    staticPackOnly: true
  },
  next: ok
    ? "Deployment pack is ready for VPS dry-run copy/start simulation."
    : "Fix missing deployment pack checks before VPS dry-run.",
  generatedAt: new Date().toISOString()
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok,
  phase: "5L",
  next: report.next,
  checks,
  reportPath
}, null, 2));

if (!ok) process.exitCode = 1;

