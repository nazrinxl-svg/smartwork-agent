import fs from "fs";
import { spawnSync } from "child_process";

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(stripBom(fs.readFileSync(file, "utf8")));
  } catch (error) {
    return { readError: String(error?.message || error), file };
  }
}

function git(args) {
  const r = spawnSync("git", args, { encoding: "utf8", shell: false });
  return String(r.stdout || "").trim();
}

const mode = process.argv.includes("--strict") ? "strict" : "warn";
const baseline = readJson("memory/smartwork-agent-current-baseline.json", {});
const app = readJson("reports/smartwork-app-artifacts-report.json", {});
const finalProgress = readJson("reports/smartwork-final-progress-report.json", {});
const pipeline = readJson("reports/smartwork-v6-auto-request-pipeline-report.json", {});
const progressHtml = fs.existsSync("public/progress.html")
  ? fs.readFileSync("public/progress.html", "utf8")
  : "";

const head = git(["rev-parse", "--short", "HEAD"]);
const branch = git(["branch", "--show-current"]);
const log = git(["log", "--oneline", "-30"]);
const status = git(["status", "--short"]);

const baselineBranch = baseline?.project?.branch || "test/ui-request-next-20260611-004522";
const backendCommit = baseline?.baseline?.backendCommit || "08004c5";
const uiProgressCommit = baseline?.baseline?.uiProgressCommit || "50e5e20";
const latestGoodCommit = baseline?.baseline?.latestKnownGoodCommit || "50e5e20";

const checks = {
  baselineJsonReadable: !baseline?.readError,
  branchOk: branch === baselineBranch,
  hasBackendCommit: log.includes(backendCommit),
  hasUiCommit: log.includes(uiProgressCommit),
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
  pipelineNotStale:
    pipeline?.ok === true &&
    pipeline?.cleanExit === true &&
    (pipeline?.error === null || pipeline?.error === undefined),
  progressUiHasReadyBridge:
    progressHtml.includes("SMARTWORK_PROGRESS_FORCE_REPORT_SNAPSHOT_V2") ||
    progressHtml.includes("SMARTWORK_PROGRESS_REPORT_BRIDGE_V1")
};

const warnings = [];

if (!checks.baselineJsonReadable) {
  warnings.push("Baseline JSON could not be parsed. Fix memory/smartwork-agent-current-baseline.json before continuing.");
}
if (!checks.branchOk) {
  warnings.push(`Current branch '${branch}' differs from baseline '${baselineBranch}'.`);
}
if (!checks.hasBackendCommit) {
  warnings.push(`Backend stabilization commit ${backendCommit} is not visible in recent git log.`);
}
if (!checks.hasUiCommit) {
  warnings.push(`Progress UI baseline commit ${uiProgressCommit} is not visible in recent git log.`);
}
if (!checks.appArtifactsReady) {
  warnings.push("App artifacts are not in verified Hasil Siap state.");
}
if (!checks.finalProgressReady) {
  warnings.push("Final progress report is not verified for baseline request.");
}
if (!checks.pipelineNotStale) {
  warnings.push("Pipeline report is not clean-exit OK. Run finalizer/diagnosis before relying on pipeline status.");
}
if (!checks.progressUiHasReadyBridge) {
  warnings.push("Progress UI ready bridge marker is missing. Do not let UI fall back to empty state.");
}

const dangerousStatus = status
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((line) =>
    line.includes("public/progress.html") ||
    line.includes("scripts/smartwork-v6-auto-request-pipeline.mjs") ||
    line.includes("scripts/smartwork-app-artifacts-summary.mjs") ||
    line.includes("scripts/smartwork-finalize-active-request-artifacts.mjs")
  );

const guardNotes = [];
if (dangerousStatus.length) {
  guardNotes.push("Sensitive SmartWork files are modified. Run diagnosis before commit/push.");
}

const ok = warnings.length === 0;
const report = {
  ok,
  mode: "SMARTWORK_AUTO_BRAIN_GUARD",
  runMode: mode,
  generatedAt: new Date().toISOString(),
  head,
  branch,
  baseline: {
    branch: baselineBranch,
    backendCommit,
    uiProgressCommit,
    latestGoodCommit
  },
  checks,
  warnings,
  guardNotes,
  statusShort: status,
  guidance: ok
    ? "Baseline safe. Continue only with staged short-range tests."
    : "STOP and diagnose before moving forward. Do not run full-month test or reset UI until warnings are resolved."
};

fs.mkdirSync("reports/brain", { recursive: true });
fs.writeFileSync("reports/brain/smartwork-brain-warning-check-report.json", JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify(report, null, 2));

if (!ok && mode === "strict") process.exit(1);
process.exit(0);
