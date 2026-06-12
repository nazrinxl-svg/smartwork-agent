
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const checks = {
  daemonScriptExists: fs.existsSync(path.join(root, "scripts/smartwork-production-worker-daemon.mjs")),
  serviceUsesDaemon: fs.readFileSync(path.join(root, "deploy/dewavps/smartwork-production-worker.service"), "utf8").includes("scripts/smartwork-production-worker-daemon.mjs"),
  firstBootCreatesRuntimeDirsBeforeServices: fs.readFileSync(path.join(root, "deploy/dewavps/vps-first-boot-dry-run.sh"), "utf8").includes("=== Runtime dirs + permissions before services ==="),
  daemonForcesDryRun: fs.readFileSync(path.join(root, "scripts/smartwork-production-worker-daemon.mjs"), "utf8").includes('SMARTWORK_DRY_RUN: "true"'),
  daemonBlocksSiagaInput: fs.readFileSync(path.join(root, "scripts/smartwork-production-worker-daemon.mjs"), "utf8").includes('SMARTWORK_NO_SIAGA_INPUT: "true"'),
  daemonBlocksBrowser: fs.readFileSync(path.join(root, "scripts/smartwork-production-worker-daemon.mjs"), "utf8").includes('SMARTWORK_NO_BROWSER_OPEN: "true"'),
  daemonBlocksSave: fs.readFileSync(path.join(root, "scripts/smartwork-production-worker-daemon.mjs"), "utf8").includes('SMARTWORK_NO_REAL_SAVE: "true"'),
  daemonBlocksSend: fs.readFileSync(path.join(root, "scripts/smartwork-production-worker-daemon.mjs"), "utf8").includes('SMARTWORK_NO_REAL_SEND: "true"')
};

const report = {
  ok: Object.values(checks).every(Boolean),
  phase: "5U",
  releaseDecision: "PERSISTENT_VPS_WORKER_DAEMON_PATCH_READY",
  checkedAt: new Date().toISOString(),
  checks,
  notes: [
    "Fixes systemd auto-restart loop caused by one-shot worker exit.",
    "Adds persistent daemon wrapper while keeping dry-run safety locks.",
    "Ensures runtime dirs and ownership are created before service restart on VPS first boot."
  ]
};

fs.mkdirSync(path.join(root, "reports"), { recursive: true });
fs.writeFileSync(
  path.join(root, "reports/smartwork-dewavps-phase5u-persistent-worker-report.json"),
  JSON.stringify(report, null, 2) + "\n",
  "utf8"
);

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
