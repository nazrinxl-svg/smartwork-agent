import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const allowedHost = "siagapendis.kemenag.go.id";
const createUrl = "https://siagapendis.kemenag.go.id/guru/absensi/create";

const report = {
  id: `siaga-open-tambah-only-${stamp}`,
  mode: "open-tambah-only",
  safety: {
    noSave: true,
    noSubmit: true,
    noDelete: true,
    noSend: true,
    noFill: true
  },
  steps: [],
  screenshots: []
};

function step(name, status, note = "") {
  report.steps.push({ time: new Date().toISOString(), name, status, note });
  console.log(`${name}: ${status}${note ? " - " + note : ""}`);
}

function safeUrl(url) {
  try {
    return new URL(url).hostname === allowedHost;
  } catch {
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bodyText(page) {
  return await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
}

async function shot(context, page, name) {
  const file = path.join(shotsDir, `${stamp}-${name}.png`);

  try {
    await page.bringToFront().catch(() => {});
    await page.setViewportSize({ width: 1366, height: 768 }).catch(() => {});
    await wait(500);

    const session = await context.newCDPSession(page);
    const result = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false
    });

    fs.writeFileSync(file, Buffer.from(result.data, "base64"));
    report.screenshots.push(file);
    console.log(`SCREENSHOT=${file}`);
  } catch (error) {
    step(`screenshot_${name}`, "WARN", error.message);
  }
}

async function writeReport(page) {
  report.finalUrl = page.url();
  report.bodyPreview = (await bodyText(page)).slice(0, 1500);

  const jsonFile = path.join(reportsDir, `${stamp}-siaga-open-tambah-only.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-open-tambah-only.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(mdFile, [
    "# SIAGA Open Tambah Only",
    "",
    `- Result: ${report.result}`,
    `- Final URL: ${report.finalUrl}`,
    "- Fill: disabled",
    "- Save: disabled",
    "",
    "## Steps",
    ...report.steps.map((s) => `- ${s.name}: ${s.status}${s.note ? " — " + s.note : ""}`),
    "",
    "## Screenshots",
    ...report.screenshots.map((s) => `- ${s}`),
    ""
  ].join("\n"), "utf8");

  console.log(`REPORT_JSON=${jsonFile}`);
  console.log(`REPORT_MD=${mdFile}`);
  console.log(`SMARTWORK_OPEN_TAMBAH=${report.result}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SIAGA OPEN TAMBAH ONLY ===");
  console.log("Target: /guru/absensi/create");
  console.log("Safety: NO FILL, NO SAVE");

  let browser;
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  } catch {
    console.error("SMARTWORK_OPEN_TAMBAH=FAILED_NO_CHROME_DEBUG");
    console.error("Chrome debug belum aktif. Jalankan dulu: npm run open:siaga");
    process.exit(1);
  }

  const context = browser.contexts()[0] || await browser.newContext();
  let page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0];

  if (!page) {
    page = await context.newPage();
  }

  await page.bringToFront().catch(() => {});
  await wait(700);

  step("connect_chrome", "OK", "Chrome debug 9222");

  await page.goto(createUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((error) => {
    step("goto_create", "WARN", error.message);
  });

  await wait(2500);

  if (!safeUrl(page.url())) {
    step("domain_guard", "STOP", `Domain tidak diizinkan: ${page.url()}`);
    report.result = "STOP_DOMAIN_NOT_ALLOWED";
    await shot(context, page, "01-domain-stop");
    await writeReport(page);
    return;
  }

  const text = await bodyText(page);

  const isLogin =
    /\/login/i.test(page.url()) ||
    /Masukkan Nomor Akun|Masukan Kata Kunci|Masuk/i.test(text.slice(0, 1200));

  if (isLogin) {
    step("session_check", "STOP", "Session belum login / habis. Login dulu, lalu ulang npm run siaga:open-tambah.");
    report.result = "STOP_LOGIN_REQUIRED";
    await shot(context, page, "01-login-required");
    await writeReport(page);
    return;
  }

  const formVisible =
    /Sekolah/i.test(text) &&
    /Bulan/i.test(text) &&
    /Tahun/i.test(text) &&
    /Status Cuti/i.test(text) &&
    /Simpan/i.test(text);

  if (formVisible) {
    step("open_tambah", "OK", "Form Tambah Absensi terbuka.");
    report.result = "OK_TAMBAH_FORM_OPENED";
    await shot(context, page, "01-tambah-form-opened");
    await writeReport(page);
    return;
  }

  step("open_tambah", "WARN", "URL create terbuka, tapi form Tambah belum terdeteksi.");
  report.result = "WARN_CREATE_OPEN_FORM_NOT_DETECTED";
  await shot(context, page, "01-create-unknown");
  await writeReport(page);
}

main().catch((error) => {
  console.error("SMARTWORK_OPEN_TAMBAH=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
