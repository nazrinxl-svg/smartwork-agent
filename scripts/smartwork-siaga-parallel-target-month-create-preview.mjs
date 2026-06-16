import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const dataPath = path.join(root, "data", "teacher-accounts.local.json");
const reportsDir = path.join(root, "reports");
const shotsDir = path.join(root, "shots");
const profileRoot = path.join(root, "browser-profile", "parallel-siaga-real");

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(profileRoot, { recursive: true });

const SIAGA_GURU_URL = "https://siagapendis.kemenag.go.id/guru";
const SIAGA_ABSENSI_URL = "https://siagapendis.kemenag.go.id/guru/absensi";
const SIAGA_ABSENSI_CREATE_URL = "https://siagapendis.kemenag.go.id/guru/absensi/create";

// SMARTWORK_DYNAMIC_TARGET_MONTH_CREATE_PREVIEW_V1
const requestPath = path.join(root, "data", "smartwork-latest-siaga-request.local.json");
const jobPath = path.join(root, "data", "smartwork-latest-siaga-job.local.json");
// SMARTWORK_SYNC_REPORT_TARGET_FALLBACK_V1
const syncReportPath = path.join(root, "reports", "smartwork-sync-latest-request-report.json");

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember"
];

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function monthNameFromDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return MONTH_NAMES[Number(match[2]) - 1] || "";
}

function yearFromDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-/);
  return match ? match[1] : "";
}

function readActiveTarget() {
  const syncReport = readJsonSafe(syncReportPath) || {};
  const request = readJsonSafe(requestPath) || syncReport.selectedRequest?.normalized || {};
  const job = readJsonSafe(jobPath) || syncReport.job || {};

  const account =
    Array.isArray(request.accounts) && request.accounts.length
      ? request.accounts[0]
      : request.account || request.normalized?.account || request.raw?.account || job.account || {};

  const startDate = firstText(
    request.startDate,
    request.request?.startDate,
    request.normalized?.startDate,
    request.raw?.startDate,
    request.selected?.startDate,
    syncReport.selectedRequest?.normalized?.startDate,
    syncReport.job?.startDate,
    job.startDate,
    job.request?.startDate
  );

  const month = firstText(
    request.targetMonth,
    request.month,
    request.normalized?.targetMonth,
    request.raw?.targetMonth,
    request.selected?.targetMonth,
    syncReport.selectedRequest?.normalized?.targetMonth,
    syncReport.job?.targetMonth,
    job.targetMonth,
    job.month,
    monthNameFromDate(startDate)
  );

  const year = firstText(
    request.targetYear,
    request.year,
    request.normalized?.targetYear,
    request.raw?.targetYear,
    request.selected?.targetYear,
    syncReport.selectedRequest?.normalized?.targetYear,
    syncReport.job?.targetYear,
    job.targetYear,
    job.year,
    yearFromDate(startDate)
  );

  const school = firstText(
    request.schoolName,
    request.school,
    request.sekolah,
    request.sekolahName,
    request.normalized?.schoolName,
    request.raw?.schoolName,
    syncReport.selectedRequest?.normalized?.schoolName,
    syncReport.selectedRequest?.normalized?.account?.schoolName,
    syncReport.job?.schoolName,
    account.schoolName,
    account.school,
    account.sekolah,
    account.sekolahName,
    job.schoolName,
    job.school
  );

  const teacherId = firstText(
    process.env.TARGET_TEACHER_ID,
    request.teacherId,
    request.normalized?.teacherId,
    request.raw?.teacherId,
    syncReport.selectedRequest?.normalized?.teacherId,
    syncReport.job?.teacherId,
    account.teacherId,
    job.teacherId
  );

  return {
    teacherId,
    month,
    year: String(year || "").trim(),
    school,
    startDate
  };
}

const ACTIVE_TARGET = readActiveTarget();
const TARGET_MONTH = ACTIVE_TARGET.month;
const TARGET_YEAR = ACTIVE_TARGET.year;
const TARGET_SCHOOL_TEXT = ACTIVE_TARGET.school;

function now() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || "worker")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function readLocalAccounts() {
  const rawText = fs.readFileSync(dataPath, "utf8").replace(/^\uFEFF/, "").trim();
  const raw = JSON.parse(rawText);

  const parallelLimit = Number(raw.parallelLimit || 2);
  const accounts = Array.isArray(raw.accounts)
    ? raw.accounts
    : Array.isArray(raw.teachers)
      ? raw.teachers
      : [];

  const jobs = accounts
    .filter((item) => item && item.enabled !== false)
    .map((item, index) => ({
      teacherId: item.teacherId || `guru-${String(index + 1).padStart(3, "0")}`,
      teacherName: item.teacherName || item.name || `Guru ${index + 1}`,
      wa: item.wa || "",
      profileDir: path.join(profileRoot, slugify(item.teacherId || `guru-${index + 1}`) + "-siaga")
    }));

  if (jobs.length === 0) {
    throw new Error("Tidak ada akun enabled di data/teacher-accounts.local.json");
  }

  // SMARTWORK_TARGET_TEACHER_FILTER_CREATE_PREVIEW_V1
  const targetTeacherId = firstText(process.env.TARGET_TEACHER_ID, ACTIVE_TARGET.teacherId);
  const filteredJobs = targetTeacherId
    ? jobs.filter((job) => job.teacherId === targetTeacherId)
    : jobs;

  if (filteredJobs.length === 0) {
    throw new Error(`Target teacherId tidak ditemukan di akun enabled: ${targetTeacherId}`);
  }

  return { parallelLimit, jobs: filteredJobs };
}

async function hasTargetMonth(page, log) {
  await page.goto(SIAGA_ABSENSI_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);

  const found = await page.evaluate(({ month, year }) => {
    const rows = Array.from(document.querySelectorAll("table tbody tr, table tr")).map((tr) =>
      (tr.innerText || "").replace(/\s+/g, " ").trim()
    );

    return rows.some((text) =>
      new RegExp(month, "i").test(text) && String(text).includes(String(year))
    );
  }, { month: TARGET_MONTH, year: TARGET_YEAR });

  log.push(`[${now()}] TARGET_EXISTS_${TARGET_MONTH}_${TARGET_YEAR}=${found}`);
  return found;
}

async function selectByText(page, selector, targetText, label, log) {
  const result = await page.evaluate(({ selector, targetText }) => {
    const select = document.querySelector(selector);
    if (!select) return { ok: false, reason: "select_not_found" };

    const normalizedTarget = String(targetText || "").toLowerCase().trim();
    const options = Array.from(select.options || []);
    let option = null;

    if (!normalizedTarget) {
      const usableOptions = options.filter((opt) => {
        const text = String(opt.textContent || "").toLowerCase().trim();
        return String(opt.value || "").trim() && !/^pilih\b/.test(text);
      });

      if (usableOptions.length === 1) {
        option = usableOptions[0];
      } else {
        return {
          ok: false,
          reason: "target_text_empty_and_not_unique",
          available: options.map((opt) => opt.textContent).slice(0, 30)
        };
      }
    } else {
      option =
        options.find((opt) => String(opt.textContent || "").toLowerCase().trim() === normalizedTarget) ||
        options.find((opt) => String(opt.textContent || "").toLowerCase().includes(normalizedTarget));
    }

    if (!option) {
      return {
        ok: false,
        reason: "option_not_found",
        targetText,
        available: options.map((opt) => opt.textContent).slice(0, 30)
      };
    }

    select.value = option.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));

    if (window.jQuery) {
      window.jQuery(select).trigger("change");
    }

    return {
      ok: true,
      value: option.value,
      text: option.textContent
    };
  }, { selector, targetText });

  log.push(`[${now()}] SELECT_${label}=${result.ok ? "OK" : "FAILED"} ${JSON.stringify(result)}`);
  return result;
}

async function clickFirst(page, selectors, label, log) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    const count = await loc.count().catch(() => 0);
    if (!count) continue;

    const visible = await loc.isVisible({ timeout: 1500 }).catch(() => false);
    if (!visible) continue;

    await loc.click({ timeout: 10000 });
    log.push(`[${now()}] CLICK_${label}=OK selector=${selector}`);
    return true;
  }

  log.push(`[${now()}] CLICK_${label}=NOT_FOUND`);
  return false;
}

async function openCreateForm(page, log) {
  log.push(`[${now()}] OPEN_ABSENSI=${SIAGA_ABSENSI_URL}`);
  await page.goto(SIAGA_ABSENSI_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);

  const clicked = await clickFirst(
    page,
    [
      'a[href*="/guru/absensi/create"]',
      'a:has-text("Tambah")',
      'button:has-text("Tambah")',
      'text=Tambah'
    ],
    "TAMBAH",
    log
  );

  if (!clicked) {
    log.push(`[${now()}] FALLBACK_CREATE_URL=${SIAGA_ABSENSI_CREATE_URL}`);
    await page.goto(SIAGA_ABSENSI_CREATE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  }

  await page.waitForTimeout(3000);
}

async function prepareCreateForm(page, log) {
  await openCreateForm(page, log);

  const title = await page.title().catch(() => "");
  const url = page.url();
  const bodyText = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");

  log.push(`[${now()}] CREATE_FORM_TITLE=${title}`);
  log.push(`[${now()}] CREATE_FORM_URL=${url}`);

  const selects = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("select")).map((select, index) => ({
      index,
      name: select.getAttribute("name") || "",
      id: select.id || "",
      className: String(select.className || ""),
      textSample: Array.from(select.options || []).map((opt) => opt.textContent).slice(0, 15)
    }));
  });

  log.push(`[${now()}] SELECT_COUNT=${selects.length}`);

  const monthResult =
    await selectByText(page, 'select[name="bulan"]', TARGET_MONTH, "BULAN", log)
      .catch(() => ({ ok: false })) ||
    await selectByText(page, 'select', TARGET_MONTH, "BULAN_FALLBACK", log);

  const yearResult =
    await selectByText(page, 'select[name="tahun"]', TARGET_YEAR, "TAHUN", log)
      .catch(() => ({ ok: false })) ||
    await selectByText(page, 'select', TARGET_YEAR, "TAHUN_FALLBACK", log);

  const schoolResult =
    await selectByText(page, 'select[name="sekolah_id"]', TARGET_SCHOOL_TEXT, "SEKOLAH", log)
      .catch(() => ({ ok: false }));

  const cutiResult =
    await selectByText(page, 'select[name*="cuti" i], select[name*="status" i]', "Tidak ada cuti", "CUTI", log)
      .catch(() => ({ ok: false }));

  await page.waitForTimeout(1500);

  return {
    title,
    url,
    bodyText,
    selects,
    monthResult,
    yearResult,
    schoolResult,
    cutiResult
  };
}

async function runWorker(worker, index) {
  const startedAt = now();
  const log = [];
  let browser;
  let screenshotPath = null;

  log.push(`[${now()}] START ${worker.teacherId}`);
  log.push(`[${now()}] RULE=VISIBLE_TARGET_MONTH_CREATE_PREVIEW_NO_SAVE`);
  log.push(`[${now()}] PROFILE=${worker.profileDir}`);

  try {
    browser = await chromium.launchPersistentContext(worker.profileDir, {
      headless: false,
      viewport: { width: 1280, height: 720 },
      args: [
        "--start-maximized",
        `--window-position=${80 + index * 40},${60 + index * 40}`
      ]
    });

    const page = browser.pages()[0] || await browser.newPage();

    await page.goto(SIAGA_GURU_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);

    if (!page.url().includes("/guru")) {
      throw new Error("Session belum masuk /guru. Jalankan dashboard preview/login dulu.");
    }

    const exists = await hasTargetMonth(page, log);

    if (exists) {
      log.push(`[${now()}] TARGET_ALREADY_EXISTS_STOP_CREATE_PREVIEW=true`);
      screenshotPath = path.join(
        shotsDir,
        `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(worker.teacherId)}-target-month-create-preview-already-exists.png`
      );
      await page.screenshot({ path: screenshotPath, fullPage: true });

      return {
        teacherId: worker.teacherId,
        teacherName: worker.teacherName,
        ok: true,
        status: "target_month_already_exists",
        startedAt,
        endedAt: now(),
        currentUrl: page.url(),
        screenshot: path.relative(root, screenshotPath).replaceAll("\\", "/"),
        log
      };
    }

    const prepare = await prepareCreateForm(page, log);

    screenshotPath = path.join(
      shotsDir,
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(worker.teacherId)}-target-month-create-preview-real.png`
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const finalTitle = await page.title().catch(() => "");
    const finalUrl = page.url();
    const finalBody = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");

    const preparedLikely =
      /create/i.test(finalUrl) ||
      /Tambah|Bulan|Tahun|Sekolah|Cuti/i.test(finalBody);

    log.push(`[${now()}] FINAL_TITLE=${finalTitle}`);
    log.push(`[${now()}] FINAL_URL=${finalUrl}`);
    log.push(`[${now()}] TARGET_CREATE_PREVIEW_PREPARED_LIKELY=${preparedLikely}`);
    log.push(`[${now()}] STOP_BEFORE_SAVE=true`);
    log.push(`[${now()}] BROWSER_LEFT_OPEN=true`);

    return {
      teacherId: worker.teacherId,
      teacherName: worker.teacherName,
      ok: true,
      status: preparedLikely ? "target_create_preview_prepared" : "target_create_preview_needs_check",
      startedAt,
      endedAt: now(),
      currentUrl: finalUrl,
      title: finalTitle,
      target: {
        month: TARGET_MONTH,
        year: TARGET_YEAR,
        school: TARGET_SCHOOL_TEXT
      },
      prepare,
      screenshot: path.relative(root, screenshotPath).replaceAll("\\", "/"),
      note: "Preview create target month only. STOP before Simpan. No input jam, no save.",
      log
    };
  } catch (error) {
    log.push(`[${now()}] ERROR=${error.message}`);

    screenshotPath = path.join(
      shotsDir,
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(worker.teacherId)}-target-month-create-preview-error.png`
    );

    try {
      const pages = browser?.pages?.() || [];
      const page = pages[0];
      if (page) await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {}

    return {
      teacherId: worker.teacherId,
      teacherName: worker.teacherName,
      ok: false,
      status: "failed",
      error: error.message,
      startedAt,
      endedAt: now(),
      screenshot: fs.existsSync(screenshotPath) ? path.relative(root, screenshotPath).replaceAll("\\", "/") : null,
      log
    };
  }
}

async function main() {
  console.log("SMARTWORK_SIAGA_TARGET_MONTH_CREATE_PREVIEW=START");
  console.log("RULE=VISIBLE_PREVIEW_ONLY_STOP_BEFORE_SAVE");
  console.log("TARGET_MONTH=" + TARGET_MONTH);
  console.log("TARGET_YEAR=" + TARGET_YEAR);
  console.log("TARGET_SCHOOL_TEXT=" + (TARGET_SCHOOL_TEXT || "[auto-single-school-option]"));
  console.log("TARGET_TEACHER_ID=" + (ACTIVE_TARGET.teacherId || "[all-enabled-or-env]"));

  if (!TARGET_MONTH || !TARGET_YEAR) {
    throw new Error("Target bulan/tahun kosong. Jalankan sync request aktif dulu.");
  }

  const { parallelLimit, jobs } = readLocalAccounts();

  console.log("TOTAL_JOBS=" + jobs.length);
  console.log("PARALLEL_LIMIT=" + parallelLimit);

  const results = [];
  const queue = [...jobs];
  const running = new Set();

  async function runNext() {
    if (queue.length === 0) return;

    const job = queue.shift();
    const index = results.length + running.size;
    const promise = runWorker(job, index)
      .then((result) => results.push(result))
      .finally(() => running.delete(promise));

    running.add(promise);

    if (running.size >= parallelLimit) {
      await Promise.race(running);
    }

    await runNext();
  }

  await runNext();
  await Promise.all(running);

  const report = {
    ok: results.every((item) => item.ok),
    mode: "siaga-target-month-create-preview-visible",
    rule: "VISIBLE_PREVIEW_ONLY_STOP_BEFORE_SAVE",
    target: {
      month: TARGET_MONTH,
      year: TARGET_YEAR,
      school: TARGET_SCHOOL_TEXT
    },
    startedAt: results[0]?.startedAt || now(),
    endedAt: now(),
    summary: {
      alreadyExists: results.filter((item) => item.status === "target_month_already_exists").length,
      prepared: results.filter((item) => item.status === "target_create_preview_prepared").length,
      needsCheck: results.filter((item) => item.status === "target_create_preview_needs_check").length,
      failed: results.filter((item) => item.status === "failed").length
    },
    results
  };

  const reportPath = path.join(reportsDir, "siaga-target-month-create-preview-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("SMARTWORK_SIAGA_TARGET_MONTH_CREATE_PREVIEW=DONE");
  console.log("REPORT=" + reportPath);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("Browser dibiarkan terbuka. STOP sebelum Simpan.");
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_TARGET_MONTH_CREATE_PREVIEW=FAILED");
  console.error(error.message);
  process.exit(1);
});

