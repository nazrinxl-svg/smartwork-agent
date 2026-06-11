import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
const shotsDir = path.join(root, "shots");
fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const runnerReportPath = path.join(reportsDir, "siaga-job-runner-preview-report.json");
const outputPath = path.join(reportsDir, "siaga-detail-dom-diagnose-report.json");
const profileDir = path.join(root, "browser-profile", "parallel-siaga-real", "guru-001-siaga");

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

if (!detailUrl) {
  throw new Error("NO_DETAIL_URL_FOR_DOM_DIAGNOSE");
}

console.log("SMARTWORK_DETAIL_DOM_DIAGNOSE=START");
console.log("RULE=NO_INPUT_NO_SAVE_NO_SUBMIT_NO_DELETE");
console.log(`DETAIL_URL=${detailUrl}`);

const browser = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: null,
  acceptDownloads: true
});

const page = browser.pages()[0] || await browser.newPage();

const startedAt = new Date().toISOString();
let report = {
  ok: false,
  mode: "SIAGA_DETAIL_DOM_DIAGNOSE_NO_SAVE",
  rule: "NO_INPUT_NO_SAVE_NO_SUBMIT_NO_DELETE",
  startedAt,
  detailUrl,
  profileDir,
  page: {},
  counts: {},
  samples: {},
  screenshot: null,
  htmlPath: null,
  diagnosis: []
};

try {
  await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(5000);

  const screenshotPath = path.join(shotsDir, `${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}-siaga-detail-dom-diagnose.png`);
  const htmlPath = path.join(reportsDir, "siaga-detail-dom-diagnose.html");

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  const html = await page.content().catch(() => "");
  fs.writeFileSync(htmlPath, html, "utf8");

  const info = await page.evaluate(() => {
    const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

    const anchors = [...document.querySelectorAll("a")].slice(0, 40).map((a) => ({
      text: clean(a.innerText),
      href: a.href
    }));

    const buttons = [...document.querySelectorAll("button, input[type=button], input[type=submit]")].slice(0, 40).map((b) => ({
      tag: b.tagName,
      text: clean(b.innerText || b.value),
      type: b.getAttribute("type") || ""
    }));

    const tables = [...document.querySelectorAll("table")].map((table, index) => ({
      index,
      id: table.id || "",
      className: table.className || "",
      rowCount: table.querySelectorAll("tr").length,
      headerText: clean([...table.querySelectorAll("th")].map((x) => x.innerText).join(" | ")).slice(0, 500),
      firstRows: [...table.querySelectorAll("tr")].slice(0, 5).map((tr) => clean(tr.innerText).slice(0, 500))
    }));

    const possibleDateRows = [...document.querySelectorAll("tr, .row, li, div")].filter((el) => {
      const t = clean(el.innerText);
      return /\b(0?[1-9]|[12][0-9]|3[01])\b/.test(t) && /(Juni|2026|Masuk|Pulang|Hadir|Absensi|Presensi|Tanggal)/i.test(t);
    }).slice(0, 80).map((el) => ({
      tag: el.tagName,
      className: el.className || "",
      text: clean(el.innerText).slice(0, 700)
    }));

    const bodyText = clean(document.body?.innerText || "");

    return {
      url: location.href,
      title: document.title,
      bodyTextStart: bodyText.slice(0, 2000),
      bodyTextLength: bodyText.length,
      tableCount: document.querySelectorAll("table").length,
      trCount: document.querySelectorAll("tr").length,
      inputCount: document.querySelectorAll("input").length,
      selectCount: document.querySelectorAll("select").length,
      buttonCount: document.querySelectorAll("button, input[type=button], input[type=submit]").length,
      linkCount: document.querySelectorAll("a").length,
      hasLoginText: /login|masuk|username|password|captcha/i.test(bodyText),
      hasAbsensiText: /absensi|presensi|tanggal|jam masuk|jam pulang/i.test(bodyText),
      tables,
      anchors,
      buttons,
      possibleDateRows
    };
  });

  report.page = {
    finalUrl: info.url,
    title: info.title,
    bodyTextLength: info.bodyTextLength,
    bodyTextStart: info.bodyTextStart
  };

  report.counts = {
    tableCount: info.tableCount,
    trCount: info.trCount,
    inputCount: info.inputCount,
    selectCount: info.selectCount,
    buttonCount: info.buttonCount,
    linkCount: info.linkCount,
    possibleDateRows: info.possibleDateRows.length
  };

  report.samples = {
    tables: info.tables,
    possibleDateRows: info.possibleDateRows,
    buttons: info.buttons,
    anchors: info.anchors
  };

  report.screenshot = path.relative(root, screenshotPath).replaceAll("\\", "/");
  report.htmlPath = path.relative(root, htmlPath).replaceAll("\\", "/");

  if (info.hasLoginText && !info.hasAbsensiText) {
    report.diagnosis.push("LIKELY_REDIRECTED_TO_LOGIN_OR_SESSION_EXPIRED");
  }
  if (info.tableCount === 0 && info.trCount === 0) {
    report.diagnosis.push("NO_TABLE_ROWS_FOUND_IN_DOM");
  }
  if (info.hasAbsensiText && info.trCount === 0) {
    report.diagnosis.push("ABSENSI_TEXT_EXISTS_BUT_TABLE_SELECTOR_OR_DYNAMIC_RENDER_MISSED");
  }
  if (info.possibleDateRows.length === 0) {
    report.diagnosis.push("NO_DATE_ROWS_DETECTED");
  }
  if (info.url !== detailUrl) {
    report.diagnosis.push("FINAL_URL_CHANGED_AFTER_GOTO");
  }

  report.ok = info.trCount > 0 || info.possibleDateRows.length > 0;
  report.endedAt = new Date().toISOString();

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.log("SMARTWORK_DETAIL_DOM_DIAGNOSE=DONE");
  console.log("REPORT=" + outputPath);
  console.log(JSON.stringify({
    ok: report.ok,
    finalUrl: report.page.finalUrl,
    title: report.page.title,
    counts: report.counts,
    diagnosis: report.diagnosis,
    screenshot: report.screenshot,
    htmlPath: report.htmlPath
  }, null, 2));
} finally {
  await browser.close().catch(() => {});
}
