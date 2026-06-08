import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");

fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const beforeShot = path.join(shotsDir, `${stamp}-01-before-fill-jam-senin-1-no-save.png`);
const afterShot = path.join(shotsDir, `${stamp}-02-after-fill-jam-senin-1-no-save.png`);
const reportPath = path.join(reportsDir, `${stamp}-siaga-fill-jam-senin-1-no-save.json`);

function pad(num) {
  return String(num).padStart(2, "0");
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomTime(hour, minMinute, maxMinute) {
  return `${pad(hour)}:${pad(randomInt(minMinute, maxMinute))}`;
}

const TARGET = {
  tanggal: "2026-06-01",
  hari: "Senin",
  jamMasuk: randomTime(6, 50, 59),   // 06:50 - 06:59 aman, tidak lewat 07:00
  jamPulang: randomTime(14, 15, 30)  // 14:15 - 14:30
};

async function main() {
  console.log("SMARTWORK_AGENT=FILL_JAM_SENIN_1_NO_SAVE");
  console.log("RULE=NO_SAVE_NO_ZOOM_NO_VIEWPORT");
  console.log(`TARGET_TANGGAL=${TARGET.tanggal}`);
  console.log(`TARGET_HARI=${TARGET.hari}`);
  console.log(`TARGET_JAM_MASUK=${TARGET.jamMasuk}`);
  console.log(`TARGET_JAM_PULANG=${TARGET.jamPulang}`);

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

  await page.screenshot({ path: beforeShot, fullPage: false });
  console.log(`SCREENSHOT_BEFORE=${beforeShot}`);

  const result = await page.evaluate(({ TARGET }) => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    const jamMasuk =
      document.querySelector('input[name="jam_masuk"]') ||
      document.querySelector("#jam_masuk");

    const jamPulang =
      document.querySelector('input[name="jam_pulang"]') ||
      document.querySelector("#jam_pulang");

    const tanggal =
      document.querySelector('input[name="tanggal"]');

    if (!jamMasuk || !jamPulang) {
      return {
        ok: false,
        step: "find_inputs",
        reason: "Input jam_masuk / jam_pulang tidak ditemukan",
        inputs: Array.from(document.querySelectorAll("input")).map((i, index) => ({
          index,
          type: i.type || "",
          name: i.name || "",
          id: i.id || "",
          value: i.value || ""
        }))
      };
    }

    if (tanggal && tanggal.value !== TARGET.tanggal) {
      return {
        ok: false,
        step: "verify_tanggal",
        reason: `Tanggal form bukan ${TARGET.tanggal}`,
        tanggalValue: tanggal.value
      };
    }

    function setTime(input, value) {
      input.focus();
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.blur();
    }

    const before = {
      jamMasuk: jamMasuk.value || "",
      jamPulang: jamPulang.value || "",
      tanggal: tanggal ? tanggal.value : ""
    };

    setTime(jamMasuk, TARGET.jamMasuk);
    setTime(jamPulang, TARGET.jamPulang);

    const after = {
      jamMasuk: jamMasuk.value || "",
      jamPulang: jamPulang.value || "",
      tanggal: tanggal ? tanggal.value : "",
      bodyPreview: clean(document.body.innerText || "").slice(0, 1000)
    };

    const ok =
      after.jamMasuk === TARGET.jamMasuk &&
      after.jamPulang === TARGET.jamPulang;

    return {
      ok,
      step: "fill_time_done_no_save",
      before,
      after,
      target: TARGET
    };
  }, { TARGET });

  await page.waitForTimeout(800);

  await page.screenshot({ path: afterShot, fullPage: false });
  console.log(`SCREENSHOT_AFTER=${afterShot}`);

  const report = {
    agent: "FILL_JAM_SENIN_1_NO_SAVE",
    rule: "NO_SAVE_NO_ZOOM_NO_VIEWPORT",
    target: TARGET,
    url: currentUrl,
    result,
    screenshots: [beforeShot, afterShot],
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`REPORT=${reportPath}`);

  if (!result.ok) {
    console.log(JSON.stringify(report, null, 2));
    throw new Error("STOP: Jam belum terisi valid. Simpan tidak diklik.");
  }

  console.log("SMARTWORK_FILL_JAM_SENIN_1=OK_NO_SAVE");
  console.log(JSON.stringify(result.after, null, 2));
}

main().catch(error => {
  console.error("SMARTWORK_FILL_JAM_SENIN_1=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
