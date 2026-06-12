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
  JSON.stringify(report, null, 2) + "\n",
  "utf8"
);

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exit(1);
}
