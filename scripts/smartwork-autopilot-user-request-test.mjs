import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "smartwork-autopilot-user-request-test-report.json");

function now() {
  return new Date().toISOString();
}

function run(label, command, args, envPatch = {}) {
  const startedAt = now();
  console.log(`\n=== ${label} ===`);
  console.log([command, ...args].join(" "));
  if (Object.keys(envPatch).length) {
    console.log("ENV_PATCH=" + JSON.stringify(Object.keys(envPatch)));
  }

  const result = spawnSync(command, args, {
    cwd: ROOT,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, ...envPatch }
  });

  const endedAt = now();

  if (result.status !== 0) {
    throw new Error(`${label} gagal dengan exit code ${result.status}`);
  }

  return {
    label,
    command: [command, ...args].join(" "),
    startedAt,
    endedAt,
    ok: true
  };
}

function readJsonSafe(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

const steps = [];

console.log("SMARTWORK_AUTOPILOT_USER_REQUEST_TEST=START");
console.log("RULE=USER_REQUEST_TO_RESULT_ADMIN_NO_MANUAL_SIAGA_WORK");
console.log("SAFETY=ONLY_RUN_EXISTING_SUCCESS_PATH_FOR_ACTIVE_UI_REQUEST");

try {
  steps.push(run("1_PROMOTION_DIAGNOSE", "node", ["scripts/smartwork-request-promotion-diagnose.mjs"]));

  const diagnose = readJsonSafe("reports/smartwork-request-promotion-diagnose-report.json", {});
  console.log("\nLATEST_VALID_UI_REQUEST=" + (diagnose?.latestValidUiRequest?.requestRange || diagnose?.latestValidRequestRange || "unknown"));
  console.log("ACTIVE_REQUEST=" + (diagnose?.activeRequest?.requestRange || diagnose?.activeRequestRange || "unknown"));
  console.log("PROMOTE_NEEDED=" + String(diagnose?.promoteNeeded));

  steps.push(run("2_PROMOTE_LATEST_UI_REQUEST", "node", ["scripts/smartwork-promote-latest-ui-request.mjs"]));
  steps.push(run("3_RESET_PROGRESS_PENDING_0", "node", ["scripts/smartwork-reset-canonical-progress-after-promotion.mjs"]));

  const active = readJsonSafe("data/siaga-attendance-request.local.json", {});
  console.log("\nACTIVE_AFTER_PROMOTE=" + (active.requestRange || `${active.startDate}..${active.endDate}`));
  console.log("TEACHER=" + (active.teacherName || active.teacherId || "unknown"));

  steps.push(run("4_RUN_EXISTING_RUNNER_PREVIEW", "npm", ["run", "siaga:job:runner-preview"]));
  steps.push(run("4B_RUN_TIME_PLAN_PREVIEW", "node", ["scripts/smartwork-siaga-job-time-plan-preview.mjs"]));
  steps.push(run("5_RUN_SAVE_CONFIRMED", "npm", ["run", "siaga:job:save-confirmed"], { CONFIRM_SAVE: "YES" }));
  steps.push(run("6_DOWNLOAD_PRESENSI_PDF", "npm", ["run", "siaga:job:download-presensi-pdf"]));
  steps.push(run("7_FINALIZE_APP_ARTIFACTS", "npm", ["run", "app:artifacts"]));

  const appArtifacts = readJsonSafe("reports/smartwork-app-artifacts-report.json", {});
  const live = readJsonSafe("reports/smartwork-progress-live-state.json", {});
  const finalProgress = readJsonSafe("reports/smartwork-final-progress-report.json", {});

  const report = {
    ok: true,
    mode: "SMARTWORK_AUTOPILOT_USER_REQUEST_TEST",
    generatedAt: now(),
    rule: "USER_SUBMITS_REQUEST_ADMIN_NO_MANUAL_WORK",
    steps,
    activeRequest: active,
    appArtifacts,
    liveProgress: live,
    finalProgress,
    safety: {
      adminManualSiagaInput: false,
      usedExistingRunnerPath: true,
      randomDiagnosisBranch: false
    }
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");

  console.log("\nSMARTWORK_AUTOPILOT_USER_REQUEST_TEST=DONE");
  console.log("REPORT=" + path.relative(ROOT, OUT));
  console.log("APP_ARTIFACTS_OK=" + String(appArtifacts?.ok));
  console.log("LIVE_PERCENT=" + String(live?.percent ?? live?.progress?.percent ?? "unknown"));
  console.log("FINAL_VERIFY_COMPLETE=" + String(finalProgress?.verifyComplete ?? "unknown"));
} catch (error) {
  const report = {
    ok: false,
    mode: "SMARTWORK_AUTOPILOT_USER_REQUEST_TEST",
    generatedAt: now(),
    error: error.message,
    steps,
    safety: {
      adminManualSiagaInput: false,
      usedExistingRunnerPath: true,
      randomDiagnosisBranch: false
    }
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");

  console.error("\nSMARTWORK_AUTOPILOT_USER_REQUEST_TEST=FAILED");
  console.error("ERROR=" + error.message);
  console.error("REPORT=" + path.relative(ROOT, OUT));
  process.exitCode = 1;
}


