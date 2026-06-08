import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";

const root = process.cwd();
const reportsDir = path.join(root, "reports");

fs.mkdirSync(reportsDir, { recursive: true });

const reportPaths = {
  planner: path.join(reportsDir, "siaga-job-planner-report.json"),
  absensiOpen: path.join(reportsDir, "siaga-parallel-absensi-open-preview-report.json"),
  juniFind: path.join(reportsDir, "siaga-parallel-absensi-juni-find-preview-report.json"),
  createPreview: path.join(reportsDir, "siaga-target-month-create-preview-report.json"),
  runner: path.join(reportsDir, "siaga-job-runner-preview-report.json")
};

function now() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
  if (!raw) return null;
  return JSON.parse(raw);
}

function fileMtimeMs(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  return fs.statSync(filePath).mtimeMs;
}

function killProcessTree(pid) {
  if (!pid) return;
  spawnSync("cmd.exe", ["/c", "taskkill", "/PID", String(pid), "/T", "/F"], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
}

async function runNpmScriptAndWaitReport(scriptName, expectedReportPath, options = {}) {
  const startedAt = now();
  const startMs = Date.now();
  const beforeReportMtime = fileMtimeMs(expectedReportPath);
  const timeoutMs = options.timeoutMs || 90000;

  console.log("");
  console.log(`=== RUN ${scriptName} ===`);
  console.log(`WAIT_REPORT=${path.relative(root, expectedReportPath).replaceAll("\\", "/")}`);
  console.log(`TIMEOUT_MS=${timeoutMs}`);

  const child = spawn("cmd.exe", ["/c", "npm", "run", scriptName], {
    cwd: root,
    shell: false,
    windowsHide: false,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  let exitCode = null;
  let childExited = false;

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

  child.on("exit", (code) => {
    exitCode = code;
    childExited = true;
  });

  let report = null;
  let reportReady = false;
  let timedOut = false;

  while (Date.now() - startMs < timeoutMs) {
    const currentMtime = fileMtimeMs(expectedReportPath);

    if (currentMtime > beforeReportMtime) {
      report = readJsonSafe(expectedReportPath);
      if (report) {
        reportReady = true;
        break;
      }
    }

    if (childExited) {
      report = readJsonSafe(expectedReportPath);
      reportReady = Boolean(report);
      break;
    }

    await sleep(1000);
  }

  if (!reportReady) {
    timedOut = true;
    report = readJsonSafe(expectedReportPath);
    reportReady = Boolean(report);
  }

  if (!childExited) {
    console.log("");
    console.log(`CHILD_STILL_OPEN_AFTER_REPORT_OR_TIMEOUT=true`);
    console.log(`KILL_NODE_TREE_PID=${child.pid}`);
    killProcessTree(child.pid);
    await sleep(1000);
  }

  return {
    scriptName,
    startedAt,
    endedAt: now(),
    expectedReport: path.relative(root, expectedReportPath).replaceAll("\\", "/"),
    exitCode,
    childExited,
    reportReady,
    timedOut,
    ok: reportReady && report?.ok !== false,
    stdoutTail: stdout.slice(-4000),
    stderrTail: stderr.slice(-4000),
    reportSummary: report?.summary || null
  };
}

function writeRunnerReport(report) {
  fs.writeFileSync(reportPaths.runner, JSON.stringify(report, null, 2), "utf8");
}

async function main() {
  console.log("SMARTWORK_SIAGA_JOB_RUNNER_PREVIEW=START");
  console.log("RULE=PREVIEW_ONLY_NO_INPUT_JAM_NO_SAVE_NO_SUBMIT_NO_DELETE");
  console.log("FLOW=REPORT_POLL_MODE_PLAN_OPEN_FIND_CREATE_IF_MISSING");

  const steps = [];
  const startedAt = now();

  const plannerStep = await runNpmScriptAndWaitReport(
    "siaga:job:plan",
    reportPaths.planner,
    { timeoutMs: 30000 }
  );
  steps.push(plannerStep);

  const plannerReport = readJsonSafe(reportPaths.planner);
  if (!plannerStep.ok || !plannerReport?.ok) {
    const report = {
      ok: false,
      mode: "siaga-job-runner-preview",
      rule: "STOPPED_AT_PLANNER_NO_BROWSER_SAVE",
      startedAt,
      endedAt: now(),
      steps,
      reports: { planner: plannerReport },
      summary: {
        plannerOk: Boolean(plannerReport?.ok),
        absensiOpenRan: false,
        juniFindRan: false,
        createPreviewRan: false,
        stoppedReason: "planner_not_ok"
      }
    };

    writeRunnerReport(report);
    console.log("SMARTWORK_SIAGA_JOB_RUNNER_PREVIEW=STOPPED_AT_PLANNER");
    console.log("REPORT=" + reportPaths.runner);
    console.log(JSON.stringify(report.summary, null, 2));
    process.exitCode = 1;
    return;
  }

  const absensiOpenStep = await runNpmScriptAndWaitReport(
    "siaga:parallel:absensi-open-preview",
    reportPaths.absensiOpen,
    { timeoutMs: 90000 }
  );
  steps.push(absensiOpenStep);

  const absensiOpenReport = readJsonSafe(reportPaths.absensiOpen);

  const juniFindStep = await runNpmScriptAndWaitReport(
    "siaga:parallel:absensi-juni-find-preview",
    reportPaths.juniFind,
    { timeoutMs: 90000 }
  );
  steps.push(juniFindStep);

  const juniFindReport = readJsonSafe(reportPaths.juniFind);

  const needsCreatePreview =
    Number(juniFindReport?.summary?.juniDetailPreviewNeedsCheck || 0) > 0 ||
    Number(juniFindReport?.summary?.failed || 0) > 0;

  let createPreviewReport = null;

  if (needsCreatePreview) {
    console.log("");
    console.log("CREATE_PREVIEW_DECISION=RUN_BECAUSE_TARGET_DETAIL_NEEDS_CHECK_OR_FAILED");

    const createPreviewStep = await runNpmScriptAndWaitReport(
      "siaga:target-month:create-preview",
      reportPaths.createPreview,
      { timeoutMs: 90000 }
    );

    steps.push(createPreviewStep);
    createPreviewReport = readJsonSafe(reportPaths.createPreview);
  } else {
    console.log("");
    console.log("CREATE_PREVIEW_DECISION=SKIP_ALL_TARGET_DETAILS_FOUND");
  }

  const report = {
    ok: steps.every((step) => step.ok),
    mode: "siaga-job-runner-preview",
    rule: "PREVIEW_ONLY_NO_INPUT_JAM_NO_SAVE_NO_SUBMIT_NO_DELETE",
    engine: "report-poll-mode",
    startedAt,
    endedAt: now(),
    flow: [
      "siaga:job:plan",
      "siaga:parallel:absensi-open-preview",
      "siaga:parallel:absensi-juni-find-preview",
      needsCreatePreview ? "siaga:target-month:create-preview" : "skip_create_preview_all_target_details_found"
    ],
    steps,
    decisions: {
      needsCreatePreview
    },
    reports: {
      planner: plannerReport,
      absensiOpen: absensiOpenReport,
      juniFind: juniFindReport,
      createPreview: createPreviewReport
    },
    summary: {
      plannerOk: Boolean(plannerReport?.ok),
      totalJobs: plannerReport?.summary?.totalJobs || 0,
      credentialReady: plannerReport?.summary?.credentialReady || 0,
      absensiOpenPreviewSuccess: absensiOpenReport?.summary?.absensiOpenPreviewSuccess || 0,
      absensiOpenPreviewNeedsCheck: absensiOpenReport?.summary?.absensiOpenPreviewNeedsCheck || 0,
      juniDetailPreviewSuccess: juniFindReport?.summary?.juniDetailPreviewSuccess || 0,
      juniDetailPreviewNeedsCheck: juniFindReport?.summary?.juniDetailPreviewNeedsCheck || 0,
      createPreviewRan: needsCreatePreview,
      createPreviewAlreadyExists: createPreviewReport?.summary?.alreadyExists || 0,
      createPreviewPrepared: createPreviewReport?.summary?.prepared || 0,
      createPreviewNeedsCheck: createPreviewReport?.summary?.needsCheck || 0,
      failedSteps: steps.filter((step) => !step.ok).map((step) => step.scriptName)
    }
  };

  writeRunnerReport(report);

  console.log("");
  console.log("SMARTWORK_SIAGA_JOB_RUNNER_PREVIEW=DONE");
  console.log("REPORT=" + reportPaths.runner);
  console.log(JSON.stringify(report.summary, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const report = {
    ok: false,
    mode: "siaga-job-runner-preview",
    rule: "PREVIEW_ONLY_NO_INPUT_JAM_NO_SAVE_NO_SUBMIT_NO_DELETE",
    engine: "report-poll-mode",
    error: error.message,
    endedAt: now()
  };

  writeRunnerReport(report);
  console.error("SMARTWORK_SIAGA_JOB_RUNNER_PREVIEW=FAILED");
  console.error(error.message);
  console.error("REPORT=" + reportPaths.runner);
  process.exit(1);
});
