import fs from "fs";
import { spawnSync } from "child_process";

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return { readError: String(error?.message || error) };
  }
}

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8", shell: false });
  return String(r.stdout || "").trim();
}

const baseline = readJson("memory/smartwork-agent-current-baseline.json", {});
const app = readJson("reports/smartwork-app-artifacts-report.json", {});
const finalProgress = readJson("reports/smartwork-final-progress-report.json", {});
const progressHtml = fs.existsSync("public/progress.html")
  ? fs.readFileSync("public/progress.html", "utf8")
  : "";

const head = git(["rev-parse", "--short", "HEAD"]);
const branch = git(["branch", "--show-current"]);
const log = git(["log", "--oneline", "-20"]);

const checks = {
  branchOk: branch === baseline?.project?.branch,
  hasBackendCommit: log.includes(baseline?.baseline?.backendCommit || "08004c5"),
  hasUiCommit: log.includes(baseline?.baseline?.uiProgressCommit || "50e5e20"),
  appArtifactsReady:
    app?.ok === true &&
    app?.artifactGuard?.verifyComplete === true &&
    app?.artifactGuard?.artifactMatchesActiveRequest === true &&
    app?.artifacts?.pdfReady === true &&
    app?.artifacts?.proofReady === true &&
    app?.uiText?.title === "Hasil Siap",
  finalProgressReady:
    finalProgress?.ok === true &&
    finalProgress?.verifyComplete === true &&
    Number(finalProgress?.summary?.alreadyFilled || 0) >= 6 &&
    Number(finalProgress?.summary?.needsPlan || 0) === 0,
  progressUiHasReadyBridge:
    progressHtml.includes("SMARTWORK_PROGRESS_FORCE_REPORT_SNAPSHOT_V2") ||
    progressHtml.includes("SMARTWORK_PROGRESS_REPORT_BRIDGE_V1")
};

const warnings = [];

if (!checks.branchOk) {
  warnings.push(`Current branch '${branch}' differs from baseline '${baseline?.project?.branch}'.`);
}
if (!checks.hasBackendCommit) {
  warnings.push("Backend stabilization commit 08004c5 is not visible in recent git log.");
}
if (!checks.hasUiCommit) {
  warnings.push("Progress UI baseline commit 50e5e20 is not visible in recent git log.");
}
if (!checks.appArtifactsReady) {
  warnings.push("App artifacts are not in verified Hasil Siap state.");
}
if (!checks.finalProgressReady) {
  warnings.push("Final progress report is not verified for baseline request.");
}
if (!checks.progressUiHasReadyBridge) {
  warnings.push("Progress UI ready bridge marker is missing. Do not let UI fall back to empty state.");
}

const report = {
  ok: warnings.length === 0,
  mode: "SMARTWORK_BRAIN_WARNING_CHECK",
  generatedAt: new Date().toISOString(),
  head,
  branch,
  baselineCommit: baseline?.baseline?.latestKnownGoodCommit,
  checks,
  warnings,
  guidance: warnings.length
    ? "STOP and diagnose before moving forward. Do not run full-month test or reset UI until warnings are resolved."
    : "Baseline safe. Continue only with staged short-range tests."
};

fs.mkdirSync("reports/brain", { recursive: true });
fs.writeFileSync("reports/brain/smartwork-brain-warning-check-report.json", JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
