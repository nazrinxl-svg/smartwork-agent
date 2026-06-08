import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
const shotsDir = path.join(root, "shots");
fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportsDir, `${stamp}-siaga-beranda-to-tambah.json`);
const beforeShot = path.join(shotsDir, `${stamp}-01-before-beranda-to-tambah.png`);
const afterShot = path.join(shotsDir, `${stamp}-02-after-beranda-to-tambah.png`);

const GURU_URL = "https://siagapendis.kemenag.go.id/guru";
const CREATE_URL = "https://siagapendis.kemenag.go.id/guru/absensi/create";

async function screenshot(page, file) {
  await page.bringToFront().catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`SCREENSHOT=${file}`);
}

async function formVisible(page) {
  return await page.evaluate(() => {
    const text = String(document.body.innerText || "").replace(/\s+/g, " ").trim();
    return {
      url: location.href,
      ok: /Sekolah/i.test(text) &&
          /Bulan/i.test(text) &&
          /Tahun/i.test(text) &&
          /Status Cuti/i.test(text) &&
          /Simpan/i.test(text),
      preview: text.slice(0, 1200)
    };
  });
}

async function main() {
  console.log("SMARTWORK_AGENT=BERANDA_TO_TAMBAH_ABSENSI_ONLY");
  console.log("RULE=NO_LOGIN_SUBMIT_NO_INPUT_NO_SAVE_NO_ZOOM_NO_VIEWPORT");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id")) ||
    context.pages().find(p => !p.url().startsWith("chrome://")) ||
    context.pages()[0];

  if (!page) throw new Error("STOP: Tab SIAGA tidak ditemukan.");

  await page.bringToFront();
  await page.waitForTimeout(700);

  const startUrl = page.url();
  console.log(`START_URL=${startUrl}`);

  await screenshot(page, beforeShot);

  const steps = [];

  // Step 1: kalau masih di beranda umum, masuk dashboard guru.
  if (!page.url().includes("/guru")) {
    console.log("STEP=GO_TO_GURU_DASHBOARD");
    await page.goto(GURU_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    }).catch(err => {
      console.log(`GURU_GOTO_WARNING=${err.message}`);
    });

    await page.waitForTimeout(2500);
  }

  steps.push({
    step: "after_guru_dashboard",
    url: page.url(),
    state: await formVisible(page)
  });

  console.log(`URL_AFTER_GURU=${page.url()}`);

  // Step 2: langsung buka create URL. Ini bukan klik tambah manual, hanya buka route form.
  console.log("STEP=GO_TO_ABSENSI_CREATE");
  await page.goto(CREATE_URL, {
    waitUntil: "domcontentloaded",
    timeout: 45000
  }).catch(err => {
    console.log(`CREATE_GOTO_WARNING=${err.message}`);
  });

  await page.waitForTimeout(2500);

  let check = await formVisible(page);
  steps.push({
    step: "after_create_url",
    url: page.url(),
    state: check
  });

  // Step 3: kalau route create belum muncul, klik Dashboard lalu retry create sekali.
  if (!check.ok) {
    console.log("STEP=CREATE_NOT_VISIBLE_RETRY_GURU_THEN_CREATE");

    await page.goto(GURU_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    }).catch(err => {
      console.log(`RETRY_GURU_WARNING=${err.message}`);
    });

    await page.waitForTimeout(1500);

    await page.goto(CREATE_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    }).catch(err => {
      console.log(`RETRY_CREATE_WARNING=${err.message}`);
    });

    await page.waitForTimeout(2500);

    check = await formVisible(page);
    steps.push({
      step: "after_retry_create",
      url: page.url(),
      state: check
    });
  }

  await screenshot(page, afterShot);

  const report = {
    agent: "BERANDA_TO_TAMBAH_ABSENSI_ONLY",
    rule: "NO_LOGIN_SUBMIT_NO_INPUT_NO_SAVE_NO_ZOOM_NO_VIEWPORT",
    startUrl,
    finalUrl: page.url(),
    finalCheck: check,
    steps,
    screenshots: [beforeShot, afterShot],
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`REPORT=${reportPath}`);

  if (!check.ok) {
    console.log(JSON.stringify(report, null, 2));
    throw new Error("STOP: Form Tambah Absensi belum terbuka. Tidak isi data.");
  }

  console.log("SMARTWORK_BERANDA_TO_TAMBAH=OK_FORM_OPENED_NO_INPUT_NO_SAVE");
}

main().catch(error => {
  console.error("SMARTWORK_BERANDA_TO_TAMBAH=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
