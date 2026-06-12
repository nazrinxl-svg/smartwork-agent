import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredFiles = [
  "deploy/dewavps/vps-first-boot-dry-run.sh",
  "deploy/dewavps/vps-health-check.sh",
  "docs/smartwork-dewavps-phase5s-first-boot.md",
  "deploy/dewavps/.env.dry-run.example",
  "deploy/dewavps/smartwork-control-server.service",
  "deploy/dewavps/smartwork-production-worker.service",
  "package.json"
];

const requiredText = {
  "deploy/dewavps/vps-first-boot-dry-run.sh": [
    "SMARTWORK_NO_SIAGA_INPUT=true",
    "SMARTWORK_NO_BROWSER_OPEN=true",
    "SMARTWORK_NO_REAL_SAVE=true",
    "SMARTWORK_NO_REAL_SEND=true",
    "npm run smartwork:dewavps:preflight",
    "systemctl restart smartwork-control-server.service",
    "systemctl restart smartwork-production-worker.service"
  ],
  "docs/smartwork-dewavps-phase5s-first-boot.md": [
    "SMARTWORK_DRY_RUN=true",
    "no SIAGA input",
    "no real save",
    "no real send"
  ]
};

const report = {
  ok: true,
  phase: "5S",
  releaseDecision: "DEWAVPS_FIRST_BOOT_DRY_RUN_PACK_READY",
  checkedAt: new Date().toISOString(),
  requiredFiles: {},
  requiredText: {},
  notes: [
    "This is a VPS first-boot dry-run pack only.",
    "It does not enable SIAGA input, browser open, real save, or real send."
  ]
};

for (const file of requiredFiles) {
  const exists = fs.existsSync(path.join(root, file));
  report.requiredFiles[file] = exists;
  if (!exists) report.ok = false;
}

for (const [file, needles] of Object.entries(requiredText)) {
  const full = path.join(root, file);
  const text = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
  report.requiredText[file] = {};
  for (const needle of needles) {
    const found = text.includes(needle);
    report.requiredText[file][needle] = found;
    if (!found) report.ok = false;
  }
}

fs.mkdirSync(path.join(root, "reports"), { recursive: true });
fs.writeFileSync(
  path.join(root, "reports/smartwork-dewavps-phase5s-first-boot-pack-report.json"),
  JSON.stringify(report, null, 2) + "\n",
  "utf8"
);

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
