import { chromium } from "playwright";
import fs from "fs";

const CDP_URL = "http://127.0.0.1:9222";

const reportsDir = "reports";
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = `${reportsDir}/siaga-find-form-tab-${stamp}.json`;

async function main() {
  console.log("SMARTWORK_MICRO_AGENT=FIND_FORM_TAB_ONLY");
  console.log("RULE=NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_SAVE");

  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 0 });
  const contexts = browser.contexts();

  const pages = contexts
    .flatMap(ctx => ctx.pages())
    .filter(p => !p.url().startsWith("chrome://"));

  const tabs = pages.map((p, index) => ({
    index,
    url: p.url()
  }));

  console.log("=== OPEN_TABS ===");
  for (const tab of tabs) {
    console.log(`[${tab.index}] ${tab.url}`);
  }

  const formPage = pages.find(p => p.url().includes("/guru/absensi/create"));

  const result = {
    ok: Boolean(formPage),
    foundFormTab: Boolean(formPage),
    tabs,
    selectedUrl: formPage ? formPage.url() : null,
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
  console.log(`REPORT=${reportPath}`);

  if (!formPage) {
    console.log("SMARTWORK_FIND_FORM_TAB=NO_FORM_TAB");
    throw new Error("STOP: Tidak ada tab form /guru/absensi/create. Buka manual form Tambah Absensi dulu, lalu jalankan micro-agent Tahun lagi.");
  }

  await formPage.bringToFront();
  await formPage.waitForTimeout(700);

  console.log(`CURRENT_URL=${formPage.url()}`);
  console.log("SMARTWORK_FIND_FORM_TAB=OK_FORM_TAB_ACTIVE");
}

main().catch(err => {
  console.error("SMARTWORK_FIND_FORM_TAB=FAILED");
  console.error(err.message);
  process.exit(1);
});
