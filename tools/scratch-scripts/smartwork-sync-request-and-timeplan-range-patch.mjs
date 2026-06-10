import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
}

const selectorPath = path.join(ROOT, "reports", "smartwork-real-request-selector-diagnose.json");
const selector = readJson(selectorPath);

if (!selector?.selected?.raw) {
  throw new Error("Selector report belum ada / belum menemukan selected.raw. Jalankan smartwork-real-request-selector-diagnose dulu.");
}

const req = selector.selected.raw;
const account = Array.isArray(req.accounts) ? req.accounts[0] : null;

if (!account) throw new Error("Request tidak punya accounts[0].");
if (account.teacherId !== "guru-001") throw new Error(`Guard stop: teacherId bukan guru-001, actual=${account.teacherId}`);
if (account.teacherName !== "Nazrin") throw new Error(`Guard stop: teacherName bukan Nazrin, actual=${account.teacherName}`);
if (account.startDate !== "2026-06-01" || account.endDate !== "2026-06-13") {
  throw new Error(`Guard stop: range bukan 2026-06-01..2026-06-13, actual=${account.startDate}..${account.endDate}`);
}

const localRequest = {
  ...req,
  startDate: req.startDate || account.startDate,
  endDate: req.endDate || account.endDate,
  targetMonth: req.targetMonth || "Juni",
  targetYear: req.targetYear || "2026",
  teacherId: account.teacherId,
  teacherName: account.teacherName,
  detailUrl: account.detailUrl,
  holidays: req?.schedule?.holidayDates || account.skipDates || [],
  leaveDays: req?.schedule?.leaveDates || account.leaveDates || [],
  accounts: [
    {
      ...account,
      startDate: account.startDate,
      endDate: account.endDate
    }
  ]
};

const localRequestPath = path.join(ROOT, "data", "siaga-attendance-request.local.json");
writeJson(localRequestPath, localRequest);

const jobPath = path.join(ROOT, "data", "jobs", `${req.jobId}.json`);
const existingJob = readJson(jobPath, null);

const job = {
  ...(existingJob || {}),
  jobId: req.jobId,
  service: "siaga",
  teacherId: "guru-001",
  teacherName: "Nazrin",
  targetMonth: "Juni",
  targetYear: "2026",
  startDate: "2026-06-01",
  endDate: "2026-06-13",
  status: existingJob?.status || "RUNNING",
  autoStart: true,
  autoStartSource: "request_submit",
  requestFile: selector.selected.file,
  detailUrl: account.detailUrl,
  updatedAt: new Date().toISOString(),
  createdAt: existingJob?.createdAt || new Date().toISOString(),
  runner: {
    ...(existingJob?.runner || {}),
    mode: "REQUEST_BASED_E2E",
    source: "autosave-real-request.json"
  }
};

writeJson(jobPath, job);

const scriptPath = path.join(ROOT, "scripts", "smartwork-siaga-job-time-plan-preview.mjs");
let src = fs.readFileSync(scriptPath, "utf8");

if (!src.includes("SMARTWORK_REQUEST_RANGE_PATCH_V1")) {
  const helper = `
/* SMARTWORK_REQUEST_RANGE_PATCH_V1 */
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

function toIsoDateFromDay(dayNumber, request) {
  const account = Array.isArray(request?.accounts) ? request.accounts[0] : {};
  const year = Number(request?.targetYear || account?.targetYear || 2026);
  const month = monthNameToNumber(request?.targetMonth || account?.targetMonth || "Juni");
  if (!year || !month || !dayNumber) return null;
  return String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-" + String(dayNumber).padStart(2, "0");
}

function requestRange(request) {
  const account = Array.isArray(request?.accounts) ? request.accounts[0] : {};
  return {
    startDate: request?.startDate || account?.startDate || null,
    endDate: request?.endDate || account?.endDate || null
  };
}

function isOutsideRequestRange(dayNumber, request) {
  const iso = toIsoDateFromDay(dayNumber, request);
  const range = requestRange(request);
  if (!iso || !range.startDate || !range.endDate) return false;
  return iso < range.startDate || iso > range.endDate;
}
/* END_SMARTWORK_REQUEST_RANGE_PATCH_V1 */
`;

  const anchor = "function isExceptionDate(dayNumber, request) {";
  if (!src.includes(anchor)) throw new Error("Patch gagal: anchor isExceptionDate tidak ditemukan.");
  src = src.replace(anchor, helper + "\n" + anchor);

  const anchor2 = "const isException = isExceptionDate(dayNumber, request);";
  if (!src.includes(anchor2)) throw new Error("Patch gagal: anchor isException tidak ditemukan.");
  src = src.replace(anchor2, anchor2 + "\n    const outsideRequestRange = isOutsideRequestRange(dayNumber, request);");

  const anchor3 = `} else if (isSunday) {
      status = "skip";
      reason = "Minggu dilewati.";`;

  if (!src.includes(anchor3)) throw new Error("Patch gagal: anchor status Sunday tidak ditemukan.");
  src = src.replace(anchor3, `} else if (outsideRequestRange) {
      status = "outside_request_range";
      reason = "Di luar rentang tanggal request user.";
    } else if (isSunday) {
      status = "skip";
      reason = "Minggu dilewati.";`);

  fs.writeFileSync(scriptPath, src, "utf8");
}

const out = {
  ok: true,
  mode: "SMARTWORK_SYNC_REQUEST_AND_PATCH_TIMEPLAN_RANGE",
  generatedAt: new Date().toISOString(),
  requestFile: selector.selected.file,
  localRequestPath,
  jobPath,
  requestRange: {
    startDate: account.startDate,
    endDate: account.endDate
  },
  teacherId: account.teacherId,
  teacherName: account.teacherName,
  detailUrl: account.detailUrl,
  patched: {
    timePlanRangePatch: true
  }
};

writeJson(path.join(ROOT, "reports", "smartwork-sync-request-and-timeplan-range-patch-report.json"), out);
console.log(JSON.stringify(out, null, 2));
