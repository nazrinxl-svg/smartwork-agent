import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
const shotsDir = path.join(root, "shots");
const profileDir = path.join(root, "browser-profile", "parallel-siaga-real", "guru-001-siaga");

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const DETAIL_URL = "https://siagapendis.kemenag.go.id/guru/absensi/detail/8860825";

function now() {
  return new Date().toISOString();
}

async function main() {
  console.log("SMARTWORK_SIAGA_JUNI_DETAIL_VERIFY_PREVIEW=START");
  console.log("RULE=VISIBLE_PREVIEW_VERIFY_ONLY_NO_INPUT_NO_SAVE_NO_DELETE");

  const log = [];
  const startedAt = now();

  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
    args: ["--start-maximized"]
  });

  const page = browser.pages()[0] || await browser.newPage();

  log.push(`[${now()}] OPEN=${DETAIL_URL}`);
  await page.goto(DETAIL_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3500);

  const title = await page.title().catch(() => "");
  const url = page.url();
  const bodyText = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");

  const screenshotPath = path.join(
    shotsDir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-siaga-juni-detail-verify-preview-real.png`
  );

  await page.screenshot({ path: screenshotPath, fullPage: true });

  const rows = [];
  for (let day = 1; day <= 30; day++) {
    const dayRegex = new RegExp(`(^|\\n|\\s)${day}\\s+`, "i");
    rows.push({
      tanggal: day,
      found: dayRegex.test(bodyText),
      hasUbahNear: new RegExp(`(^|\\n|\\s)${day}\\s+[\\s\\S]{0,120}Ubah`, "i").test(bodyText),
      hasTambahNear: new RegExp(`(^|\\n|\\s)${day}\\s+[\\s\\S]{0,120}Tambah`, "i").test(bodyText),
      hasHapusNear: new RegExp(`(^|\\n|\\s)${day}\\s+[\\s\\S]{0,120}hapus`, "i").test(bodyText)
    });
  }

  const mingguSkippedLikely = [7, 14, 21, 28].every((day) => {
    const r = rows.find((x) => x.tanggal === day);
    return r && r.hasTambahNear;
  });

  const filledLikely = rows.filter((r) => r.hasUbahNear || r.hasHapusNear).length;

  const report = {
    ok: true,
    mode: "siaga-juni-detail-verify-preview",
    rule: "VISIBLE_PREVIEW_VERIFY_ONLY_NO_INPUT_NO_SAVE_NO_DELETE",
    startedAt,
    endedAt: now(),
    title,
    url,
    screenshot: path.relative(root, screenshotPath).replaceAll("\\", "/"),
    summary: {
      totalTanggalFound: rows.filter((r) => r.found).length,
      filledLikely,
      mingguSkippedLikely,
      tambahCount: rows.filter((r) => r.hasTambahNear).length,
      ubahCount: rows.filter((r) => r.hasUbahNear).length,
      hapusCount: rows.filter((r) => r.hasHapusNear).length
    },
    rows,
    bodyPreview: bodyText.replace(/\s+/g, " ").slice(0, 2500),
    log
  };

  const reportPath = path.join(reportsDir, "siaga-juni-detail-verify-preview-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("SMARTWORK_SIAGA_JUNI_DETAIL_VERIFY_PREVIEW=DONE");
  console.log("REPORT=" + reportPath);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("Browser dibiarkan terbuka untuk cek manual. Tidak ada input/save/delete.");
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_JUNI_DETAIL_VERIFY_PREVIEW=FAILED");
  console.error(error.message);
  process.exit(1);
});
