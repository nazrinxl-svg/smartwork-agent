import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function write(file, content) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.endsWith("\n") ? content : content + "\n", "utf8");
  console.log("wrote", file);
}

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function updatePackage() {
  const file = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  pkg.scripts ||= {};
  pkg.scripts["smartwork:prod-worker:daemon:dry-run"] = "node scripts/smartwork-production-worker-daemon.mjs";
  pkg.scripts["smartwork:dewavps:phase5u:preflight"] = "node scripts/smartwork-dewavps-phase5u-preflight.mjs";
  pkg.scripts["smartwork:dewavps:phase5u:report"] = "node scripts/smartwork-dewavps-phase5u-report.mjs";
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log("updated package.json");
}

updatePackage();

write("scripts/smartwork-production-worker-daemon.mjs", `
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const intervalMs = Number(process.env.SMARTWORK_WORKER_INTERVAL_MS || 10000);
const workerScript = path.join(root, "scripts/smartwork-production-worker.mjs");

const runtimeDirs = [
  "data/production-queue/pending",
  "data/production-queue/running",
  "data/production-queue/completed",
  "data/production-queue/failed",
  "data/jobs",
  "intake/requests",
  "reports",
  "reports/downloads",
  "reports/proof"
];

for (const dir of runtimeDirs) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
}

const safeEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || "production",
  SMARTWORK_DRY_RUN: "true",
  SMARTWORK_NO_SIAGA_INPUT: "true",
  SMARTWORK_NO_BROWSER_OPEN: "true",
  SMARTWORK_NO_REAL_SAVE: "true",
  SMARTWORK_NO_REAL_SEND: "true",
  SMARTWORK_REAL_SAVE_ENABLED: "false",
  SMARTWORK_EMAIL_ENABLED: "false",
  SMARTWORK_WHATSAPP_ENABLED: "false"
};

function now() {
  return new Date().toISOString();
}

function runOnce() {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [workerScript, "--once", "--dry-run"],
      {
        cwd: root,
        env: safeEnv,
        stdio: "inherit"
      }
    );

    child.on("error", (error) => {
      console.error(JSON.stringify({
        ok: false,
        mode: "SMARTWORK_PRODUCTION_WORKER_DAEMON",
        error: String(error?.message || error),
        generatedAt: now()
      }, null, 2));
      resolve(false);
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve(true);
        return;
      }

      console.error(JSON.stringify({
        ok: false,
        mode: "SMARTWORK_PRODUCTION_WORKER_DAEMON",
        childExitCode: code,
        childSignal: signal,
        generatedAt: now(),
        safety: {
          dryRun: true,
          noSiagaInput: true,
          noBrowserOpen: true,
          noRealSave: true,
          noRealSend: true
        }
      }, null, 2));
      resolve(false);
    });
  });
}

let stopping = false;

process.on("SIGTERM", () => {
  stopping = true;
  console.log("SMARTWORK_PRODUCTION_WORKER_DAEMON=SIGTERM");
});

process.on("SIGINT", () => {
  stopping = true;
  console.log("SMARTWORK_PRODUCTION_WORKER_DAEMON=SIGINT");
});

console.log(JSON.stringify({
  ok: true,
  mode: "SMARTWORK_PRODUCTION_WORKER_DAEMON",
  status: "started",
  intervalMs,
  generatedAt: now(),
  safety: {
    dryRun: true,
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true
  }
}, null, 2));

while (!stopping) {
  await runOnce();

  if (stopping) break;

  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

console.log(JSON.stringify({
  ok: true,
  mode: "SMARTWORK_PRODUCTION_WORKER_DAEMON",
  status: "stopped",
  generatedAt: now()
}, null, 2));
`);

write("deploy/dewavps/smartwork-production-worker.service", `
[Unit]
Description=SmartWork Production Worker Daemon
After=network.target smartwork-control-server.service
Requires=smartwork-control-server.service

[Service]
Type=simple
WorkingDirectory=/opt/smartwork-agent
EnvironmentFile=/opt/smartwork-agent/.env.production
ExecStart=/usr/bin/node scripts/smartwork-production-worker-daemon.mjs
Restart=always
RestartSec=5
User=smartwork
Group=smartwork

[Install]
WantedBy=multi-user.target
`);

let firstBoot = read("deploy/dewavps/vps-first-boot-dry-run.sh");

const marker = 'echo "=== Install systemd services ==="';
const runtimeBlock = `
echo "=== Runtime dirs + permissions before services ==="
mkdir -p \\
  data/production-queue/pending \\
  data/production-queue/running \\
  data/production-queue/completed \\
  data/production-queue/failed \\
  data/jobs \\
  intake/requests \\
  reports \\
  reports/downloads \\
  reports/proof

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
`;

if (!firstBoot.includes("=== Runtime dirs + permissions before services ===")) {
  firstBoot = firstBoot.replace(marker, runtimeBlock + "\n" + marker);
}

write("deploy/dewavps/vps-first-boot-dry-run.sh", firstBoot);

write("scripts/smartwork-dewavps-phase5u-preflight.mjs", `
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
  JSON.stringify(report, null, 2) + "\\n",
  "utf8"
);

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
`);

write("scripts/smartwork-dewavps-phase5u-report.mjs", `
import fs from "node:fs";

const file = "reports/smartwork-dewavps-phase5u-persistent-worker-report.json";
if (!fs.existsSync(file)) {
  console.error("Report not found. Run: npm run smartwork:dewavps:phase5u:preflight");
  process.exit(1);
}

console.log(fs.readFileSync(file, "utf8"));
`);

console.log("\\nPhase 5U persistent worker daemon patch generated.");
