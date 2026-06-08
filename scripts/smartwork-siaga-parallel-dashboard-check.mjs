import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const inputPath = path.join(root, "data", "teacher-accounts.local.json");
const reportsDir = path.join(root, "reports");
const shotsDir = path.join(root, "shots");
const profileRoot = path.join(root, "browser-profile", "parallel-siaga-real");

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(profileRoot, { recursive: true });

const SIAGA_URL = "https://siagapendis.kemenag.go.id/guru";

function now() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function readLocalAccounts() {
  if (!fs.existsSync(inputPath)) {
    throw new Error(
      `File credential lokal belum ada: ${inputPath}. Copy data/teacher-accounts.local.example.json menjadi data/teacher-accounts.local.json lalu isi username/password di lokal.`
    );
  }

  const raw = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "").trim();
  const data = JSON.parse(raw);

  const jobs = [];

  for (const teacher of data.teachers || []) {
    const siagaApp = (teacher.apps || []).find((app) => app.appId === "siaga");

    if (!siagaApp) continue;

    if (!siagaApp.username || !siagaApp.password) {
      throw new Error(`Credential SIAGA belum lengkap untuk ${teacher.teacherId}`);
    }

    if (String(siagaApp.username).includes("ISI_USERNAME") || String(siagaApp.password).includes("ISI_PASSWORD")) {
      throw new Error(`Credential SIAGA masih placeholder untuk ${teacher.teacherId}`);
    }

    jobs.push({
      teacherId: teacher.teacherId,
      teacherName: teacher.name,
      wa: teacher.wa,
      username: siagaApp.username,
      password: siagaApp.password,
      profileDir: path.join(profileRoot, `${teacher.teacherId}-siaga`)
    });
  }

  return {
    parallelLimit: Number(data.parallelLimit || 2),
    jobs
  };
}

async function fillFirstMatching(page, selectors, value, label, log) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);

    if (count > 0) {
      await locator.fill(value, { timeout: 5000 });
      log.push(`[${now()}] FILL_${label}=OK selector=${selector}`);
      return true;
    }
  }

  log.push(`[${now()}] FILL_${label}=NOT_FOUND`);
  return false;
}

async function clickFirstMatching(page, selectors, label, log) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count().catch(() => 0);

    if (count > 0) {
      await locator.click({ timeout: 8000 });
      log.push(`[${now()}] CLICK_${label}=OK selector=${selector}`);
      return true;
    }
  }

  log.push(`[${now()}] CLICK_${label}=NOT_FOUND`);
  return false;
}

async function runLoginCheck(worker) {
  const startedAt = now();
  const log = [];

  log.push(`[${now()}] START ${worker.teacherId}`);
  log.push(`[${now()}] RULE=DASHBOARD_CHECK_ONLY_NO_INPUT_NO_SAVE`);
  log.push(`[${now()}] PROFILE=${worker.profileDir}`);
  log.push(`[${now()}] URL=${SIAGA_URL}`);

  fs.mkdirSync(worker.profileDir, { recursive: true });

  let context;
  let screenshotPath = null;

  try {
    context = await chromium.launchPersistentContext(worker.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ["--disable-blink-features=AutomationControlled"]
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto(SIAGA_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);

    const beforeTitle = await page.title().catch(() => "");
    log.push(`[${now()}] BEFORE_TITLE=${beforeTitle}`);
    log.push(`[${now()}] BEFORE_URL=${page.url()}`);

    // SMARTWORK FIX:
    // Jika profile/session sudah langsung masuk dashboard guru,
    // dashboard check selesai di sini. Tidak perlu cari field login.
    if (page.url().includes("/guru")) {
      const dashboardTitle = await page.title().catch(() => "");
      const dashboardUrl = page.url();

      screenshotPath = path.join(
        shotsDir,
        `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(worker.teacherId)}-siaga-dashboard-check-real.png`
      );

      await page.screenshot({ path: screenshotPath, fullPage: true });

      log.push(`[${now()}] DASHBOARD_ALREADY_OPEN=true`);
      log.push(`[${now()}] DASHBOARD_TITLE=${dashboardTitle}`);
      log.push(`[${now()}] DASHBOARD_URL=${dashboardUrl}`);
      log.push(`[${now()}] SCREENSHOT=${screenshotPath}`);
      log.push(`[${now()}] DASHBOARD_SUCCESS_LIKELY=true`);
      log.push(`[${now()}] DONE ${worker.teacherId}`);

      return {
        teacherId: worker.teacherId,
        teacherName: worker.teacherName,
        wa: worker.wa,
        ok: true,
        status: "dashboard_likely_success",
        startedAt,
        endedAt: now(),
        currentUrl: dashboardUrl,
        title: dashboardTitle,
        screenshot: path.relative(root, screenshotPath).replaceAll("\\", "/"),
        log
      };
    }

    // SMARTWORK FIX:
    // Kadang SIAGA mengarahkan /login ke /index/beranda.
    // Di beranda tidak ada input login, jadi klik menu LOGIN SIAGA dulu.
    if (page.url().includes("/index/beranda")) {
      log.push(`[${now()}] BERANDA_DETECTED_BEFORE_FILL=true`);

      const loginMenu = page
        .locator('a[href$="/login"], a:has-text("LOGIN SIAGA"), a:has-text("Login SIAGA")')
        .first();

      const loginMenuCount = await loginMenu.count().catch(() => 0);

      if (loginMenuCount > 0) {
        await loginMenu.click({ timeout: 10000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(2500);
        log.push(`[${now()}] CLICK_LOGIN_MENU_FROM_BERANDA=OK url=${page.url()}`);
      } else {
        await page.goto(SIAGA_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(2500);
        log.push(`[${now()}] GOTO_LOGIN_FROM_BERANDA=OK url=${page.url()}`);
      }
    }
    const userOk = await fillFirstMatching(
      page,
      [
        'input[name="username"]',
        'input[name="email"]',
        'input[type="text"]',
        'input[placeholder*="Username" i]',
        'input[placeholder*="NPK" i]',
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
      throw new Error("Login field tidak ditemukan lengkap.");
    }

    await clickFirstMatching(
      page,
      [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Login")',
        'button:has-text("Masuk")',
        'a:has-text("Login")',
        'a:has-text("Masuk")'
      ],
      "LOGIN",
      log
    );

    await page.waitForTimeout(6000);

    const afterTitle = await page.title().catch(() => "");
    const afterUrl = page.url();

    log.push(`[${now()}] AFTER_TITLE=${afterTitle}`);
    log.push(`[${now()}] AFTER_URL=${afterUrl}`);

    const pageText = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
    const loginStillVisible = /login|masuk|password|username/i.test(pageText.slice(0, 1500));
    const successLikely = !afterUrl.includes("login") && !loginStillVisible;

    screenshotPath = path.join(
      shotsDir,
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(worker.teacherId)}-siaga-dashboard-check-real.png`
    );

    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });

    log.push(`[${now()}] SCREENSHOT=${screenshotPath}`);
    log.push(`[${now()}] DASHBOARD_SUCCESS_LIKELY=${successLikely}`);
    log.push(`[${now()}] DONE ${worker.teacherId}`);

    return {
      teacherId: worker.teacherId,
      teacherName: worker.teacherName,
      wa: worker.wa,
      ok: true,
      status: successLikely ? "dashboard_likely_success" : "dashboard_needs_check",
      startedAt,
      endedAt: now(),
      currentUrl: afterUrl,
      title: afterTitle,
      screenshot: path.relative(root, screenshotPath).replace(/\\/g, "/"),
      log
    };
  } catch (error) {
    log.push(`[${now()}] ERROR=${error.message}`);

    if (context) {
      const pages = context.pages();
      const page = pages[0];

      if (page) {
        screenshotPath = path.join(
          shotsDir,
          `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(worker.teacherId)}-siaga-dashboard-check-error-real.png`
        );

        await page.screenshot({
          path: screenshotPath,
          fullPage: true
        }).catch(() => {});
      }
    }

    return {
      teacherId: worker.teacherId,
      teacherName: worker.teacherName,
      wa: worker.wa,
      ok: false,
      status: "failed",
      startedAt,
      endedAt: now(),
      error: error.message,
      screenshot: screenshotPath ? path.relative(root, screenshotPath).replace(/\\/g, "/") : null,
      log
    };
  } finally {
    if (context) {
      await context.close();
    }
  }
}

async function runPool(jobs, limit) {
  const queue = [...jobs];
  const running = new Set();
  const results = [];

  async function launch(job) {
    running.add(job);

    try {
      results.push(await runLoginCheck(job));
    } finally {
      running.delete(job);
    }
  }

  while (queue.length > 0 || running.size > 0) {
    while (queue.length > 0 && running.size < limit) {
      launch(queue.shift());
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return results;
}

async function main() {
  console.log("SMARTWORK_SIAGA_PARALLEL_DASHBOARD_CHECK=START");
  console.log("MODE=HEADLESS_DASHBOARD_CHECK_ONLY_NO_INPUT_NO_SAVE");

  const { parallelLimit, jobs } = readLocalAccounts();

  console.log("TOTAL_JOBS=" + jobs.length);
  console.log("PARALLEL_LIMIT=" + parallelLimit);
  console.log("RULE=ONE_ACCOUNT_ONE_BROWSER_PROFILE");
  console.log("RULE=NO_ABSENSI_INPUT_NO_SAVE");

  const results = await runPool(jobs, parallelLimit);

  const report = {
    ok: results.every((item) => item.ok),
    mode: "siaga-parallel-dashboard-check-headless",
    rule: "DASHBOARD_CHECK_ONLY_NO_INPUT_NO_SAVE",
    parallelLimit,
    totalJobs: results.length,
    startedAt: results[0]?.startedAt || now(),
    endedAt: now(),
    summary: {
      dashboardLikelySuccess: results.filter((item) => item.status === "dashboard_likely_success").length,
      dashboardNeedsCheck: results.filter((item) => item.status === "dashboard_needs_check").length,
      failed: results.filter((item) => item.status === "failed").length
    },
    results
  };

  const reportPath = path.join(reportsDir, "siaga-parallel-dashboard-check-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("SMARTWORK_SIAGA_PARALLEL_DASHBOARD_CHECK=DONE");
  console.log("REPORT=" + reportPath);
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_PARALLEL_DASHBOARD_CHECK=FAILED");
  console.error(error.message);
  process.exit(1);
});





