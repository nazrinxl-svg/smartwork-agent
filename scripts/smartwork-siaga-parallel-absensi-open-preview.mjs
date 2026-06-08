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
const SIAGA_LOGIN_URL = "https://siagapendis.kemenag.go.id/login";
const SIAGA_ABSENSI_URL = "https://siagapendis.kemenag.go.id/guru/absensi";

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
  if (!fs.existsSync(dataPath)) {
    throw new Error("File akun lokal tidak ditemukan: data/teacher-accounts.local.json");
  }

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
    .map((item, index) => {
      const appsArray = Array.isArray(item.apps) ? item.apps : [];
      const siagaApp =
        appsArray.find((app) => /siaga/i.test(String(app?.appId || app?.app || app?.name || app?.id || app?.type || ""))) ||
        appsArray[0] ||
        {};

      return {
        teacherId: item.teacherId || `guru-${String(index + 1).padStart(3, "0")}`,
        teacherName: item.teacherName || item.name || `Guru ${index + 1}`,
        wa: item.wa || "",
        username:
          item.username ||
          item.login ||
          item.user ||
          item.akun ||
          item.account ||
          item.nip ||
          item.nuptk ||
          siagaApp.username ||
          siagaApp.login ||
          siagaApp.user ||
          siagaApp.akun ||
          siagaApp.account ||
          siagaApp.nip ||
          siagaApp.nuptk ||
          "",
        password:
          item.password ||
          item.pass ||
          item.sandi ||
          siagaApp.password ||
          siagaApp.pass ||
          siagaApp.sandi ||
          "",
        profileDir: path.join(profileRoot, slugify(item.teacherId || `guru-${index + 1}`) + "-siaga")
      };
    });

  if (jobs.length === 0) {
    throw new Error("Tidak ada akun enabled di data/teacher-accounts.local.json");
  }

  for (const job of jobs) {
    if (!job.username || !job.password) {
      throw new Error(`Akun ${job.teacherId} belum lengkap username/password di file lokal.`);
    }
  }

  return { parallelLimit, jobs };
}

async function fillFirstMatching(page, selectors, value, label, log) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (!count) continue;

    const visible = await locator.isVisible({ timeout: 1500 }).catch(() => false);
    if (!visible) continue;

    await locator.fill(value, { timeout: 8000 });
    log.push(`[${now()}] FILL_${label}=OK selector=${selector}`);
    return true;
  }

  log.push(`[${now()}] FILL_${label}=NOT_FOUND`);
  return false;
}

async function clickFirstMatching(page, selectors, label, log) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);
    if (!count) continue;

    const visible = await locator.isVisible({ timeout: 1500 }).catch(() => false);
    if (!visible) continue;

    await locator.click({ timeout: 8000 });
    log.push(`[${now()}] CLICK_${label}=OK selector=${selector}`);
    return true;
  }

  log.push(`[${now()}] CLICK_${label}=NOT_FOUND`);
  return false;
}

async function ensureDashboard(page, worker, log) {
  log.push(`[${now()}] OPEN_DASHBOARD=${SIAGA_GURU_URL}`);

  await page.goto(SIAGA_GURU_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3500);

  let title = await page.title().catch(() => "");
  let url = page.url();

  log.push(`[${now()}] DASHBOARD_FIRST_TITLE=${title}`);
  log.push(`[${now()}] DASHBOARD_FIRST_URL=${url}`);

  if (url.includes("/guru")) {
    return true;
  }

  log.push(`[${now()}] NEED_LOGIN=true`);

  await page.goto(SIAGA_LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);

  const userOk = await fillFirstMatching(
    page,
    [
      'input[name="username"]',
      'input[name="email"]',
      'input[type="text"]',
      'input[placeholder*="Username" i]',
      'input[placeholder*="NUPTK" i]',
      'input[placeholder*="Akun" i]'
    ],
    worker.username,
    "USERNAME",
    log
  );

  const passOk = await fillFirstMatching(
    page,
    [
      'input[name="password"]',
      'input[type="password"]',
      'input[placeholder*="Password" i]',
      'input[placeholder*="Sandi" i]'
    ],
    worker.password,
    "PASSWORD",
    log
  );

  if (!userOk || !passOk) {
    throw new Error("Field login tidak ditemukan lengkap saat absensi preview.");
  }

  await clickFirstMatching(
    page,
    [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Login")',
      'button:has-text("Masuk")'
    ],
    "LOGIN",
    log
  );

  await page.waitForTimeout(6500);

  title = await page.title().catch(() => "");
  url = page.url();

  log.push(`[${now()}] DASHBOARD_AFTER_LOGIN_TITLE=${title}`);
  log.push(`[${now()}] DASHBOARD_AFTER_LOGIN_URL=${url}`);

  return url.includes("/guru");
}

async function openAbsensi(page, log) {
  log.push(`[${now()}] RULE=OPEN_ABSENSI_ONLY_NO_SELECT_MONTH_NO_INPUT_NO_SAVE`);

  // Cara pertama: buka URL absensi langsung. Ini hanya GET/navigasi, tidak mengubah data.
  log.push(`[${now()}] TRY_DIRECT_ABSENSI_URL=${SIAGA_ABSENSI_URL}`);
  await page.goto(SIAGA_ABSENSI_URL, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((error) => {
    log.push(`[${now()}] DIRECT_ABSENSI_GOTO_ERROR=${error.message}`);
  });

  await page.waitForTimeout(3500);

  let title = await page.title().catch(() => "");
  let url = page.url();
  let bodyText = await page.locator("body").innerText({ timeout: 8000 }).catch(() => "");

  log.push(`[${now()}] ABSENSI_DIRECT_TITLE=${title}`);
  log.push(`[${now()}] ABSENSI_DIRECT_URL=${url}`);

  if (/absensi/i.test(url) || /absensi/i.test(bodyText.slice(0, 3000))) {
    log.push(`[${now()}] ABSENSI_OPEN_METHOD=direct_url`);
    return true;
  }

  // Cara kedua: balik dashboard dan cari link/menu Absensi.
  log.push(`[${now()}] DIRECT_NOT_CONFIRMED_TRY_MENU=true`);
  await page.goto(SIAGA_GURU_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);

  const clicked = await clickFirstMatching(
    page,
    [
      'a[href*="absensi" i]',
      'a:has-text("Absensi")',
      'button:has-text("Absensi")',
      'text=Absensi'
    ],
    "ABSENSI_MENU",
    log
  );

  if (clicked) {
    await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3500);
  }

  title = await page.title().catch(() => "");
  url = page.url();
  bodyText = await page.locator("body").innerText({ timeout: 8000 }).catch(() => "");

  log.push(`[${now()}] ABSENSI_MENU_TITLE=${title}`);
  log.push(`[${now()}] ABSENSI_MENU_URL=${url}`);

  const success = /absensi/i.test(url) || /absensi/i.test(bodyText.slice(0, 3000));
  log.push(`[${now()}] ABSENSI_OPEN_METHOD=${clicked ? "menu_click" : "not_found"}`);
  log.push(`[${now()}] ABSENSI_OPEN_SUCCESS_LIKELY=${success}`);

  return success;
}

async function runAbsensiOpenPreview(worker, index) {
  const startedAt = now();
  const log = [];
  let browser;
  let screenshotPath = null;

  log.push(`[${now()}] START ${worker.teacherId}`);
  log.push(`[${now()}] RULE=VISIBLE_ABSENSI_OPEN_PREVIEW_NO_INPUT_NO_SAVE`);
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

    const dashboardOk = await ensureDashboard(page, worker, log);
    if (!dashboardOk) {
      throw new Error("Dashboard /guru belum terbuka.");
    }

    const absensiOk = await openAbsensi(page, log);

    screenshotPath = path.join(
      shotsDir,
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(worker.teacherId)}-siaga-absensi-open-preview-real.png`
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const finalTitle = await page.title().catch(() => "");
    const finalUrl = page.url();

    log.push(`[${now()}] FINAL_TITLE=${finalTitle}`);
    log.push(`[${now()}] FINAL_URL=${finalUrl}`);
    log.push(`[${now()}] SCREENSHOT=${screenshotPath}`);
    log.push(`[${now()}] ABSENSI_OPEN_PREVIEW_SUCCESS_LIKELY=${absensiOk}`);
    log.push(`[${now()}] BROWSER_LEFT_OPEN=true`);

    return {
      teacherId: worker.teacherId,
      teacherName: worker.teacherName,
      wa: worker.wa,
      ok: true,
      status: absensiOk ? "absensi_open_preview_success" : "absensi_open_preview_needs_check",
      startedAt,
      endedAt: now(),
      currentUrl: finalUrl,
      title: finalTitle,
      screenshot: path.relative(root, screenshotPath).replaceAll("\\", "/"),
      note: "Browser sengaja dibiarkan terbuka untuk cek halaman Absensi. Tidak ada input/save.",
      log
    };
  } catch (error) {
    log.push(`[${now()}] ERROR=${error.message}`);

    screenshotPath = path.join(
      shotsDir,
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(worker.teacherId)}-siaga-absensi-open-preview-error-real.png`
    );

    try {
      const pages = browser?.pages?.() || [];
      const page = pages[0];
      if (page) await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {}

    return {
      teacherId: worker.teacherId,
      teacherName: worker.teacherName,
      wa: worker.wa,
      ok: false,
      status: "failed",
      startedAt,
      endedAt: now(),
      error: error.message,
      screenshot: fs.existsSync(screenshotPath) ? path.relative(root, screenshotPath).replaceAll("\\", "/") : null,
      log
    };
  }
}

async function main() {
  console.log("SMARTWORK_SIAGA_PARALLEL_ABSENSI_OPEN_PREVIEW=START");
  console.log("MODE=VISIBLE_BROWSER_ABSENSI_OPEN_ONLY_NO_INPUT_NO_SAVE");
  console.log("RULE=NO_SELECT_MONTH_NO_INPUT_JAM_NO_SAVE_NO_SUBMIT_NO_DELETE");

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
    const promise = runAbsensiOpenPreview(job, index)
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
    mode: "siaga-parallel-absensi-open-preview-visible",
    rule: "VISIBLE_BROWSER_ABSENSI_OPEN_ONLY_NO_INPUT_NO_SAVE",
    parallelLimit,
    totalJobs: results.length,
    startedAt: results[0]?.startedAt || now(),
    endedAt: now(),
    summary: {
      absensiOpenPreviewSuccess: results.filter((item) => item.status === "absensi_open_preview_success").length,
      absensiOpenPreviewNeedsCheck: results.filter((item) => item.status === "absensi_open_preview_needs_check").length,
      failed: results.filter((item) => item.status === "failed").length
    },
    results
  };

  const reportPath = path.join(reportsDir, "siaga-parallel-absensi-open-preview-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("SMARTWORK_SIAGA_PARALLEL_ABSENSI_OPEN_PREVIEW=DONE");
  console.log("REPORT=" + reportPath);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("");
  console.log("Browser sengaja dibiarkan terbuka untuk cek manual halaman Absensi.");
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_PARALLEL_ABSENSI_OPEN_PREVIEW=FAILED");
  console.error(error.message);
  process.exit(1);
});
