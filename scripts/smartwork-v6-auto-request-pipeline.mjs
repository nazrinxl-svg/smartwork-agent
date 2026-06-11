import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const ROOT = process.cwd();
const reportsDir = path.join(ROOT, "reports");
fs.mkdirSync(reportsDir, { recursive: true });

const reportPath = path.join(reportsDir, "smartwork-v6-auto-request-pipeline-report.json");
const logPath = path.join(reportsDir, "smartwork-v6-auto-request-pipeline.log");

const startedAt = new Date().toISOString();

function writeReport(data) {
  fs.writeFileSync(reportPath, JSON.stringify(data, null, 2));
}

function appendLog(line) {
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`);
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  } catch {
    return fallback;
  }
}

function runStep(label, cmd, args = [], env = {}) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    appendLog(`START ${label}: ${cmd} ${args.join(" ")}`);

    const child = spawn(cmd, args, {
      cwd: ROOT,
      shell: true,
      env: {
        ...process.env,
        ...env
      }
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("close", (code, signal) => {
      const endedAt = new Date().toISOString();
      appendLog(`END ${label}: code=${code} signal=${signal || ""}`);

      resolve({
        label,
        cmd: `${cmd} ${args.join(" ")}`.trim(),
        startedAt,
        endedAt,
        exitCode: code,
        signal,
        ok: code === 0,
        stdoutTail: stdout.slice(-3000),
        stderrTail: stderr.slice(-3000)
      });
    });
  });
}

const result = {
  ok: false,
  mode: "SMARTWORK_V6_AUTO_REQUEST_PIPELINE_MODERN_REQUEST_BASED",
  purpose: "Triggered by request_submit. Sync latest request, plan from request range, save real SIAGA if needed, verify, download PDF, generate proof/app artifacts.",
  startedAt,
  endedAt: null,
  steps: [],
  decision: null,
  reports: {},
  error: null
};

writeReport(result);

try {
  result.steps.push(await runStep("1. SYNC LATEST UI REQUEST", "node", ["scripts/smartwork-sync-latest-request.mjs"]));

  if (!result.steps.at(-1).ok) {
    throw new Error("SYNC_LATEST_REQUEST_FAILED");
  }

  const syncReport = readJson("reports/smartwork-sync-latest-request-report.json", {});
  const normalized = syncReport?.selectedRequest?.normalized || {};
  const requestRange = `${normalized.startDate || ""}..${normalized.endDate || ""}`;

  result.decision = {
    jobId: normalized.jobId || null,
    teacherId: normalized.teacherId || null,
    teacherName: normalized.teacherName || null,
    startDate: normalized.startDate || null,
    endDate: normalized.endDate || null,
    requestRange,
    detailUrl: normalized.detailUrl || null,
    source: normalized.source || null
  };

  if (normalized.teacherId !== "guru-001" || normalized.teacherName !== "Nazrin") {
    throw new Error(`GUARD_STOP_WRONG_TEACHER actual=${normalized.teacherId}/${normalized.teacherName}`);
  }

  if (!normalized.startDate || !normalized.endDate) {
    throw new Error("GUARD_STOP_MISSING_DATE_RANGE");
  }

  if (!normalized.detailUrl) {
    throw new Error("GUARD_STOP_MISSING_DETAIL_URL");
  }

  result.steps.push(await runStep("2. RUNNER PREVIEW FIND TARGET MONTH", "node", ["scripts/smartwork-siaga-job-runner-preview-modern.mjs"]));

  if (!result.steps.at(-1).ok) {
    throw new Error("RUNNER_PREVIEW_FAILED");
  }

  result.steps.push(await runStep("2B. ENSURE SIAGA PARALLEL LOGIN SESSION", "node", ["scripts/smartwork-siaga-parallel-login-check.mjs"]));

  if (!result.steps.at(-1).ok) {
    throw new Error("SIAGA_PARALLEL_LOGIN_CHECK_FAILED");
  }

  result.steps.push(await runStep("3. TIME PLAN PREVIEW", "node", ["scripts/smartwork-siaga-job-time-plan-preview.mjs"]));

  if (!result.steps.at(-1).ok) {
    throw new Error("TIME_PLAN_PREVIEW_FAILED");
  }

  const timePlan = readJson("reports/siaga-job-time-plan-preview-report.json", {});
  const summary = timePlan?.summary || {};
  const needsPlan = Number(summary.totalPlanned ?? summary.planned ?? 0);
  const alreadyFilled = Number(summary.totalAlreadyFilled ?? summary.alreadyFilled ?? 0);
  const skipped = Number(summary.totalSkipped ?? summary.skipped ?? 0);
  const totalRows = Number(summary.totalRows ?? 0);

  result.reports.timePlanSummary = {
    totalRows,
    alreadyFilled,
    needsPlan,
    skipped
  };

  if (needsPlan > 0) {
    result.steps.push(await runStep(
      "3. SAVE CONFIRMED EXPLICIT TARGET DATES FROM REQUEST RANGE",
      "node",
      ["scripts/smartwork-siaga-job-save-request-range-confirmed.mjs"],
      {
        CONFIRM_SAVE: "YES",
        SMARTWORK_REQUEST_AUTORUN: "YES",
        SMARTWORK_REQUIRE_UI_REQUEST_RANGE: "YES"
      }
    ));

    if (!result.steps.at(-1).ok) {
      throw new Error("SAVE_CONFIRMED_FAILED");
    }
  } else {
    appendLog("SKIP SAVE: no planned rows. SIAGA may already be filled or request range has no workdays.");
    result.steps.push({
      label: "3. SAVE CONFIRMED EXPLICIT TARGET DATES FROM REQUEST RANGE",
      cmd: "SKIPPED",
      ok: true,
      skipped: true,
      reason: "No planned rows from time-plan preview.",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      exitCode: 0
    });
  }

  result.steps.push(await runStep("4. VERIFY REQUEST RANGE COMPLETE", "node", ["scripts/smartwork-verify-request-range-complete.mjs"]));

  if (!result.steps.at(-1).ok) {
    throw new Error("VERIFY_REQUEST_RANGE_FAILED");
  }

  result.steps.push(await runStep("5. DOWNLOAD PRESENSI PDF", "node", ["scripts/smartwork-siaga-job-download-presensi-pdf.mjs"]));

  if (!result.steps.at(-1).ok) {
    throw new Error("DOWNLOAD_PDF_FAILED");
  }

  result.steps.push(await runStep("6. FINALIZE PROOF AND APP ARTIFACTS CLEAN EXIT", "node", ["scripts/smartwork-v6-pipeline-finalize-clean-exit.mjs"]));

  if (!result.steps.at(-1).ok) {
    throw new Error("PIPELINE_FINALIZE_CLEAN_EXIT_FAILED");
  }

  result.ok = true;
  result.endedAt = new Date().toISOString();
  result.reports.finalProgress = readJson("reports/smartwork-final-progress-report.json", null);
  result.reports.appArtifacts = readJson("reports/smartwork-app-artifacts-report.json", null);
  writeReport(result);

  console.log(JSON.stringify({
    ok: true,
    mode: result.mode,
    decision: result.decision,
    timePlanSummary: result.reports.timePlanSummary,
    report: reportPath
  }, null, 2));
} catch (err) {
  result.ok = false;
  result.endedAt = new Date().toISOString();
  result.error = String(err?.message || err);
  writeReport(result);

  console.error(JSON.stringify({
    ok: false,
    mode: result.mode,
    error: result.error,
    decision: result.decision,
    report: reportPath
  }, null, 2));

  process.exit(1);
}

