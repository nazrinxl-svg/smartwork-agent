import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const beforeShot = path.join(shotsDir, `${stamp}-01-before-save-absensi.png`);
const afterShot = path.join(shotsDir, `${stamp}-02-after-save-absensi.png`);
const reportPath = path.join(reportsDir, `${stamp}-siaga-cuti-tidak-ada-save.json`);

async function shot(context, page, file) {
  await page.bringToFront().catch(() => {});
  await page.setViewportSize({ width: 1366, height: 768 }).catch(() => {});
  await page.waitForTimeout(300);

  const session = await context.newCDPSession(page);
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false
  });

  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  console.log(`SCREENSHOT=${file}`);
}

async function main() {
  console.log("SMARTWORK_MICRO_AGENT=CUTI_TIDAK_ADA_DAN_SIMPAN");
  console.log("RULE=USER_ALLOWED_SAVE_ON_THIS_STEP");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("/guru/absensi/create")) ||
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id"));

  if (!page) throw new Error("STOP: Tab SIAGA tidak ditemukan.");

  await page.bringToFront();
  await page.waitForTimeout(700);

  const currentUrl = page.url();
  console.log(`CURRENT_URL=${currentUrl}`);

  if (!currentUrl.includes("/guru/absensi/create")) {
    throw new Error("STOP: Belum di form Tambah Absensi.");
  }

  const before = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    const sekolah = document.querySelector('select[name="sekolah_id"]') || document.querySelector("select.sekolah");
    const bulan = document.querySelector('select[name="bulan"]') || document.querySelector("select.bulan");
    const tahun = document.querySelector('select[name="tahun"]') || document.querySelector("select.tahun");
    const cuti0 = document.querySelector('input[name="status_cuti"][value="0"]') || document.querySelector("#status_cuti0");
    const cuti1 = document.querySelector('input[name="status_cuti"][value="1"]') || document.querySelector("#status_cuti1");

    if (cuti0) {
      cuti0.checked = true;
      cuti0.dispatchEvent(new Event("input", { bubbles: true }));
      cuti0.dispatchEvent(new Event("change", { bubbles: true }));
      cuti0.click();
    }

    return {
      sekolah: sekolah ? {
        value: sekolah.value || "",
        text: clean(sekolah.options[sekolah.selectedIndex]?.textContent || "")
      } : null,
      bulan: bulan ? {
        value: bulan.value || "",
        text: clean(bulan.options[bulan.selectedIndex]?.textContent || "")
      } : null,
      tahun: tahun ? {
        value: tahun.value || "",
        text: clean(tahun.options[tahun.selectedIndex]?.textContent || "")
      } : null,
      statusCuti0Checked: cuti0 ? cuti0.checked : false,
      statusCuti1Checked: cuti1 ? cuti1.checked : false,
      bodyPreview: clean(document.body.innerText || "").slice(0, 1200)
    };
  });

  await page.waitForTimeout(700);
  await shot(context, page, beforeShot);

  const valid =
    before.sekolah &&
    before.sekolah.value === "16870" &&
    /SDN 4 DWI TUNGGAL/i.test(before.sekolah.text) &&
    before.bulan &&
    before.bulan.value === "6" &&
    before.tahun &&
    before.tahun.value === "2026" &&
    before.statusCuti0Checked === true;

  if (!valid) {
    const report = {
      agent: "CUTI_TIDAK_ADA_DAN_SIMPAN",
      status: "STOP_BEFORE_SAVE_VALIDATION_FAILED",
      before,
      screenshots: [beforeShot],
      createdAt: new Date().toISOString()
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify(report, null, 2));
    throw new Error("STOP: Validasi field belum lengkap, Simpan tidak diklik.");
  }

  console.log("VALIDATION_BEFORE_SAVE=OK");
  console.log("STEP=CLICK_SIMPAN");

  const saveResult = await page.evaluate(async () => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    };

    const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a"))
      .filter(visible)
      .map(el => ({
        el,
        text: clean(el.innerText || el.value || el.textContent),
        type: el.getAttribute("type") || ""
      }));

    const simpan =
      buttons.find(b => /^simpan$/i.test(b.text)) ||
      buttons.find(b => /simpan/i.test(b.text)) ||
      buttons.find(b => b.type === "submit");

    if (!simpan) {
      return {
        ok: false,
        reason: "Tombol Simpan tidak ditemukan",
        buttons: buttons.map(b => ({ text: b.text, type: b.type }))
      };
    }

    simpan.el.click();
    await sleep(1500);

    return {
      ok: true,
      clickedText: simpan.text || simpan.type || "submit"
    };
  });

  await page.waitForTimeout(2500);
  await shot(context, page, afterShot);

  const after = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    return {
      url: location.href,
      bodyPreview: clean(document.body.innerText || "").slice(0, 1800),
      alerts: Array.from(document.querySelectorAll(".alert, .alert-danger, .alert-success, .alert-warning, [class*='alert']"))
        .map(el => clean(el.innerText || el.textContent))
        .filter(Boolean)
    };
  });

  const report = {
    agent: "CUTI_TIDAK_ADA_DAN_SIMPAN",
    rule: "USER_ALLOWED_SAVE_ON_THIS_STEP",
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
    throw new Error("Simpan gagal diklik.");
  }

  console.log("SMARTWORK_ABSENSI_SAVE_CLICKED=OK");
  console.log(JSON.stringify(after, null, 2));
}

main().catch(error => {
  console.error("SMARTWORK_ABSENSI_SAVE_CLICKED=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
