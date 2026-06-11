import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const root = process.cwd();
const reportPath = path.join(root, "reports", "smartwork-v6-auto-request-pipeline-report.json");

function readJson(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return { ...fallback, readError: String(error?.message || error) };
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function run(label, script) {
  console.log(`\n=== ${label} ===`);
  const startedAt = new Date().toISOString();

  const child = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    timeout: 120000
  });

  process.stdout.write(child.stdout || "");
  process.stderr.write(child.stderr || "");

  return {
    label,
    cmd: `node ${script}`,
    startedAt,
    endedAt: new Date().toISOString(),
    exitCode: child.status,
    signal: child.signal,
    ok: child.status === 0,
    stdoutTail: String(child.stdout || "").slice(-4000),
    stderrTail: String(child.stderr || "").slice(-4000)
  };
}

console.log("SMARTWORK_V6_PIPELINE_FINALIZE_CLEAN_EXIT=START");

const existing = readJson(reportPath, {
  ok: false,
  mode: "SMARTWORK_V6_AUTO_REQUEST_PIPELINE_MODERN_REQUEST_BASED",
  purpose: "Finalize after verified request execution.",
  startedAt: new Date().toISOString(),
  steps: [],
  reports: {}
});

const finalSteps = [];

finalSteps.push(run("PROOF REPORT", "scripts/smartwork-siaga-proof-report-agent.mjs"));
if (!finalSteps.at(-1).ok) {
  existing.error = "PROOF_REPORT_FAILED";
}

finalSteps.push(run("APP ARTIFACTS FINALIZER", "scripts/smartwork-app-artifacts-summary.mjs"));
if (!finalSteps.at(-1).ok) {
  existing.error = existing.error || "APP_ARTIFACTS_FAILED";
}

const verifyRun = spawnSync(process.execPath, ["scripts/smartwork-verify-request-range-complete.mjs"], {
  cwd: root,
  encoding: "utf8",
  shell: false,
  timeout: 120000
});

let verify = {};
try {
  verify = JSON.parse(String(verifyRun.stdout || "").trim());
} catch {
  verify = {
    ok: verifyRun.status === 0,
    stdoutTail: String(verifyRun.stdout || "").slice(-4000),
    stderrTail: String(verifyRun.stderr || "").slice(-4000)
  };
}

const appArtifacts = readJson("reports/smartwork-app-artifacts-report.json", {});
const finalProgress = readJson("reports/smartwork-final-progress-report.json", {});
const downloadReport = readJson("reports/siaga-job-download-presensi-pdf-report.json", {});
const timePlan = readJson("reports/siaga-job-time-plan-preview-report.json", {});

const ok =
  verify?.ok === true &&
  appArtifacts?.ok === true &&
  finalProgress?.ok === true &&
  Number(downloadReport?.summary?.downloaded || downloadReport?.downloaded || 0) >= 1;

const patchedReport = {
  ...existing,
  ok,
  endedAt: new Date().toISOString(),
  cleanExit: true,
  error: ok ? null : (existing.error || "FINALIZE_CHECK_FAILED"),
  steps: [
    ...(Array.isArray(existing.steps) ? existing.steps : []),
    ...finalSteps
  ],
  reports: {
    ...(existing.reports || {}),
    verify,
    timePlanSummary: timePlan?.summary || null,
    downloadSummary: downloadReport?.summary || downloadReport || null,
    finalProgress: {
      ok: finalProgress?.ok,
      status: finalProgress?.status,
      verifyComplete: finalProgress?.verifyComplete,
      summary: finalProgress?.summary || null
    },
    appArtifacts: {
      ok: appArtifacts?.ok,
      artifactGuard: appArtifacts?.artifactGuard || null,
      artifacts: appArtifacts?.artifacts || null,
      uiText: appArtifacts?.uiText || null
    }
  }
};

writeJson(reportPath, patchedReport);

console.log("SMARTWORK_V6_PIPELINE_FINALIZE_CLEAN_EXIT=DONE");
console.log("REPORT=" + reportPath);
console.log(JSON.stringify({
  ok: patchedReport.ok,
  cleanExit: patchedReport.cleanExit,
  error: patchedReport.error,
  verifyOk: verify?.ok,
  finalProgressOk: finalProgress?.ok,
  appArtifactsOk: appArtifacts?.ok,
  downloaded: Number(downloadReport?.summary?.downloaded || downloadReport?.downloaded || 0)
}, null, 2));

process.exit(patchedReport.ok ? 0 : 1);
