import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const root = process.cwd();

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function readText(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return "";
  return fs.readFileSync(full, "utf8");
}

function writeJson(rel, data) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function syntaxOk(file) {
  try {
    execSync(`node --check "${file}"`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const progressHtml = readText("public/progress.html");
const pkg = JSON.parse(readText("package.json"));

const checks = {
  progressPageExists: exists("public/progress.html"),
  progressBridgeInstalled: progressHtml.includes("SMARTWORK_PRODUCTION_PROGRESS_BRIDGE_V1"),
  progressBridgeReadsJobStatus: progressHtml.includes("/api/smartwork/jobs/"),
  progressBridgeReadsSavedJob: progressHtml.includes("smartwork_production_job"),
  progressBridgeWritesProductionState: progressHtml.includes("smartwork_production_progress_state"),
  progressBridgeUpdatesLiveState: progressHtml.includes("smartwork_progress_live_state"),
  progressBridgeNoSiagaInput: progressHtml.includes("noSiagaInput: true"),
  progressBridgeNoBrowserOpen: progressHtml.includes("noBrowserOpen: true"),
  progressBridgeNoRealSave: progressHtml.includes("noRealSave: true"),
  progressBridgeNoRealSend: progressHtml.includes("noRealSend: true"),
  existingProgressPreserved:
    progressHtml.includes("smartwork-app-artifacts-report.json") ||
    progressHtml.includes("smartwork_progress_live_state") ||
    progressHtml.includes("smartwork-live-progress-report.json"),
  packageHasCheck: pkg.scripts?.["prod:progress-bridge:check"] === "node scripts/smartwork-phase5f-app-progress-bridge-check.mjs",
  brainHasStaticCheck: String(pkg.scripts?.brain || "").includes("smartwork-phase5f-app-progress-bridge-check.mjs"),
  apiSyntaxOk: syntaxOk("app/smartwork-production-queue-api.mjs"),
  serverSyntaxOk: syntaxOk("app/smartwork-control-server.mjs")
};

const ok = Object.values(checks).every(Boolean);

const report = {
  ok,
  mode: "SMARTWORK_PHASE5F_APP_PROGRESS_BRIDGE_CHECK",
  generatedAt: new Date().toISOString(),
  checks,
  flow: [
    "request.html stores production job id",
    "progress.html reads smartwork_production_job from localStorage",
    "progress.html fetches /api/smartwork/jobs/:jobId",
    "progress.html writes smartwork_production_progress_state and smartwork_progress_live_state"
  ],
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    staticCheckOnly: true
  },
  next: ok
    ? "Phase 5F app progress bridge static check passed. Next: runtime progress bridge smoke."
    : "Fix Phase 5F app progress bridge."
};

writeJson("reports/production-worker/phase5f-app-progress-bridge-check-report.json", report);
console.log(JSON.stringify(report, null, 2));

if (!ok) process.exit(2);
