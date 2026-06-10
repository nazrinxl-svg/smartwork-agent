import fs from "node:fs";
import path from "node:path";

export function readJson(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

export function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function toIsoDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function parseLocalDate(value) {
  const iso = toIsoDate(value);
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatLocalDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildDatePlan({ startDate, endDate, holidays = [] }) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const holidaySet = new Set((holidays || []).map(toIsoDate).filter(Boolean));

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error(`Tanggal tidak valid: startDate=${startDate}, endDate=${endDate}`);
  }

  if (start > end) {
    throw new Error(`Rentang tanggal terbalik: ${startDate} > ${endDate}`);
  }

  const rows = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = formatLocalDate(d);
    const day = d.getDay();
    const isSunday = day === 0;
    const isHoliday = holidaySet.has(date);

    rows.push({
      date,
      day,
      status: isSunday || isHoliday ? "SKIPPED" : "PLANNED",
      reason: isSunday ? "Minggu" : isHoliday ? "Libur manual" : "",
    });
  }

  return rows;
}

export function summarizePlan(rows) {
  return {
    total: rows.length,
    planned: rows.filter((r) => r.status === "PLANNED").length,
    ready: rows.filter((r) => r.status === "DRY_RUN_READY").length,
    skipped: rows.filter((r) => r.status === "SKIPPED").length,
    done: rows.filter((r) => r.status === "DONE").length,
    failed: rows.filter((r) => r.status === "FAILED").length,
  };
}
