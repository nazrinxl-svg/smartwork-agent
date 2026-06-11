import fs from "fs";
import path from "path";
import { readJsonSafe, writeJsonSafe } from "../lib/smartwork-request-selector.mjs";

const ROOT = process.cwd();

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
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const request = readJsonSafe(path.join(ROOT, "data", "siaga-attendance-request.local.json"), {});
const account = Array.isArray(request.accounts) ? request.accounts[0] : {};

const startDate = request.startDate || account.startDate;
const endDate = request.endDate || account.endDate;

const plan = readJsonSafe(path.join(ROOT, "reports", "siaga-job-time-plan-preview-report.json"), {});
const rows = plan?.results?.[0]?.rows || [];

const inside = rows.filter((x) => {
  const iso = dayToIso(Number(x.tanggal), request);
  return iso >= startDate && iso <= endDate;
});

const remainingNeeds = inside.filter((x) => x.status === "needs_plan");

const ok = Boolean(
  inside.length > 0 &&
  remainingNeeds.length === 0
);

const out = {
  ok,
  generatedAt: new Date().toISOString(),
  requestRange: `${startDate}..${endDate}`,
  insideSummary: {
    total: inside.length,
    alreadyFilled: inside.filter((x) => x.status === "already_filled").length,
    skip: inside.filter((x) => x.status === "skip").length,
    needsPlan: remainingNeeds.length
  },
  remainingNeedsPlanInsideRequest: remainingNeeds,
  rowsInsideRequest: inside
};

writeJsonSafe(path.join(ROOT, "reports", "smartwork-after-save-verify-request.json"), out);
console.log(JSON.stringify(out, null, 2));

if (!ok) {
  if (Number(report?.insideSummary?.total || insideSummary?.total || 0) === 0 && Array.isArray(rowsInsideRequest) && rowsInsideRequest.length === 0) {
  throw new Error("Verify gagal: tidak ada baris absensi terbaca dalam rentang request. Cek screenshot/DOM detail SIAGA; jangan dianggap selesai.");
}

throw new Error("Verify gagal: masih ada needs_plan dalam rentang request.");
}
