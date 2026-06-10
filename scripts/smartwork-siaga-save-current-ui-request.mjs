import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "reports", "smartwork-save-current-ui-request-report.json");

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").trim());
  } catch (err) {
    return { __error: err.message, file };
  }
}

function writeReport(report) {
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n", "utf8");
}

function runStep(name, cmd, args, env = {}) {
  console.log(`\n=== STEP: ${name} ===`);
  const startedAt = new Date().toISOString();
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: false
  });

  const endedAt = new Date().toISOString();

  return {
    name,
    cmd: [cmd, ...args].join(" "),
    startedAt,
    endedAt,
    exitCode: res.status,
    ok: res.status === 0
  };
}

function collectNeedsPlanRows(node, out = []) {
  if (!node || typeof node !== "object") return out;

  if (
    node.status === "needs_plan" &&
    node.tanggal != null &&
    node.plan &&
    typeof node.plan === "object"
  ) {
    out.push(node);
  }

  if (Array.isArray(node)) {
    for (const item of node) collectNeedsPlanRows(item, out);
  } else {
    for (const value of Object.values(node)) collectNeedsPlanRows(value, out);
  }

  return out;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function monthNumber(request) {
  const m = String(request.targetMonth || "").toLowerCase();
  const map = {
    januari: "01",
    februari: "02",
    maret: "03",
    april: "04",
    mei: "05",
    juni: "06",
    juli: "07",
    agustus: "08",
    september: "09",
    oktober: "10",
    november: "11",
    desember: "12"
  };
  return map[m] || "06";
}

function rowIso(row, request) {
  if (row.isoDate) return String(row.isoDate).slice(0, 10);
  return `${request.targetYear || "2026"}-${monthNumber(request)}-${pad2(row.tanggal)}`;
}

const report = {
  ok: false,
  mode: "SMARTWORK_SAVE_CURRENT_UI_REQUEST",
  generatedAt: new Date().toISOString(),
  steps: [],
  savedDates: [],
  failedDates: []
};

try {
  const request = readJson(path.join(ROOT, "data", "siaga-attendance-request.local.json"), {});
  const account = Array.isArray(request.accounts) ? request.accounts[0] : {};
  const startDate = request.startDate || account.startDate;
  const endDate = request.endDate || account.endDate;
  const teacherId = request.teacherId || account.teacherId || "guru-001";

  if (request.source !== "smartwork-user-request-form") {
    throw new Error(`STOP: request source bukan UI form: ${request.source}`);
  }

  if (!startDate || !endDate) {
    throw new Error("STOP: startDate/endDate kosong.");
  }

  report.request = {
    source: request.source,
    teacherId,
    teacherName: request.teacherName || account.teacherName || null,
    range: `${startDate}..${endDate}`,
    detailUrl: request.detailUrl || account.detailUrl || null
  };

  report.steps.push(runStep(
    "time-plan-preview-before-save",
    process.execPath,
    ["scripts/smartwork-siaga-job-time-plan-preview.mjs"]
  ));

  if (!report.steps.at(-1).ok) {
    throw new Error("time-plan-preview-before-save failed");
  }

  let plan = readJson(path.join(ROOT, "reports", "siaga-job-time-plan-preview-report.json"), {});
  const allNeeds = collectNeedsPlanRows(plan, []);
  const targets = allNeeds
    .map((row) => ({ ...row, isoDate: rowIso(row, request) }))
    .filter((row) => row.isoDate >= startDate && row.isoDate <= endDate)
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));

  report.targets = targets.map((row) => ({
    tanggal: row.tanggal,
    hari: row.hari,
    isoDate: row.isoDate,
    plan: row.plan
  }));

  if (!targets.length) {
    report.ok = true;
    report.message = "Tidak ada needs_plan di dalam request aktif.";
    writeReport(report);
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  for (const target of targets) {
    if (target.isoDate < startDate || target.isoDate > endDate) {
      throw new Error(`BUG: target ${target.isoDate} di luar request ${startDate}..${endDate}`);
    }

    report.steps.push(runStep(
      `save-confirmed-${target.isoDate}`,
      process.execPath,
      ["scripts/smartwork-siaga-job-save-confirmed.mjs"],
      {
        CONFIRM_SAVE: "YES",
        TARGET_TEACHER_ID: teacherId,
        TARGET_DATE: target.isoDate,
        TARGET_LIMIT: "1"
      }
    ));

    if (!report.steps.at(-1).ok) {
      report.failedDates.push(target.isoDate);
      throw new Error(`save-confirmed failed for ${target.isoDate}`);
    }

    const saveReport = readJson(path.join(ROOT, "reports", "siaga-job-save-confirmed-report.json"), {});
    if (saveReport.ok !== true) {
      report.failedDates.push(target.isoDate);
      report.lastSaveReport = saveReport;
      throw new Error(`save-confirmed report not ok for ${target.isoDate}`);
    }

    report.savedDates.push(target.isoDate);

    report.steps.push(runStep(
      `verify-plan-after-${target.isoDate}`,
      process.execPath,
      ["scripts/smartwork-siaga-job-time-plan-preview.mjs"]
    ));

    if (!report.steps.at(-1).ok) {
      throw new Error(`time-plan-preview after ${target.isoDate} failed`);
    }

    plan = readJson(path.join(ROOT, "reports", "siaga-job-time-plan-preview-report.json"), {});
    const stillNeeds = collectNeedsPlanRows(plan, [])
      .map((row) => ({ ...row, isoDate: rowIso(row, request) }))
      .some((row) => row.isoDate === target.isoDate);

    if (stillNeeds) {
      throw new Error(`Verify gagal: ${target.isoDate} masih needs_plan setelah save.`);
    }
  }

  report.ok = true;
  report.endedAt = new Date().toISOString();
  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
} catch (err) {
  report.ok = false;
  report.error = err?.message || String(err);
  report.endedAt = new Date().toISOString();
  writeReport(report);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
