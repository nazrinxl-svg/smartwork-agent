import fs from "fs";
import path from "path";

const root = process.cwd();
const reportPath = path.join(root, "reports", "phase5p-vps-dry-run-setup-pack-check-report.json");

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

function hasJsonBool(rel, key) {
  const text = read(rel);
  const normalized = text.replace(/\\/g, "").replace(/\s+/g, " ");
  return normalized.includes(`"${key}": true`) || normalized.includes(`'${key}': true`);
}

const files = {
  readme: "deploy/vps-dry-run/README.md",
  env: "deploy/vps-dry-run/.env.vps-dry-run.example",
  pm2: "deploy/vps-dry-run/pm2.vps-dry-run.config.cjs",
  install: "deploy/vps-dry-run/install-dry-run.sh",
  startPm2: "deploy/vps-dry-run/start-pm2-dry-run.sh",
  healthcheck: "deploy/vps-dry-run/healthcheck.sh",
  submitDryRun: "deploy/vps-dry-run/submit-dry-run-job.sh",
  rollback: "deploy/vps-dry-run/rollback-dry-run.sh",
  systemdServer: "deploy/vps-dry-run/systemd/smartwork-control-server.dry-run.service",
  systemdWorker: "deploy/vps-dry-run/systemd/smartwork-production-worker.dry-run.service",
  phase5o: "scripts/smartwork-phase5o-fresh-clone-vps-dry-run-rehearsal.mjs",
  phase5n: "scripts/smartwork-phase5n-clean-release-gate-ready-tag.mjs",
  phase5m: "scripts/smartwork-phase5m-release-vps-dry-run-final-gate.mjs"
};

const checks = {
  allFilesExist: Object.values(files).every(exists),
  readmeMentionsTag: has(files.readme, "smartwork-vps-dry-run-ready-phase5n"),
  readmeHasPm2: has(files.readme, "Start with PM2 dry-run"),
  readmeHasSystemd: has(files.readme, "Start with systemd dry-run"),
  readmeHasRollback: has(files.readme, "Rollback"),
  envDryRun: has(files.env, "SMARTWORK_DRY_RUN=true"),
  envNoSiaga: has(files.env, "SMARTWORK_NO_SIAGA_INPUT=true"),
  envNoBrowser: has(files.env, "SMARTWORK_NO_BROWSER_OPEN=true"),
  envNoRealSave: has(files.env, "SMARTWORK_NO_REAL_SAVE=true"),
  envNoRealSend: has(files.env, "SMARTWORK_NO_REAL_SEND=true"),
  envRealSaveDisabled: has(files.env, "SMARTWORK_REAL_SAVE_ENABLED=false"),
  pm2Server: has(files.pm2, "smartwork-control-server-dry-run"),
  pm2Worker: has(files.pm2, "smartwork-production-worker-dry-run"),
  pm2WorkerDaemonDryRun: has(files.pm2, "--daemon --dry-run"),
  installRunsCi: has(files.install, "npm ci"),
  installRunsVerify: has(files.install, "prod:deployment-pack:verify") &&
    has(files.install, "prod:release-clean:gate") &&
    has(files.install, "prod:vps-dry-run:setup-pack-check"),
  healthcheckEndpoint: has(files.healthcheck, "/api/smartwork/jobs/health"),
  submitCreatesDryRunJob: hasJsonBool(files.submitDryRun, "dryRun") &&
    hasJsonBool(files.submitDryRun, "noSiagaInput") &&
    hasJsonBool(files.submitDryRun, "noBrowserOpen") &&
    hasJsonBool(files.submitDryRun, "noRealSave") &&
    hasJsonBool(files.submitDryRun, "noRealSend"),
  rollbackStopsPm2AndSystemd: has(files.rollback, "pm2 delete") &&
    has(files.rollback, "systemctl stop"),
  systemdServerSafe: has(files.systemdServer, "SMARTWORK_DRY_RUN=true") &&
    has(files.systemdServer, "SMARTWORK_NO_REAL_SAVE=true"),
  systemdWorkerSafe: has(files.systemdWorker, "SMARTWORK_DRY_RUN=true") &&
    has(files.systemdWorker, "--daemon --dry-run"),
  noRealSendEverywhere: Object.values(files)
    .filter((rel) => exists(rel))
    .every((rel) => !/REAL_SEND_ENABLED=true|SMARTWORK_NO_REAL_SEND=false/.test(read(rel))),
  noRealSaveEverywhere: Object.values(files)
    .filter((rel) => exists(rel))
    .every((rel) => !/REAL_SAVE_ENABLED=true|SMARTWORK_NO_REAL_SAVE=false/.test(read(rel)))
};

const ok = Object.values(checks).every(Boolean);

const report = {
  ok,
  phase: "5P",
  name: "VPS Dry-Run Setup Pack Check",
  checks,
  files,
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    dryRunOnly: true,
    setupPackOnly: true,
    noRealDeploy: true
  },
  releaseDecision: ok
    ? "VPS_DRY_RUN_SETUP_PACK_READY"
    : "NOT_READY_FIX_VPS_SETUP_PACK",
  next: ok
    ? "Use deploy/vps-dry-run/install-dry-run.sh on VPS, then run PM2 or systemd dry-run only."
    : "Fix VPS setup pack before running commands on VPS.",
  generatedAt: new Date().toISOString()
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok,
  phase: "5P",
  releaseDecision: report.releaseDecision,
  checks,
  reportPath
}, null, 2));

if (!ok) process.exitCode = 1;
