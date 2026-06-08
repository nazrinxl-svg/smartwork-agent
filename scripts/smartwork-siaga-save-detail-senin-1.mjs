import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");

fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const beforeShot = path.join(shotsDir, `${stamp}-01-before-save-detail-senin-1.png`);
const afterShot = path.join(shotsDir, `${stamp}-02-after-save-detail-senin-1.png`);
const reportPath = path.join(reportsDir, `${stamp}-siaga-save-detail-senin-1.json`);

const TARGET = {
  tanggal: "2026-06-01"
};

async function main() {
  console.log("SMARTWORK_AGENT=SAVE_DETAIL_ABSENSI_SENIN_1");
  console.log("RULE=USER_ALLOWED_SAVE_NO_ZOOM_NO_VIEWPORT_NO_CHANGE_JAM");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("/guru/absensi/detail")) ||
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id"));

  if (!page) throw new Error("STOP: Tab SIAGA tidak ditemukan.");

  await page.bringToFront();
  await page.waitForTimeout(700);

  const currentUrl = page.url();
  console.log(`CURRENT_URL=${currentUrl}`);

  if (!currentUrl.includes("/guru/absensi/detail") || !currentUrl.includes("/2026-06-01/create")) {
    throw new Error("STOP: Belum berada di form input jam tanggal 2026-06-01.");
  }

  const before = await page.evaluate(({ TARGET }) => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    const jamMasuk =
      document.querySelector('input[name="jam_masuk"]') ||
      document.querySelector("#jam_masuk");

    const jamPulang =
      document.querySelector('input[name="jam_pulang"]') ||
      document.querySelector("#jam_pulang");

    const tanggal =
      document.querySelector('input[name="tanggal"]');

    return {
      tanggal: tanggal ? tanggal.value : "",
      jamMasuk: jamMasuk ? jamMasuk.value : "",
      jamPulang: jamPulang ? jamPulang.value : "",
      bodyPreview: clean(document.body.innerText || "").slice(0, 1000)
    };
  }, { TARGET });

  console.log("BEFORE_SAVE=" + JSON.stringify(before, null, 2));

  if (before.tanggal !== TARGET.tanggal) {
    throw new Error(`STOP: Tanggal bukan ${TARGET.tanggal}.`);
  }

  if (!before.jamMasuk || !before.jamPulang) {
    throw new Error("STOP: Jam Masuk/Jam Pulang belum lengkap. Simpan tidak diklik.");
  }

  await page.screenshot({ path: beforeShot, fullPage: false });
  console.log(`SCREENSHOT_BEFORE=${beforeShot}`);

  const saveResult = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    function visible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    }

    const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a"))
      .filter(visible)
      .map(el => ({
        el,
        text: clean(el.innerText || el.value || el.textContent),
        type: el.getAttribute("type") || "",
        className: String(el.className || "")
      }));

    const submit =
      buttons.find(b => /Simpan Detail Absensi/i.test(b.text)) ||
      buttons.find(b => /Simpan/i.test(b.text)) ||
      buttons.find(b => b.type === "submit");

    if (!submit) {
      return {
        ok: false,
        reason: "Tombol Simpan Detail Absensi tidak ditemukan",
        buttons: buttons.map(b => ({
          text: b.text,
          type: b.type,
          className: b.className
        }))
      };
    }

    submit.el.scrollIntoView({ block: "center", inline: "center" });
    await sleep(300);
    submit.el.click();
    await sleep(1800);

    return {
      ok: true,
      clickedText: submit.text || submit.type || "submit"
    };
  });

  await page.waitForTimeout(2500);

  const after = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    const bodyText = clean(document.body.innerText || "");
    const alerts = Array.from(document.querySelectorAll(".alert, .alert-danger, .alert-success, .alert-warning, [class*='alert']"))
      .map(el => clean(el.innerText || el.textContent))
      .filter(Boolean);

    return {
      url: location.href,
      bodyPreview: bodyText.slice(0, 1800),
      alerts,
      successDetected: /berhasil|sukses|success/i.test(bodyText),
      duplicateDetected: /sudah ada/i.test(bodyText),
      backToDetailList: /Detail Absensi/i.test(bodyText) && /Jam Masuk/i.test(bodyText) && /Jam Pulang/i.test(bodyText)
    };
  });

  await page.screenshot({ path: afterShot, fullPage: false });
  console.log(`SCREENSHOT_AFTER=${afterShot}`);

  const report = {
    agent: "SAVE_DETAIL_ABSENSI_SENIN_1",
    rule: "USER_ALLOWED_SAVE_NO_ZOOM_NO_VIEWPORT_NO_CHANGE_JAM",
    before,
    saveResult,
    after,
    screenshots: [beforeShot, afterShot],
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`REPORT=${reportPath}`);

  if (!saveResult.ok) {
    console.log(JSON.stringify(report, null, 2));
    throw new Error("Simpan Detail Absensi gagal diklik.");
  }

  console.log("SMARTWORK_SAVE_DETAIL_SENIN_1=OK_CLICKED_SAVE");
  console.log(JSON.stringify(after, null, 2));
}

main().catch(error => {
  console.error("SMARTWORK_SAVE_DETAIL_SENIN_1=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
