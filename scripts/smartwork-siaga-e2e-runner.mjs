import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { readJsonSafe, writeJsonSafe } from "../lib/smartwork-request-selector.mjs";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "reports", "smartwork-siaga-e2e-runner-report.json");

function log(msg) {
  console.log(msg);
}

function runStep(name, cmd, args, extraEnv = {}) {
  log(`\n=== STEP: ${name} ===`);
  const startedAt = new Date().toISOString();

  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    shell: false,
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv
    }
  });

  const endedAt = new Date().toISOString();

  if (res.status !== 0) {
    throw new Error(`Step failed: ${name}, exit=${res.status}`);
  }

  return {
    name,
    cmd: [cmd, ...args].join(" "),
    startedAt,
    endedAt,
    ok: true
  };
}

function monthNameToNumber(monthName) {
  const s = String(monthName || "").toLowerCase();
  const map = {
    januari: 1, january: 1,
    februari: 2, february: 2,
    maret: 3, march: 3,
    april: 4,
    mei: 5, may: 5,
    juni: 6, june: 6,
    juli: 7, july: 7,
    agustus: 8, august: 8,
    september: 9,
    oktober: 10, october: 10,
    november: 11,
    desember: 12, december: 12
  };
  return map[s] || null;
}

function dayToIso(day, request) {
  const account = Array.isArray(request.accounts) ? request.accounts[0] : {};
  const year = Number(request.targetYear || account.targetYear);
  const month = monthNameToNumber(request.targetMonth || account.targetMonth);
  if (!year || !month || !day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getInsideNeedsPlan() {
  const request = readJsonSafe(path.join(ROOT, "data", "siaga-attendance-request.local.json"), {});
  const account = Array.isArray(request.accounts) ? request.accounts[0] : {};
  const startDate = request.startDate || account.startDate;
  const endDate = request.endDate || account.endDate;

  const plan = readJsonSafe(path.join(ROOT, "reports", "siaga-job-time-plan-preview-report.json"), {});
  const rows = plan?.results?.[0]?.rows || [];

  const inside = rows.filter((x) => {
    const iso = dayToIso(Number(x.tanggal), request);
    return iso && iso >= startDate && iso <= endDate;
  });

  const needs = inside
    .filter((x) => x.status === "needs_plan")
    .map((x) => ({
      ...x,
      isoDate: dayToIso(Number(x.tanggal), request)
    }));

  return {
    request,
    account,
    startDate,
    endDate,
    inside,
    needs
  };
}

function envFromRequest(request, account) {
  return {
    TARGET_TEACHER_ID: request.teacherId || account.teacherId || "guru-001",
    TARGET_DETAIL_URL: request.detailUrl || account.detailUrl || "",
    TARGET_MONTH: request.targetMonth || account.targetMonth || "Juni",
    TARGET_YEAR: String(request.targetYear || account.targetYear || "2026"),
    SMARTWORK_JOB_ID: request.jobId || ""
  };
}

const startedAt = new Date().toISOString();
const steps = [];
const mode = process.env.SMARTWORK_E2E_MODE || "REAL_SAVE_GUARDED";
const dryRun = mode === "DRY_RUN_NO_SAVE";

try {
  log("SMARTWORK_SIAGA_E2E_RUNNER=START");
  log(`MODE=${mode}`);

  steps.push(runStep(
    "sync-latest-request",
    "node",
    ["scripts/smartwork-sync-latest-request.mjs"]
  ));

  const request0 = readJsonSafe(path.join(ROOT, "data", "siaga-attendance-request.local.json"), {});
  const account0 = Array.isArray(request0.accounts) ? request0.accounts[0] : {};
  const baseEnv = envFromRequest(request0, account0);

  steps.push(runStep(
    "time-plan-preview",
    "node",
    ["scripts/smartwork-siaga-job-time-plan-preview.mjs"],
    baseEnv
  ));

  let state = getInsideNeedsPlan();

  const decision = {
    requestRange: `${state.startDate}..${state.endDate}`,
    teacherId: state.request.teacherId || state.account.teacherId,
    teacherName: state.request.teacherName || state.account.teacherName,
    detailUrl: state.request.detailUrl || state.account.detailUrl,
    totalInsideRequest: state.inside.length,
    needsPlanInsideRequest: state.needs.map((x) => ({
      tanggal: x.tanggal,
      hari: x.hari,
      isoDate: x.isoDate,
      plan: x.plan
    })),
    dryRun
  };

  writeJsonSafe(path.join(ROOT, "reports", "smartwork-siaga-e2e-runner-decision.json"), decision);
  log(JSON.stringify(decision, null, 2));

  if (dryRun) {
    log("DRY_RUN_NO_SAVE=true, stop before save/download/proof/finalize.");
    const dryReport = {
      ok: true,
      mode,
      startedAt,
      endedAt: new Date().toISOString(),
      steps,
      decision,
      stoppedBeforeAction: true
    };
    writeJsonSafe(REPORT, dryReport);
    console.log(JSON.stringify(dryReport, null, 2));
    process.exit(0);
  }

  for (const item of state.needs) {
    const targetDate = item.isoDate;
    if (!targetDate) {
      throw new Error(`Tidak bisa resolve targetDate untuk tanggal=${item.tanggal}`);
    }

    steps.push(runStep(
      `save-confirmed-${targetDate}`,
      "node",
      ["scripts/smartwork-siaga-job-save-confirmed.mjs"],
      {
        ...baseEnv,
        TARGET_DATE: targetDate,
        CONFIRM_SAVE: "YES"
      }
    ));

    steps.push(runStep(
      `verify-time-plan-after-save-${targetDate}`,
      "node",
      ["scripts/smartwork-siaga-job-time-plan-preview.mjs"],
      baseEnv
    ));

    const after = getInsideNeedsPlan();
    const stillNeedsSameDate = after.needs.some((x) => x.isoDate === targetDate);

    if (stillNeedsSameDate) {
      throw new Error(`Verify after-save gagal: ${targetDate} masih needs_plan.`);
    }
  }

  steps.push(runStep(
    "verify-request-range-complete",
    "node",
    ["scripts/smartwork-verify-request-range-complete.mjs"],
    baseEnv
  ));

  steps.push(runStep(
    "download-presensi-pdf",
    "node",
    ["scripts/smartwork-siaga-job-download-presensi-pdf.mjs"],
    baseEnv
  ));

  steps.push(runStep(
    "proof-report",
    "node",
    ["scripts/smartwork-siaga-proof-report-agent.mjs"],
    baseEnv
  ));

  steps.push(runStep(
    "finalize-progress",
    "node",
    ["scripts/smartwork-finalize-progress.mjs"],
    baseEnv
  ));

  const finalProgress = readJsonSafe(path.join(ROOT, "reports", "smartwork-final-progress-report.json"), {});
  const ok = Boolean(finalProgress.ok);

  const report = {
    ok,
    mode,
    startedAt,
    endedAt: new Date().toISOString(),
    steps,
    decision,
    finalProgress
  };

  writeJsonSafe(REPORT, report);

  console.log(JSON.stringify({
    ok,
    status: finalProgress.status,
    requestRange: finalProgress.requestRange,
    pdfReady: finalProgress?.artifacts?.pdfReady,
    proofReady: finalProgress?.artifacts?.proofReady,
    remainingNeedsPlanInsideRequest: finalProgress?.requestedDatesResult?.remainingNeedsPlanInsideRequest || [],
    report: path.relative(ROOT, REPORT).replaceAll("\\", "/")
  }, null, 2));

  if (!ok) {
    throw new Error("E2E selesai tapi finalProgress.ok bukan true.");
  }

  log("SMARTWORK_SIAGA_E2E_RUNNER=DONE");
} catch (err) {
  const failed = {
    ok: false,
    mode,
    startedAt,
    endedAt: new Date().toISOString(),
    error: String(err?.stack || err?.message || err),
    steps
  };
  writeJsonSafe(REPORT, failed);
  console.error(failed.error);
  process.exit(1);
}
