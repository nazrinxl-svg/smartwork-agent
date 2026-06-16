import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
fs.mkdirSync(reportsDir, { recursive: true });

const timePlanPath = path.join(reportsDir, "siaga-job-time-plan-preview-report.json");
const localRequestPath = path.join(root, "data", "siaga-attendance-request.local.json");
const outputPath = path.join(reportsDir, "siaga-job-save-request-range-confirmed-report.json");

function readJson(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function pick(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function toIsoDate(value, year, month) {
  if (!year || !month) {
    throw new Error("STOP_MONTH_AGNOSTIC: year/month wajib berasal dari request aktif, bukan default Juni.");
  }
  if (value === undefined || value === null) return "";
  const s = String(value).trim();

  const full = s.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (full) return `${full[1]}-${full[2]}-${full[3]}`;

  const dmy = s.match(/\b([0-3]?\d)[\/\-]([01]?\d)[\/\-](20\d{2})\b/);
  if (dmy) {
    const dd = String(Number(dmy[1])).padStart(2, "0");
    const mm = String(Number(dmy[2])).padStart(2, "0");
    return `${dmy[3]}-${mm}-${dd}`;
  }

  const dayOnly = s.match(/^\s*([0-3]?\d)\s*$/);
  if (dayOnly) {
    const dd = Number(dayOnly[1]);
    if (dd >= 1 && dd <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }

  return "";
}

function inRange(date, start, end) {
  return date && (!start || date >= start) && (!end || date <= end);
}

function eachDate(start, end) {
  const out = [];
  const d = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const timePlan = readJson(timePlanPath, {});
const request = readJson(localRequestPath, {});

const startDate = pick(
  request.startDate,
  request?.request?.startDate,
  request?.payload?.startDate,
  timePlan?.request?.startDate
);

const endDate = pick(
  request.endDate,
  request?.request?.endDate,
  request?.payload?.endDate,
  timePlan?.request?.endDate
);

const teacherId = pick(
  request.teacherId,
  request?.request?.teacherId,
  request?.payload?.teacherId,
  timePlan?.results?.[0]?.teacherId,
  "guru-001"
);

if (!startDate || !endDate) {
  throw new Error("REQUEST_RANGE_MISSING_START_OR_END_DATE");
}

const year = Number(startDate.slice(0, 4)) || 2026;
const month = Number(startDate.slice(5, 7)) || 6;

const rows = (timePlan.results || []).flatMap((result) =>
  (result.rows || []).map((row) => ({
    ...row,
    teacherId: result.teacherId || teacherId,
    detailUrl: result.detailUrl
  }))
);

const plannedRows = rows.filter((row) => {
  const status = String(row.status || "").toLowerCase();
  return status === "needs_plan" || status.includes("needs_plan") || status.includes("planned");
});

let targetDates = plannedRows
  .map((row) =>
    toIsoDate(
      pick(
        row.targetDate,
        row.date,
        row.isoDate,
        row.dateIso,
        row.tanggalIso,
        row.tanggal,
        row.day,
        row.hariTanggal,
        row.rawDate,
        row.text
      ),
      year,
      month
    )
  )
  .filter((date) => inRange(date, startDate, endDate));

targetDates = [...new Set(targetDates)].sort();

if (targetDates.length === 0) {
  const totalPlanned = Number(timePlan?.summary?.totalPlanned || 0);
  const totalAlreadyFilled = Number(timePlan?.summary?.totalAlreadyFilled || 0);
  const totalSkipped = Number(timePlan?.summary?.totalSkipped || 0);

  if (totalPlanned > 0 && totalAlreadyFilled === 0 && totalSkipped === 0) {
    targetDates = eachDate(startDate, endDate);
  }
}

const report = {
  ok: false,
  mode: "SMARTWORK_SIAGA_SAVE_REQUEST_RANGE_CONFIRMED",
  rule: "CONFIRM_SAVE_YES_EXPLICIT_TARGET_DATE_ONLY_NO_TARGET_LIMIT_FALLBACK",
  startedAt: new Date().toISOString(),
  teacherId,
  requestRange: `${startDate}..${endDate}`,
  targetDates,
  timePlanSummary: timePlan.summary || {},
  results: []
};

if (targetDates.length === 0) {
  report.error = "NO_EXPLICIT_TARGET_DATES_DERIVED_FROM_TIMEPLAN";
  report.sampleRows = rows.slice(0, 10);
  report.endedAt = new Date().toISOString();
  writeJson(outputPath, report);
  console.error("SMARTWORK_SIAGA_SAVE_REQUEST_RANGE_CONFIRMED=FAILED");
  console.error(report.error);
  console.error("REPORT=" + outputPath);
  process.exit(1);
}

console.log("SMARTWORK_SIAGA_SAVE_REQUEST_RANGE_CONFIRMED=START");
console.log("RULE=REAL_SAVE_CONFIRMED_WITH_EXPLICIT_TARGET_DATE");
console.log(`REQUEST_RANGE=${startDate}..${endDate}`);
console.log(`TARGET_DATES=${targetDates.join(",")}`);

for (const targetDate of targetDates) {
  console.log(`\n=== SAVE TARGET_DATE=${targetDate} ===`);

  const child = spawnSync(
    process.execPath,
    ["scripts/smartwork-siaga-job-save-confirmed.mjs"],
    {
      cwd: root,
      shell: false,
      env: {
        ...process.env,
        CONFIRM_SAVE: "YES",
        TARGET_TEACHER_ID: teacherId,
        TARGET_DATE: targetDate,
        TARGET_LIMIT: "",
        SMARTWORK_REQUEST_RANGE: `${startDate}..${endDate}`
      },
      encoding: "utf8"
    }
  );

  const item = {
    targetDate,
    exitCode: child.status,
    ok: child.status === 0,
    stdoutTail: String(child.stdout || "").slice(-3000),
    stderrTail: String(child.stderr || "").slice(-3000)
  };

  report.results.push(item);

  process.stdout.write(child.stdout || "");
  process.stderr.write(child.stderr || "");

  writeJson(outputPath, {
    ...report,
    ok: report.results.every((x) => x.ok),
    endedAt: new Date().toISOString()
  });

  if (child.status !== 0) {
    console.error(`SMARTWORK_SIAGA_SAVE_REQUEST_RANGE_CONFIRMED=FAILED_AT_${targetDate}`);
    console.error("REPORT=" + outputPath);
    process.exit(child.status || 1);
  }
}

report.ok = report.results.every((x) => x.ok);
report.endedAt = new Date().toISOString();
writeJson(outputPath, report);

console.log("SMARTWORK_SIAGA_SAVE_REQUEST_RANGE_CONFIRMED=DONE");
console.log("REPORT=" + outputPath);
console.log(JSON.stringify({
  ok: report.ok,
  requestRange: report.requestRange,
  savedDates: report.results.filter((x) => x.ok).map((x) => x.targetDate),
  failed: report.results.filter((x) => !x.ok).length
}, null, 2));

process.exit(report.ok ? 0 : 1);
