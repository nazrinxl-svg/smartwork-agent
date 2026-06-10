import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "reports", "smartwork-v6-auto-request-pipeline-report.json");

function run(label, cmd, args = [], env = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...env }
  });
  return {
    label,
    cmd: [cmd, ...args].join(" "),
    exitCode: result.status
  };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const steps = [];
const startedAt = new Date().toISOString();

steps.push(run("1. SCAN EMPTY DATES", "node", ["scripts/smartwork-siaga-empty-date-scan.mjs"]));

let scan = readJson(path.join(ROOT, "reports", "autosave-empty-date-scan-report.json"));
let emptyDates = scan?.emptyDates || [];

console.log("EMPTY_DATES=", emptyDates.join(","));

for (const date of emptyDates) {
  steps.push(run(`2. AUTOSAVE ${date}`, "node", ["scripts/smartwork-autosave-runner.mjs"], {
    TARGET_DATE: date,
    CONFIRM_SAVE: "YES",
    SMARTWORK_RUN_MODE: "AUTO_REAL_SAVE_FROM_REQUEST"
  }));
}

steps.push(run("3. SCAN AFTER AUTOSAVE", "node", ["scripts/smartwork-siaga-empty-date-scan.mjs"]));

const afterScan = readJson(path.join(ROOT, "reports", "autosave-empty-date-scan-report.json"));
const remaining = afterScan?.emptyDates || [];

if (remaining.length === 0) {
  steps.push(run("4. DOWNLOAD PDF", "node", ["scripts/smartwork-siaga-download-presensi-pdf.mjs"]));
  steps.push(run("5. DELIVERY PREVIEW", "node", ["scripts/smartwork-delivery-orchestrator.mjs"]));
} else {
  console.log("MASIH ADA EMPTY_DATES=", remaining.join(","));
}

const report = {
  ok: remaining.length === 0,
  mode: "SMARTWORK_V6_AUTO_REQUEST_PIPELINE",
  startedAt,
  endedAt: new Date().toISOString(),
  beforeEmptyDates: emptyDates,
  afterEmptyDates: remaining,
  beforeSummary: scan?.summary || null,
  afterSummary: afterScan?.summary || null,
  steps
};

fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");

console.log("\n=== V6 PIPELINE RESULT ===");
console.log(JSON.stringify({
  ok: report.ok,
  beforeEmptyDates: report.beforeEmptyDates,
  afterEmptyDates: report.afterEmptyDates,
  afterSummary: report.afterSummary,
  report: REPORT
}, null, 2));

process.exit(report.ok ? 0 : 1);
