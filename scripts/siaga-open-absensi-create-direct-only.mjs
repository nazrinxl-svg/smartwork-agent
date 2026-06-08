import { chromium } from "playwright";
import fs from "fs";

const CDP_URL = "http://127.0.0.1:9222";
const TARGET_URL = "https://siagapendis.kemenag.go.id/guru/absensi/create";

const reportsDir = "reports";
const shotsDir = "shots";
fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = `${reportsDir}/siaga-open-absensi-create-direct-${stamp}.json`;
const shotPath = `${shotsDir}/siaga-open-absensi-create-direct-${stamp}.png`;

async function main() {
  console.log("SMARTWORK_MICRO_AGENT=OPEN_ABSENSI_CREATE_DIRECT_ONLY");
  console.log("RULE=NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_INPUT_NO_SAVE");

  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 0 });
  const pages = browser.contexts()
    .flatMap(ctx => ctx.pages())
    .filter(p => !p.url().startsWith("chrome://"));

  console.log("=== OPEN_TABS_BEFORE ===");
  pages.forEach((p, i) => console.log(`[${i}] ${p.url()}`));

  const siagaPage =
    pages.find(p => p.url().includes("siagapendis.kemenag.go.id/guru/absensi/create")) ||
    pages.find(p => p.url().includes("siagapendis.kemenag.go.id/guru")) ||
    pages.find(p => p.url().includes("siagapendis.kemenag.go.id"));

  if (!siagaPage) {
    throw new Error("STOP: Tidak ada tab SIAGA. Buka SIAGA manual dulu, agent tidak login ulang.");
  }

  await siagaPage.bringToFront();
  console.log(`CURRENT_URL_BEFORE=${siagaPage.url()}`);

  if (!siagaPage.url().includes("/guru/absensi/create")) {
    console.log(`STEP=GOTO_DIRECT_CREATE_URL`);
    await siagaPage.goto(TARGET_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    }).catch(err => {
      console.log(`GOTO_WARNING=${err.message}`);
    });
  }

  await siagaPage.waitForTimeout(1500);

  const currentUrl = siagaPage.url();
  console.log(`CURRENT_URL_AFTER=${currentUrl}`);

  await siagaPage.screenshot({
    path: shotPath,
    fullPage: false
  });

  const ok = currentUrl.includes("/guru/absensi/create");

  const result = {
    ok,
    rule: "NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_INPUT_NO_SAVE",
    targetUrl: TARGET_URL,
    currentUrl,
    screenshot: shotPath,
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));

  console.log(`REPORT=${reportPath}`);
  console.log(`SCREENSHOT=${shotPath}`);

  if (!ok) {
    console.log("SMARTWORK_OPEN_FORM_DIRECT=FAILED_NOT_ON_CREATE_FORM");
    throw new Error("STOP: Direct URL tidak membawa ke form create. Kemungkinan session/route menolak. Buka form Tambah Absensi manual sekali, lalu jalankan agent Tahun.");
  }

  console.log("SMARTWORK_OPEN_FORM_DIRECT=OK_CREATE_FORM_ACTIVE");
}

main().catch(err => {
  console.error("SMARTWORK_OPEN_FORM_DIRECT=FAILED");
  console.error(err.message);
  process.exit(1);
});
