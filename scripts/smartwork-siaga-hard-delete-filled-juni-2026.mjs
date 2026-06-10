import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "reports", "siaga-hard-delete-filled-juni-2026-report.json");
const SHOT_DIR = path.join(ROOT, "shots");

fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.mkdirSync(SHOT_DIR, { recursive: true });

const DETAIL_URL = process.env.DETAIL_URL || "https://siagapendis.kemenag.go.id/guru/absensi/detail/8860825";
const START_DATE = process.env.START_DATE || "2026-06-01";
const END_DATE = process.env.END_DATE || "2026-06-13";
const SKIP_SUNDAYS = true;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoDate(dayNumber) {
  return `2026-06-${pad2(dayNumber)}`;
}

function isSundayByText(dayName = "") {
  return dayName.toLowerCase().includes("minggu");
}

function inRange(date) {
  return date >= START_DATE && date <= END_DATE;
}

async function getDetailPage(context) {
  let page = context.pages().find((p) => p.url().includes("/guru/absensi/detail/8860825"));
  if (!page) page = context.pages()[0] || await context.newPage();
  await page.goto(DETAIL_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  return page;
}

async function scanRows(page) {
  return await page.evaluate(({ startDate, endDate }) => {
    function pad2(n) { return String(n).padStart(2, "0"); }
    function isoDate(dayNumber) { return `2026-06-${pad2(dayNumber)}`; }
    function isSunday(dayName) { return String(dayName || "").toLowerCase().includes("minggu"); }
    function inRange(date) { return date >= startDate && date <= endDate; }

    const rows = [...document.querySelectorAll("table tbody tr")];
    return rows.map((tr, index) => {
      const cells = [...tr.querySelectorAll("td")].map(td => (td.innerText || "").trim());
      const text = (tr.innerText || "").replace(/\s+/g, " ").trim();
      const links = [...tr.querySelectorAll("a,button")].map((el, actionIndex) => ({
        actionIndex,
        tag: el.tagName,
        text: (el.innerText || el.textContent || "").trim(),
        href: el.href || "",
        className: el.className || ""
      }));

      const dayNumberRaw = cells[0] || "";
      const dayNumber = Number((dayNumberRaw.match(/\d+/) || [])[0]);
      const dayName = cells[1] || "";
      const date = Number.isFinite(dayNumber) && dayNumber > 0 ? isoDate(dayNumber) : "";

      const hasUbah = links.some(x => /ubah/i.test(x.text) || /edit/i.test(x.href));
      const hasHapus = links.some(x => /hapus/i.test(x.text) || /remove|danger/i.test(x.className));
      const hasTambah = links.some(x => /tambah/i.test(x.text) || /create/i.test(x.href));
      const hasTime = /\b\d{2}:\d{2}:\d{2}\b/.test(text);

      return {
        index,
        cells,
        text,
        links,
        dayNumber,
        dayName,
        date,
        insideRange: date ? inRange(date) : false,
        isSunday: isSunday(dayName),
        hasTime,
        hasUbah,
        hasHapus,
        hasTambah,
        filled: hasTime || hasUbah || hasHapus,
        deleteCandidate: date ? inRange(date) && !isSunday(dayName) && (hasTime || hasUbah || hasHapus) : false
      };
    });
  }, { startDate: START_DATE, endDate: END_DATE });
}

async function clickDeleteForRow(page, rowIndex) {
  page.once("dialog", async (dialog) => {
    await dialog.accept().catch(() => {});
  });

  const result = await page.evaluate(async ({ rowIndex }) => {
    const rows = [...document.querySelectorAll("table tbody tr")];
    const tr = rows[rowIndex];
    if (!tr) return { ok: false, reason: "row_not_found" };

    const actions = [...tr.querySelectorAll("button,a")];
    let target =
      actions.find(el => /hapus/i.test((el.innerText || el.textContent || "").trim())) ||
      actions.find(el => /danger|remove/i.test(el.className || ""));

    if (!target) return { ok: false, reason: "delete_button_not_found", text: tr.innerText };

    target.scrollIntoView({ block: "center", inline: "center" });
    target.click();
    return { ok: true, rowText: tr.innerText.replace(/\s+/g, " ").trim() };
  }, { rowIndex });

  await sleep(1500);
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  return result;
}

async function main() {
  const startedAt = new Date().toISOString();
  const log = [];
  const deleted = [];
  const failed = [];

  const context = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const page = await getDetailPage(context);

  await page.screenshot({
    path: path.join(SHOT_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-before-hard-delete.png`),
    fullPage: true
  }).catch(() => {});

  for (let loop = 1; loop <= 40; loop++) {
    await page.goto(DETAIL_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

    const rows = await scanRows(page);
    const candidates = rows.filter(r => r.deleteCandidate);

    log.push(`LOOP_${loop}: candidates=${candidates.length}`);

    if (candidates.length === 0) break;

    const target = candidates[0];
    const clickResult = await clickDeleteForRow(page, target.index);

    if (clickResult.ok) {
      deleted.push({
        loop,
        date: target.date,
        dayName: target.dayName,
        rowIndex: target.index,
        rowText: target.text
      });
    } else {
      failed.push({
        loop,
        date: target.date,
        dayName: target.dayName,
        rowIndex: target.index,
        reason: clickResult.reason,
        rowText: target.text
      });
      break;
    }

    await sleep(1000);
  }

  await page.goto(DETAIL_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  const finalRows = await scanRows(page);

  await page.screenshot({
    path: path.join(SHOT_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-after-hard-delete.png`),
    fullPage: true
  }).catch(() => {});

  const summary = {
    totalRows: finalRows.length,
    filled: finalRows.filter(r => r.insideRange && !r.isSunday && r.filled).length,
    emptyCanAdd: finalRows.filter(r => r.insideRange && !r.isSunday && r.hasTambah && !r.filled).length,
    skippedSunday: finalRows.filter(r => r.insideRange && r.isSunday).length,
    outOfRange: finalRows.filter(r => !r.insideRange).length,
    needsCheck: finalRows.filter(r => r.insideRange && !r.isSunday && !r.filled && !r.hasTambah).length
  };

  const report = {
    ok: summary.filled === 0 && summary.needsCheck === 0,
    mode: "siaga-hard-delete-filled-juni-2026",
    rule: "DELETE_ONLY_FILLED_ROWS_IN_RANGE_SKIP_SUNDAY_NO_SAVE_NO_SUBMIT",
    detailUrl: DETAIL_URL,
    startDate: START_DATE,
    endDate: END_DATE,
    startedAt,
    finishedAt: new Date().toISOString(),
    deletedCount: deleted.length,
    failedCount: failed.length,
    summary,
    deleted,
    failed,
    log,
    rows: finalRows
  };

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: report.ok,
    deletedCount: report.deletedCount,
    failedCount: report.failedCount,
    summary: report.summary,
    report: REPORT
  }, null, 2));

  await context.close().catch(() => {});
}

main().catch((err) => {
  const report = {
    ok: false,
    mode: "siaga-hard-delete-filled-juni-2026",
    error: err.message,
    stack: err.stack,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.error("SMARTWORK_HARD_DELETE_FAILED");
  console.error(err);
  process.exit(1);
});
