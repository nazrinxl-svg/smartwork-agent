import fs from "fs";
import path from "path";

const root = process.cwd();
const reportPath = path.join(root, "reports", "phase5q-vps-first-run-checklist-report.json");

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

function normalized(rel) {
  return read(rel).replace(/\\/g, "").replace(/\s+/g, " ");
}

function hasJsonBool(rel, key) {
  const text = normalized(rel);
  return text.includes(`"${key}": true`);
}

function safe(rel) {
  return !/SMARTWORK_NO_REAL_SAVE=false|SMARTWORK_NO_REAL_SEND=false|SMARTWORK_REAL_SAVE_ENABLED=true|REAL_SEND_ENABLED=true/.test(read(rel));
}

const files = {
  gitattributes: ".gitattributes",
  checklist: "deploy/vps-dry-run/FIRST-RUN-CHECKLIST.md",
  smoke: "deploy/vps-dry-run/first-run-dry-run-smoke.sh",
  verify: "deploy/vps-dry-run/verify-running-dry-run.sh",
  setupReadme: "deploy/vps-dry-run/README.md",
  env: "deploy/vps-dry-run/.env.vps-dry-run.example",
  pm2: "deploy/vps-dry-run/pm2.vps-dry-run.config.cjs",
  rollback: "deploy/vps-dry-run/rollback-dry-run.sh",
  phase5p: "scripts/smartwork-phase5p-vps-dry-run-setup-pack-check.mjs"
};

const checks = {
  allFilesExist: Object.values(files).every(exists),
  gitattributesLf: has(files.gitattributes, "deploy/vps-dry-run/*.sh text eol=lf"),
  checklistHasSsh: has(files.checklist, "ssh root@YOUR_VPS_IP"),
  checklistHasDeps: has(files.checklist, "apt install -y git curl"),
  checklistHasClone: has(files.checklist, "git clone https://github.com/nazrinxl-svg/smartwork-agent.git"),
  checklistHasBranch: has(files.checklist, "test/ui-request-next-20260611-004522"),
  checklistHasPm2: has(files.checklist, "pm2 start deploy/vps-dry-run/pm2.vps-dry-run.config.cjs"),
  checklistHasSafety: has(files.checklist, "SMARTWORK_DRY_RUN=true") &&
    has(files.checklist, "SMARTWORK_REAL_SAVE_ENABLED=false"),
  smokeHitsHealth: has(files.smoke, "/api/smartwork/jobs/health"),
  smokePostsJob: has(files.smoke, "/api/smartwork/jobs") && has(files.smoke, "POST"),
  smokeDryRunOnly: hasJsonBool(files.smoke, "dryRun") &&
    hasJsonBool(files.smoke, "noSiagaInput") &&
    hasJsonBool(files.smoke, "noBrowserOpen") &&
    hasJsonBool(files.smoke, "noRealSave") &&
    hasJsonBool(files.smoke, "noRealSend"),
  smokePollsStatus: has(files.smoke, "/api/smartwork/jobs/$JOB_ID") && has(files.smoke, "completed"),
  verifyHitsHealthAndJobs: has(files.verify, "/api/smartwork/jobs/health") &&
    has(files.verify, "/api/smartwork/jobs"),
  setupPackStillReady: has(files.setupReadme, "SAFE DRY-RUN ONLY") &&
    has(files.env, "SMARTWORK_REAL_SAVE_ENABLED=false") &&
    has(files.pm2, "--daemon --dry-run"),
  noDangerInNewFiles: [files.checklist, files.smoke, files.verify].every(safe),
  packageScriptPresent: has("package.json", "prod:vps-dry-run:first-run-checklist")
};

const ok = Object.values(checks).every(Boolean);

const report = {
  ok,
  phase: "5Q",
  name: "VPS First-Run Dry-Run Execution Checklist",
  checks,
  files,
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    dryRunOnly: true,
    checklistOnly: true
  },
  releaseDecision: ok
    ? "VPS_FIRST_RUN_DRY_RUN_CHECKLIST_READY"
    : "NOT_READY_FIX_VPS_FIRST_RUN_CHECKLIST",
  next: ok
    ? "Run deploy/vps-dry-run/install-dry-run.sh on VPS, then start PM2 dry-run and run first-run-dry-run-smoke.sh."
    : "Fix first-run checklist before VPS execution.",
  generatedAt: new Date().toISOString()
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok,
  phase: "5Q",
  releaseDecision: report.releaseDecision,
  checks,
  reportPath
}, null, 2));

if (!ok) process.exitCode = 1;

