import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
const shotsDir = path.join(root, "shots");
fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const runnerReportPath = path.join(reportsDir, "siaga-job-runner-preview-report.json");
const outputPath = path.join(reportsDir, "siaga-session-profile-diagnose-report.json");

function readJson(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

const runner = readJson(runnerReportPath, {});
const detailUrl =
  runner?.reports?.juniFind?.results?.[0]?.currentUrl ||
  runner?.reports?.juniFind?.results?.[0]?.detailUrl ||
  runner?.detailUrl ||
  "";

if (!detailUrl) throw new Error("NO_DETAIL_URL");

const profiles = [
  {
    name: "main-chrome",
    dir: path.join(root, "browser-profile", "chrome")
  },
  {
    name: "parallel-guru-001",
    dir: path.join(root, "browser-profile", "parallel-siaga-real", "guru-001-siaga")
  }
];

const results = [];

for (const profile of profiles) {
  let browser;
  const startedAt = new Date().toISOString();
  const shot = path.join(shotsDir, `${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-${profile.name}-session-diagnose.png`);

  try {
    browser = await chromium.launchPersistentContext(profile.dir, {
      headless: false,
      viewport: null,
      acceptDownloads: true
    });

    const page = browser.pages()[0] || await browser.newPage();
    await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {});

    const info = await page.evaluate(() => {
      const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
      const bodyText = clean(document.body?.innerText || "");
      return {
        finalUrl: location.href,
        title: document.title,
        bodyTextStart: bodyText.slice(0, 1000),
        hasLoginText: /login|masuk|username|password|captcha/i.test(bodyText),
        hasAbsensiText: /absensi|presensi|tanggal|jam masuk|jam pulang/i.test(bodyText),
        tableCount: document.querySelectorAll("table").length,
        trCount: document.querySelectorAll("tr").length,
        inputCount: document.querySelectorAll("input").length,
        buttonCount: document.querySelectorAll("button, input[type=submit]").length
      };
    });

    results.push({
      ok: (
        info.finalUrl === detailUrl &&
        info.hasAbsensiText &&
        (Number(info.tableCount || 0) > 0 || Number(info.trCount || 0) > 0)
      ),
      profile: profile.name,
      profileDir: profile.dir,
      startedAt,
      endedAt: new Date().toISOString(),
      screenshot: path.relative(root, shot).replaceAll("\\", "/"),
      ...info
    });
  } catch (error) {
    results.push({
      ok: false,
      profile: profile.name,
      profileDir: profile.dir,
      startedAt,
      endedAt: new Date().toISOString(),
      error: String(error?.message || error)
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

const report = {
  ok: results.some((r) => r.ok),
  mode: "SIAGA_SESSION_PROFILE_DIAGNOSE_NO_SAVE",
  rule: "NO_INPUT_NO_SAVE_NO_SUBMIT_NO_DELETE",
  detailUrl,
  results,
  bestProfile: results.find((r) => r.ok)?.profile || null,
  generatedAt: new Date().toISOString()
};

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

console.log("SMARTWORK_SIAGA_SESSION_PROFILE_DIAGNOSE=DONE");
console.log("REPORT=" + outputPath);
console.log(JSON.stringify({
  ok: report.ok,
  bestProfile: report.bestProfile,
  results: report.results.map((r) => ({
    profile: r.profile,
    ok: r.ok,
    finalUrl: r.finalUrl,
    hasLoginText: r.hasLoginText,
    hasAbsensiText: r.hasAbsensiText,
    tableCount: r.tableCount,
    trCount: r.trCount,
    screenshot: r.screenshot,
    error: r.error
  }))
}, null, 2));
