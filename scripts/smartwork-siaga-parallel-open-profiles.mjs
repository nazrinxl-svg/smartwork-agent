import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
const shotsDir = path.join(root, "shots");
const profileRoot = path.join(root, "browser-profile", "parallel-siaga");

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(profileRoot, { recursive: true });

const SIAGA_URL = "https://siagapendis.kemenag.go.id/";

const workers = [
  {
    teacherId: "guru-001",
    teacherName: "Guru Dummy A",
    appId: "siaga",
    profileDir: path.join(profileRoot, "guru-001-siaga")
  },
  {
    teacherId: "guru-002",
    teacherName: "Guru Dummy B",
    appId: "siaga",
    profileDir: path.join(profileRoot, "guru-002-siaga")
  }
];

function now() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function runWorker(worker) {
  const startedAt = now();
  const log = [];

  log.push(`[${now()}] START ${worker.teacherId}`);
  log.push(`[${now()}] RULE=NO_LOGIN_NO_INPUT_NO_SAVE`);
  log.push(`[${now()}] PROFILE=${worker.profileDir}`);
  log.push(`[${now()}] URL=${SIAGA_URL}`);

  fs.mkdirSync(worker.profileDir, { recursive: true });

  let context;
  let screenshotPath = null;

  try {
    context = await chromium.launchPersistentContext(worker.profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: [
        "--disable-blink-features=AutomationControlled"
      ]
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto(SIAGA_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    const title = await page.title().catch(() => "");
    const url = page.url();

    log.push(`[${now()}] PAGE_TITLE=${title}`);
    log.push(`[${now()}] PAGE_URL=${url}`);

    screenshotPath = path.join(
      shotsDir,
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugify(worker.teacherId)}-siaga-open-profile.png`
    );

    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });

    log.push(`[${now()}] SCREENSHOT=${screenshotPath}`);
    log.push(`[${now()}] DONE ${worker.teacherId}`);

    return {
      ...worker,
      ok: true,
      status: "done",
      startedAt,
      endedAt: now(),
      currentUrl: url,
      title,
      screenshot: path.relative(root, screenshotPath).replace(/\\/g, "/"),
      log
    };
  } catch (error) {
    log.push(`[${now()}] ERROR=${error.message}`);

    return {
      ...worker,
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

async function main() {
  console.log("SMARTWORK_SIAGA_PARALLEL_OPEN_PROFILES=START");
  console.log("MODE=SAFE_NO_LOGIN_NO_INPUT_NO_SAVE");
  console.log("WORKERS=" + workers.length);

  const results = await Promise.all(workers.map(runWorker));

  const report = {
    ok: results.every((item) => item.ok),
    mode: "siaga-parallel-open-profiles-safe",
    rule: "NO_LOGIN_NO_INPUT_NO_SAVE",
    parallelWorkers: workers.length,
    startedAt: results[0]?.startedAt || now(),
    endedAt: now(),
    summary: {
      done: results.filter((item) => item.status === "done").length,
      failed: results.filter((item) => item.status === "failed").length
    },
    results
  };

  const reportPath = path.join(reportsDir, "siaga-parallel-open-profiles-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("SMARTWORK_SIAGA_PARALLEL_OPEN_PROFILES=DONE");
  console.log("REPORT=" + reportPath);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("NOTE=Headless server mode. Browser tidak muncul di layar. Cek screenshot/report.");
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_PARALLEL_OPEN_PROFILES=FAILED");
  console.error(error.message);
  process.exit(1);
});

