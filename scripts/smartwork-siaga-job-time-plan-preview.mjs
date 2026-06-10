import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
const shotsDir = path.join(root, "shots");
const profileRoot = path.join(root, "browser-profile", "parallel-siaga-real");

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const runnerReportPath = path.join(reportsDir, "siaga-job-runner-preview-report.json");
const requestPath = path.join(root, "data", "siaga-attendance-request.local.json");
const outputPath = path.join(reportsDir, "siaga-job-time-plan-preview-report.json");

const TARGET_TEACHER_ID = process.env.TARGET_TEACHER_ID || "";
const TARGET_DETAIL_URL = process.env.TARGET_DETAIL_URL || "";

function now() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || "worker")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "worker";
}

function readJsonSafe(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
  if (!raw) return fallback;
  return JSON.parse(raw);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function randomTime(hour, minStart, minEnd) {
  return `${pad2(hour)}:${pad2(randomInt(minStart, minEnd))}:00`;
}

function buildPresetTime(dayName) {
  const hari = String(dayName || "").toLowerCase();

  if (/minggu/.test(hari)) {
    return {
      skip: true,
      reason: "Minggu libur"
    };
  }

  const masuk = randomTime(6, 50, 59);

  if (/jum/.test(hari)) {
    return {
      skip: false,
      masuk,
      pulang: randomTime(11, 30, 35),
      rule: "friday_1130_1135"
    };
  }

  if (/sabtu/.test(hari)) {
    return {
      skip: false,
      masuk,
      pulang: randomTime(15, 15, 30),
      rule: "saturday_1515_1530"
    };
  }

  return {
    skip: false,
    masuk,
    pulang: randomTime(14, 15, 30),
    rule: "normal_1415_1430"
  };
}

function normalizeDateText(value) {
  return String(value || "").trim();
}


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

function isExceptionDate(dayNumber, request) {
  const holidays = Array.isArray(request?.holidays) ? request.holidays : [];
  const leaveDays = Array.isArray(request?.leaveDays) ? request.leaveDays : [];
  const all = [...holidays, ...leaveDays].map(String);

  // Untuk sekarang support angka tanggal sederhana: "3", 3, "2026-06-03".
  return all.some((item) => {
    const text = String(item).trim();
    if (!text) return false;
    if (text === String(dayNumber)) return true;
    if (new RegExp(`-0?${dayNumber}$`).test(text)) return true;
    return false;
  });
}

function collectDetailJobs(runnerReport) {
  if (TARGET_TEACHER_ID && TARGET_DETAIL_URL) {
    return [{
      index: 0,
      teacherId: TARGET_TEACHER_ID,
      teacherName: TARGET_TEACHER_ID,
      wa: "",
      detailUrl: TARGET_DETAIL_URL,
      profileDir: path.join(profileRoot, `${TARGET_TEACHER_ID}-siaga`)
    }];
  }

  const results = runnerReport?.reports?.juniFind?.results || [];

  return results
    .filter((item) => item?.status === "juni_detail_preview_success" && item?.currentUrl)
    .filter((item) => !TARGET_TEACHER_ID || item.teacherId === TARGET_TEACHER_ID)
    .map((item, index) => ({
      index,
      teacherId: item.teacherId,
      teacherName: item.teacherName,
      wa: item.wa,
      detailUrl: item.currentUrl,
      profileDir: path.join(profileRoot, `${item.teacherId}-siaga`)
    }));
}

async function extractRowsFromDetail(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("table tbody tr, table tr"));

    return rows.map((tr, index) => {
      const cells = Array.from(tr.querySelectorAll("td, th")).map((td) =>
        (td.innerText || "").replace(/\s+/g, " ").trim()
      );

      const text = (tr.innerText || "").replace(/\s+/g, " ").trim();
      const links = Array.from(tr.querySelectorAll("a, button")).map((el) => ({
        text: (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim(),
        href: el.href || "",
        tag: el.tagName
      }));

      return { index, cells, text, links };
    });
  });
}

function parseAttendanceRows(rows, request) {
  const parsed = [];

  for (const row of rows) {
    const cells = row.cells || [];

    // Target tabel detail biasanya: Tanggal | Hari | Jam Masuk | Jam Pulang | Aksi
    const dayNumber = Number(cells[0]);
    const dayName = normalizeDateText(cells[1]);
    const jamMasuk = normalizeDateText(cells[2]);
    const jamPulang = normalizeDateText(cells[3]);
    const actionText = `${cells.slice(4).join(" ")} ${row.text || ""}`;

    if (!dayNumber || Number.isNaN(dayNumber)) continue;
    if (!dayName || !/senin|selasa|rabu|kamis|jum|sabtu|minggu/i.test(dayName)) continue;

    const hasExistingTime =
      jamMasuk !== "-" &&
      jamPulang !== "-" &&
      /\d{1,2}:\d{2}/.test(`${jamMasuk} ${jamPulang}`);

    const hasTambah = /tambah/i.test(actionText);
    const isSunday = /minggu/i.test(dayName);
    const isException = isExceptionDate(dayNumber, request);
    const outsideRequestRange = isOutsideRequestRange(dayNumber, request);

    const preset = buildPresetTime(dayName);

    let status = "needs_plan";
    let reason = "Tanggal kosong dan punya tombol Tambah.";

    if (hasExistingTime) {
      status = "already_filled";
      reason = "Sudah ada jam masuk/pulang.";
    } else if (outsideRequestRange) {
      status = "outside_request_range";
      reason = "Di luar rentang tanggal request user.";
    } else if (isSunday) {
      status = "skip";
      reason = "Minggu dilewati.";
    } else if (isException) {
      status = "skip";
      reason = "Masuk daftar libur/cuti request.";
    } else if (!hasTambah) {
      status = "needs_check";
      reason = "Jam kosong tetapi tombol Tambah tidak terdeteksi.";
    }

    parsed.push({
      tanggal: dayNumber,
      hari: dayName,
      current: {
        masuk: jamMasuk,
        pulang: jamPulang
      },
      actionText: actionText.replace(/\s+/g, " ").slice(0, 200),
      status,
      reason,
      plan: status === "needs_plan"
        ? {
            masuk: preset.masuk,
            pulang: preset.pulang,
            rule: preset.rule
          }
        : null
    });
  }

  return parsed;
}

async function runForJob(job, request) {
  const startedAt = now();
  const log = [];
  let browser;

  log.push(`[${now()}] START ${job.teacherId}`);
  log.push(`[${now()}] RULE=TIME_PLAN_PREVIEW_ONLY_NO_CLICK_NO_INPUT_NO_SAVE`);
  log.push(`[${now()}] DETAIL_URL=${job.detailUrl}`);

  try {
    browser = await chromium.launchPersistentContext(job.profileDir, {
      headless: false,
      viewport: { width: 1280, height: 720 },
      args: ["--start-maximized"]
    });

    const page = browser.pages()[0] || await browser.newPage();
    await page.goto(job.detailUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(3000);

    const rows = await extractRowsFromDetail(page);
    const attendanceRows = parseAttendanceRows(rows, request);

    const screenshotPath = path.join(
      shotsDir,
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(job.teacherId)}-siaga-time-plan-preview.png`
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });

    await browser.close().catch(() => {});

    const summary = {
      totalRows: attendanceRows.length,
      alreadyFilled: attendanceRows.filter((item) => item.status === "already_filled").length,
      planned: attendanceRows.filter((item) => item.status === "needs_plan").length,
      skipped: attendanceRows.filter((item) => item.status === "skip").length,
      needsCheck: attendanceRows.filter((item) => item.status === "needs_check").length
    };

    log.push(`[${now()}] SUMMARY=${JSON.stringify(summary)}`);
    log.push(`[${now()}] SCREENSHOT=${screenshotPath}`);

    return {
      ok: true,
      teacherId: job.teacherId,
      teacherName: job.teacherName,
      detailUrl: job.detailUrl,
      startedAt,
      endedAt: now(),
      status: summary.needsCheck > 0 ? "time_plan_preview_needs_check" : "time_plan_preview_success",
      summary,
      rows: attendanceRows,
      screenshot: path.relative(root, screenshotPath).replaceAll("\\", "/"),
      log
    };
  } catch (error) {
    log.push(`[${now()}] ERROR=${error.message}`);

    try {
      await browser?.close?.();
    } catch {}

    return {
      ok: false,
      teacherId: job.teacherId,
      teacherName: job.teacherName,
      detailUrl: job.detailUrl,
      startedAt,
      endedAt: now(),
      status: "failed",
      error: error.message,
      log
    };
  }
}

async function main() {
  console.log("SMARTWORK_SIAGA_JOB_TIME_PLAN_PREVIEW=START");
  console.log("RULE=NO_CLICK_TAMBAH_NO_INPUT_JAM_NO_SAVE_NO_SUBMIT_NO_DELETE");

  const runnerReport = readJsonSafe(runnerReportPath);
  const request = readJsonSafe(requestPath, {});

  if (!TARGET_DETAIL_URL && !runnerReport?.reports?.juniFind?.results?.length) {
    throw new Error("Runner report belum punya hasil juniFind. Jalankan npm run siaga:job:runner-preview dulu.");
  }

  const jobs = collectDetailJobs(runnerReport);

  if (jobs.length === 0) {
    throw new Error(`Tidak ada detail job dari runner report untuk target: ${TARGET_TEACHER_ID || "ALL"}`);
  }

  if (!runnerReport?.ok) {
    console.log("RUNNER_REPORT_PARTIAL_OK_FOR_TARGET=true");
    console.log("TARGET_TEACHER_ID=" + (TARGET_TEACHER_ID || "ALL"));
  }

  const results = [];

  for (const job of jobs) {
    console.log(`TIME_PLAN_JOB=${job.teacherId}`);
    const result = await runForJob(job, request);
    results.push(result);
  }

  const report = {
    ok: results.every((item) => item.ok),
    mode: "siaga-job-time-plan-preview",
    rule: "NO_CLICK_TAMBAH_NO_INPUT_JAM_NO_SAVE_NO_SUBMIT_NO_DELETE",
    target: runnerReport?.reports?.planner?.request?.target || null,
    targetTeacherId: TARGET_TEACHER_ID || null,
    targetDetailUrl: TARGET_DETAIL_URL || null,
    totalJobs: jobs.length,
    startedAt: now(),
    endedAt: now(),
    summary: {
      success: results.filter((item) => item.status === "time_plan_preview_success").length,
      needsCheck: results.filter((item) => item.status === "time_plan_preview_needs_check").length,
      failed: results.filter((item) => item.status === "failed").length,
      totalRows: results.reduce((sum, item) => sum + Number(item.summary?.totalRows || 0), 0),
      totalAlreadyFilled: results.reduce((sum, item) => sum + Number(item.summary?.alreadyFilled || 0), 0),
      totalPlanned: results.reduce((sum, item) => sum + Number(item.summary?.planned || 0), 0),
      totalSkipped: results.reduce((sum, item) => sum + Number(item.summary?.skipped || 0), 0),
      totalNeedsCheck: results.reduce((sum, item) => sum + Number(item.summary?.needsCheck || 0), 0)
    },
    results
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.log("SMARTWORK_SIAGA_JOB_TIME_PLAN_PREVIEW=DONE");
  console.log("REPORT=" + outputPath);
  console.log(JSON.stringify(report.summary, null, 2));

  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  const report = {
    ok: false,
    mode: "siaga-job-time-plan-preview",
    rule: "NO_CLICK_TAMBAH_NO_INPUT_JAM_NO_SAVE_NO_SUBMIT_NO_DELETE",
    error: error.message,
    endedAt: now()
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.error("SMARTWORK_SIAGA_JOB_TIME_PLAN_PREVIEW=FAILED");
  console.error(error.message);
  console.error("REPORT=" + outputPath);
  process.exit(1);
});
