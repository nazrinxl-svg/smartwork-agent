import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function write(file, content) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trimStart(), "utf8");
  console.log("wrote", file);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function writeJson(file, obj) {
  fs.writeFileSync(path.join(root, file), JSON.stringify(obj, null, 2) + "\n", "utf8");
  console.log("updated", file);
}

const pkg = readJson("package.json");
pkg.scripts ||= {};
pkg.scripts["smartwork:dewavps:preflight"] = "node scripts/smartwork-dewavps-preflight.mjs";
pkg.scripts["smartwork:dewavps:report"] = "node scripts/smartwork-dewavps-report.mjs";
pkg.scripts["smartwork:prod-worker:dry-run"] = "node scripts/smartwork-production-worker.mjs --dry-run";
writeJson("package.json", pkg);

write("deploy/dewavps/.env.dry-run.example", `
# SmartWork Agent - DewaVPS production dry-run env
# Copy to: /opt/smartwork-agent/.env.production
# First VPS run MUST stay dry-run until validated.

NODE_ENV=production
PORT=3107
SMARTWORK_HOST=0.0.0.0

SMARTWORK_DRY_RUN=true
SMARTWORK_NO_SIAGA_INPUT=true
SMARTWORK_NO_BROWSER_OPEN=true
SMARTWORK_NO_REAL_SAVE=true
SMARTWORK_NO_REAL_SEND=true
SMARTWORK_REAL_SAVE_ENABLED=false
SMARTWORK_APP_ARTIFACTS_ONLY=true

SMARTWORK_WORKER_ENABLED=true
SMARTWORK_WORKER_INTERVAL_MS=1000
SMARTWORK_WORKER_MODE=queue

SMARTWORK_DELIVERY_MODE=app_only
SMARTWORK_EMAIL_ENABLED=false
SMARTWORK_WHATSAPP_ENABLED=false

SMARTWORK_QUEUE_DIR=data/jobs
SMARTWORK_INTAKE_DIR=intake/requests
SMARTWORK_REPORT_DIR=reports
SMARTWORK_DOWNLOAD_DIR=reports/downloads
SMARTWORK_PROOF_DIR=reports/proof
`);

write("deploy/dewavps/smartwork-control-server.service", `
[Unit]
Description=SmartWork Control Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/smartwork-agent
EnvironmentFile=/opt/smartwork-agent/.env.production
ExecStart=/usr/bin/node app/smartwork-control-server.mjs
Restart=always
RestartSec=5
User=smartwork
Group=smartwork

[Install]
WantedBy=multi-user.target
`);

write("deploy/dewavps/smartwork-production-worker.service", `
[Unit]
Description=SmartWork Production Worker
After=network.target smartwork-control-server.service
Requires=smartwork-control-server.service

[Service]
Type=simple
WorkingDirectory=/opt/smartwork-agent
EnvironmentFile=/opt/smartwork-agent/.env.production
ExecStart=/usr/bin/node scripts/smartwork-production-worker.mjs
Restart=always
RestartSec=5
User=smartwork
Group=smartwork

[Install]
WantedBy=multi-user.target
`);

write("deploy/dewavps/ecosystem.config.cjs", `
module.exports = {
  apps: [
    {
      name: "smartwork-control-server",
      cwd: "/opt/smartwork-agent",
      script: "app/smartwork-control-server.mjs",
      env_file: "/opt/smartwork-agent/.env.production",
      autorestart: true,
      max_restarts: 20
    },
    {
      name: "smartwork-production-worker",
      cwd: "/opt/smartwork-agent",
      script: "scripts/smartwork-production-worker.mjs",
      env_file: "/opt/smartwork-agent/.env.production",
      autorestart: true,
      max_restarts: 20
    }
  ]
};
`);

write("deploy/dewavps/first-run-dry-run.sh", `
#!/usr/bin/env bash
set -euo pipefail

echo "=== SmartWork DewaVPS first-run dry-run ==="

cd /opt/smartwork-agent

echo "=== Node/NPM ==="
node -v
npm -v

echo "=== Install dependencies ==="
npm ci

echo "=== Install dry-run env if missing ==="
if [ ! -f .env.production ]; then
  cp deploy/dewavps/.env.dry-run.example .env.production
fi

echo "=== Safety preflight ==="
npm run smartwork:dewavps:preflight

echo "=== Existing project guards ==="
npm run brain:smartwork-guard
npm run doctor

echo "=== Dry-run health target ==="
echo "Start server with systemd/pm2, then check:"
echo "curl http://127.0.0.1:3107/api/smartwork/jobs/health"

echo "=== DONE: VPS dry-run pack ready ==="
`);

write("docs/smartwork-dewavps-production-worker-24x7.md", `
# SmartWork Production Worker 24/7 - DewaVPS Candidate

## Target

SmartWork harus berjalan tanpa laptop lokal:

1. User submit request dari app/web.
2. Backend menerima intake request.
3. Queue/job dibuat.
4. Production worker berjalan 24/7 di VPS.
5. Worker memproses job.
6. Progress bisa dibaca dari app.
7. PDF/proof siap diunduh dari app.
8. Email/WhatsApp tetap disabled sampai provider real dan guard siap.

## VPS Candidate

DewaVPS self-managed cocok untuk fase ini karena:
- VPS hidup 24/7.
- Bisa pakai Node.js service.
- Bisa pakai systemd atau PM2.
- Biaya mengikuti top-up/pay-per-use sesuai model DewaVPS.

Catatan: harga/spec terbaru harus dicek langsung di kalkulator DewaVPS sebelum pembelian.

## First-run policy

First VPS boot wajib dry-run:

\`\`\`env
SMARTWORK_DRY_RUN=true
SMARTWORK_NO_SIAGA_INPUT=true
SMARTWORK_NO_BROWSER_OPEN=true
SMARTWORK_NO_REAL_SAVE=true
SMARTWORK_NO_REAL_SEND=true
SMARTWORK_REAL_SAVE_ENABLED=false
SMARTWORK_APP_ARTIFACTS_ONLY=true
SMARTWORK_EMAIL_ENABLED=false
SMARTWORK_WHATSAPP_ENABLED=false
\`\`\`

## Suggested VPS path

\`\`\`bash
/opt/smartwork-agent
\`\`\`

## Services

Systemd files:

- \`deploy/dewavps/smartwork-control-server.service\`
- \`deploy/dewavps/smartwork-production-worker.service\`

PM2 fallback:

- \`deploy/dewavps/ecosystem.config.cjs\`

## First VPS commands

\`\`\`bash
sudo adduser --system --group --home /opt/smartwork-agent smartwork
sudo mkdir -p /opt/smartwork-agent
sudo chown -R smartwork:smartwork /opt/smartwork-agent

cd /opt/smartwork-agent
bash deploy/dewavps/first-run-dry-run.sh
\`\`\`

## Promote later to guarded real mode

Only after dry-run health, queue, progress, artifact report, PDF/proof path, and app download are confirmed.

Do not enable real save/send/delete until explicit guarded phase.
`);

write("scripts/smartwork-dewavps-preflight.mjs", `
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredFiles = [
  "deploy/dewavps/.env.dry-run.example",
  "deploy/dewavps/smartwork-control-server.service",
  "deploy/dewavps/smartwork-production-worker.service",
  "deploy/dewavps/ecosystem.config.cjs",
  "deploy/dewavps/first-run-dry-run.sh",
  "docs/smartwork-dewavps-production-worker-24x7.md",
  "package.json"
];

const safetyNeedles = [
  "SMARTWORK_DRY_RUN=true",
  "SMARTWORK_NO_SIAGA_INPUT=true",
  "SMARTWORK_NO_BROWSER_OPEN=true",
  "SMARTWORK_NO_REAL_SAVE=true",
  "SMARTWORK_NO_REAL_SEND=true",
  "SMARTWORK_REAL_SAVE_ENABLED=false",
  "SMARTWORK_APP_ARTIFACTS_ONLY=true",
  "SMARTWORK_EMAIL_ENABLED=false",
  "SMARTWORK_WHATSAPP_ENABLED=false"
];

const report = {
  ok: true,
  phase: "5R",
  releaseDecision: "DEWAVPS_PRODUCTION_WORKER_DRY_RUN_PACK_READY",
  checkedAt: new Date().toISOString(),
  requiredFiles: {},
  safety: {},
  scripts: {},
  notes: [
    "This pack prepares 24/7 VPS worker deployment in dry-run mode.",
    "No SIAGA input/browser/real save/real send is enabled.",
    "DewaVPS price/spec must be checked in the live DewaVPS calculator before purchase."
  ]
};

for (const file of requiredFiles) {
  const exists = fs.existsSync(path.join(root, file));
  report.requiredFiles[file] = exists;
  if (!exists) report.ok = false;
}

const envPath = path.join(root, "deploy/dewavps/.env.dry-run.example");
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

for (const needle of safetyNeedles) {
  const exists = envText.includes(needle);
  report.safety[needle] = exists;
  if (!exists) report.ok = false;
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const name of [
  "smartwork:dewavps:preflight",
  "smartwork:dewavps:report",
  "smartwork:prod-worker:dry-run"
]) {
  const exists = Boolean(pkg.scripts?.[name]);
  report.scripts[name] = exists;
  if (!exists) report.ok = false;
}

fs.mkdirSync(path.join(root, "reports"), { recursive: true });
fs.writeFileSync(
  path.join(root, "reports/smartwork-dewavps-production-worker-report.json"),
  JSON.stringify(report, null, 2) + "\\n",
  "utf8"
);

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exit(1);
}
`);

write("scripts/smartwork-dewavps-report.mjs", `
import fs from "node:fs";

const file = "reports/smartwork-dewavps-production-worker-report.json";
if (!fs.existsSync(file)) {
  console.error("Report not found. Run: npm run smartwork:dewavps:preflight");
  process.exit(1);
}

console.log(fs.readFileSync(file, "utf8"));
`);

console.log("\\nPhase 5R DewaVPS production worker dry-run pack generated.");
