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

  const targetTeacherId = (process.env.TARGET_TEACHER_ID || "").trim();
const parallelLimit = targetTeacherId ? 1 : Number(raw.parallelLimit || 2);
  const accounts = Array.isArray(raw.accounts)
    ? raw.accounts
    : Array.isArray(raw.teachers)
      ? raw.teachers
      : [];

  const jobs = accounts
    .filter((item, index) => {
      if (!item || item.enabled === false) return false;
      if (!targetTeacherId) return true;
      const teacherId = item.teacherId || `guru-${String(index + 1).padStart(3, "0")}`;
      return teacherId === targetTeacherId;
    })
    .map((item, index) => ({
      teacherId: item.teacherId || `guru-${String(index + 1).padStart(3, "0")}`,
      teacherName: item.teacherName || item.name || `Guru ${index + 1}`,
      wa: item.wa || "",
      username: item.username || item.user || item.nik || "",
      password: item.password || item.pass || "",
      profileDir: path.join(profileRoot, slugify(item.teacherId || `guru-${index + 1}`) + "-siaga")
    }));

  if (jobs.length === 0) {
    throw new Error("Tidak ada akun enabled di data/teacher-accounts.local.json");
  }

  if (targetTeacherId && jobs.length !== 1) {
    throw new Error("TARGET_TEACHER_ID tidak ditemukan atau tidak unique: " + targetTeacherId);
  }

  return { parallelLimit, jobs };
}

async function findJuniDetail(page, log) {
  const TARGET_MONTH = "Juni";
  const TARGET_YEAR = "2026";

  const data = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("table tbody tr, table tr")).map((tr, index) => {
      const cells = Array.from(tr.querySelectorAll("td, th")).map((cell) =>
        (cell.innerText || "").replace(/\s+/g, " ").trim()
      );

      const links = Array.from(tr.querySelectorAll("a")).map((a) => ({
        text: (a.innerText || "").replace(/\s+/g, " ").trim(),
        href: a.href || ""
      }));

      const text = (tr.innerText || "").replace(/\s+/g, " ").trim();

      return { index, cells, text, links };
    });

    return { rows };
  });

  const strictRows = data.rows.filter((row) => {
    const rowText = `${row.text || ""} ${(row.cells || []).join(" ")}`;
    return new RegExp(TARGET_MONTH, "i").test(rowText) && rowText.includes(TARGET_YEAR);
  });

  const candidates = [];

  for (const row of strictRows) {
    for (const link of row.links || []) {
      const joined = `${link.text} ${link.href}`;
      const isDetailHref = /\/guru\/absensi\/detail\/\d+/i.test(link.href);
      const isDetailText = /detail|lihat|input/i.test(joined);

      if (isDetailHref || isDetailText) {
        candidates.push({
          source: "strict_target_month_year_row",
          targetMonth: TARGET_MONTH,
          targetYear: TARGET_YEAR,
          rowIndex: row.index,
          rowText: row.text.slice(0, 500),
          cells: row.cells,
          linkText: link.text,
          href: link.href
        });
      }
    }
  }

  log.push(`[${now()}] STRICT_TARGET_MONTH=${TARGET_MONTH}`);
  log.push(`[${now()}] STRICT_TARGET_YEAR=${TARGET_YEAR}`);
  log.push(`[${now()}] STRICT_TARGET_ROWS=${strictRows.length}`);
  log.push(`[${now()}] STRICT_TARGET_CANDIDATES=${candidates.length}`);

  return {
    strictRows,
    candidates,
    best: candidates[0] || null
  };
}
async function ensureGuruSession(page, worker, log) {
  await page.goto(SIAGA_GURU_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);

  if (page.url().includes("/guru")) {
    log.push(`[${now()}] SESSION_OK_ALREADY_GURU=true`);
    return true;
  }

  const bodyText = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
  const looksLogin = page.url().includes("/login") || /login|username|password|masuk/i.test(bodyText);

  if (!looksLogin) {
    log.push(`[${now()}] SESSION_UNKNOWN_URL=${page.url()}`);
    return false;
  }

  if (!worker.username || !worker.password) {
    log.push(`[${now()}] LOGIN_FALLBACK_BLOCKED_MISSING_CREDENTIAL=true`);
    return false;
  }

  log.push(`[${now()}] LOGIN_FALLBACK_START=true`);

  const usernameSelectors = [
    "input[name='username']",
    "input[name='email']",
    "input[type='text']"
  ];

  const passwordSelectors = [
    "input[name='password']",
    "input[type='password']"
  ];

  let filledUsername = false;
  for (const selector of usernameSelectors) {
    const el = page.locator(selector).first();
    if (await el.count().catch(() => 0)) {
      await el.fill(worker.username);
      log.push(`[${now()}] LOGIN_FILL_USERNAME=OK selector=${selector}`);
      filledUsername = true;
      break;
    }
  }

  let filledPassword = false;
  for (const selector of passwordSelectors) {
    const el = page.locator(selector).first();
    if (await el.count().catch(() => 0)) {
      await el.fill(worker.password);
      log.push(`[${now()}] LOGIN_FILL_PASSWORD=OK selector=${selector}`);
      filledPassword = true;
      break;
    }
  }

  if (!filledUsername || !filledPassword) {
    log.push(`[${now()}] LOGIN_FALLBACK_FAILED_INPUT_NOT_FOUND=true`);
    return false;
  }

  const submit = page.locator("button[type='submit'], input[type='submit'], button:has-text('Login'), button:has-text('Masuk')").first();
  await submit.click({ timeout: 15000 });
  await page.waitForTimeout(5000);

  log.push(`[${now()}] LOGIN_FALLBACK_AFTER_URL=${page.url()}`);
  return page.url().includes("/guru");
}
async function runWorker(worker, index) {
  const startedAt = now();
  const log = [];
  let browser;
  let screenshotPath = null;

  log.push(`[${now()}] START ${worker.teacherId}`);
  log.push(`[${now()}] RULE=VISIBLE_FIND_JUNI_DETAIL_ONLY_NO_INPUT_NO_SAVE_NO_DELETE`);
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

    log.push(`[${now()}] OPEN_DASHBOARD=${SIAGA_GURU_URL}`);
    const sessionOk = await ensureGuruSession(page, worker, log);

    if (!sessionOk) {
      throw new Error("Session belum masuk /guru dan auto-login fallback gagal.");
    }

    log.push(`[${now()}] OPEN_ABSENSI=${SIAGA_ABSENSI_URL}`);
    await page.goto(SIAGA_ABSENSI_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(3500);

    const beforeTitle = await page.title().catch(() => "");
    const beforeUrl = page.url();
    const findResult = await findJuniDetail(page, log);

    if (findResult.best?.href) {
      log.push(`[${now()}] OPEN_JUNI_DETAIL=${findResult.best.href}`);
      await page.goto(findResult.best.href, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(3500);
    } else {
      log.push(`[${now()}] JUNI_DETAIL_NOT_FOUND=true`);
    }

    const finalTitle = await page.title().catch(() => "");
    const finalUrl = page.url();
    const bodyText = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");

    screenshotPath = path.join(
      shotsDir,
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(worker.teacherId)}-siaga-juni-find-preview-real.png`
    );

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const successLikely =
      /\/guru\/absensi\/detail\/\d+/i.test(finalUrl) &&
      /Detail Absensi/i.test(bodyText) &&
      /Juni\s+2026/i.test(bodyText);

    log.push(`[${now()}] FINAL_TITLE=${finalTitle}`);
    log.push(`[${now()}] FINAL_URL=${finalUrl}`);
    log.push(`[${now()}] SCREENSHOT=${screenshotPath}`);
    log.push(`[${now()}] JUNI_FIND_SUCCESS_LIKELY=${successLikely}`);
    log.push(`[${now()}] BROWSER_LEFT_OPEN=true`);

    return {
      teacherId: worker.teacherId,
      teacherName: worker.teacherName,
      wa: worker.wa,
      ok: true,
      status: successLikely ? "juni_detail_preview_success" : "juni_detail_preview_needs_check",
      startedAt,
      endedAt: now(),
      beforeUrl,
      beforeTitle,
      currentUrl: finalUrl,
      title: finalTitle,
      bestCandidate: findResult.best,
      candidateCount: findResult.candidates.length,
      screenshot: path.relative(root, screenshotPath).replaceAll("\\", "/"),
      note: "Preview cari/buka detail Juni saja. Tidak input, tidak save, tidak delete.",
      bodyPreview: bodyText.replace(/\s+/g, " ").slice(0, 1200),
      log
    };
  } catch (error) {
    log.push(`[${now()}] ERROR=${error.message}`);

    screenshotPath = path.join(
      shotsDir,
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(worker.teacherId)}-siaga-juni-find-preview-error-real.png`
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
  console.log("SMARTWORK_SIAGA_PARALLEL_ABSENSI_JUNI_FIND_PREVIEW=START");
  console.log("MODE=VISIBLE_BROWSER_FIND_JUNI_DETAIL_ONLY_NO_INPUT_NO_SAVE");
  console.log("RULE=NO_INPUT_NO_SAVE_NO_SUBMIT_NO_DELETE");

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
    mode: "siaga-parallel-absensi-juni-find-preview-visible",
    rule: "VISIBLE_BROWSER_FIND_JUNI_DETAIL_ONLY_NO_INPUT_NO_SAVE",
    parallelLimit,
    totalJobs: results.length,
    startedAt: results[0]?.startedAt || now(),
    endedAt: now(),
    summary: {
      juniDetailPreviewSuccess: results.filter((item) => item.status === "juni_detail_preview_success").length,
      juniDetailPreviewNeedsCheck: results.filter((item) => item.status === "juni_detail_preview_needs_check").length,
      failed: results.filter((item) => item.status === "failed").length
    },
    results
  };

  const reportPath = path.join(reportsDir, "siaga-parallel-absensi-juni-find-preview-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("SMARTWORK_SIAGA_PARALLEL_ABSENSI_JUNI_FIND_PREVIEW=DONE");
  console.log("REPORT=" + reportPath);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("");
  console.log("Browser dibiarkan terbuka untuk cek manual. Tidak ada input/save/delete.");
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_PARALLEL_ABSENSI_JUNI_FIND_PREVIEW=FAILED");
  console.error(error.message);
  process.exit(1);
});





