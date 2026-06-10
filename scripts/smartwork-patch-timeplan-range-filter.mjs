import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const scriptPath = path.join(ROOT, "scripts", "smartwork-siaga-job-time-plan-preview.mjs");

if (!fs.existsSync(scriptPath)) {
  throw new Error("smartwork-siaga-job-time-plan-preview.mjs tidak ditemukan.");
}

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
  if (!src.includes(anchor)) throw new Error("Anchor function isExceptionDate tidak ditemukan.");
  src = src.replace(anchor, helper + "\n" + anchor);

  const anchor2 = "const isException = isExceptionDate(dayNumber, request);";
  if (!src.includes(anchor2)) throw new Error("Anchor isException tidak ditemukan.");
  src = src.replace(anchor2, anchor2 + "\n    const outsideRequestRange = isOutsideRequestRange(dayNumber, request);");

  const anchor3 = `} else if (isSunday) {
      status = "skip";
      reason = "Minggu dilewati.";`;

  if (!src.includes(anchor3)) throw new Error("Anchor Sunday status tidak ditemukan.");
  src = src.replace(anchor3, `} else if (outsideRequestRange) {
      status = "outside_request_range";
      reason = "Di luar rentang tanggal request user.";
    } else if (isSunday) {
      status = "skip";
      reason = "Minggu dilewati.";`);

  fs.writeFileSync(scriptPath, src, "utf8");
  console.log("PATCHED_TIMEPLAN_RANGE_FILTER=true");
} else {
  console.log("PATCHED_TIMEPLAN_RANGE_FILTER=already_present");
}
