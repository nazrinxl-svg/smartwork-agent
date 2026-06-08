import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportsDir, `${stamp}-siaga-set-sekolah-select2-value.json`);
const beforeShot = path.join(shotsDir, `${stamp}-01-before-set-sekolah-select2-value.png`);
const afterShot = path.join(shotsDir, `${stamp}-02-after-set-sekolah-select2-value-no-save.png`);

const TARGET_SCHOOL_VALUE = "16870";
const TARGET_SCHOOL_TEXT = "SDN 4 DWI TUNGGAL";

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
  console.log("SMARTWORK_MICRO_AGENT=SET_SEKOLAH_SELECT2_VALUE_ONLY");
  console.log("RULE=NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_CHANGE_BULAN_NO_CHANGE_TAHUN_NO_CHANGE_CUTI_NO_SAVE");

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
    throw new Error("STOP: Belum di form Tambah Absensi. Agent ini tidak login/dashboard/tambah ulang.");
  }

  await shot(context, page, beforeShot);

  const result = await page.evaluate(({ TARGET_SCHOOL_VALUE, TARGET_SCHOOL_TEXT }) => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    const sekolahSelect =
      document.querySelector('select[name="sekolah_id"]') ||
      document.querySelector("select.sekolah") ||
      Array.from(document.querySelectorAll("select")).find(s => {
        return Array.from(s.options || []).some(o => clean(o.textContent) === TARGET_SCHOOL_TEXT);
      });

    if (!sekolahSelect) {
      return {
        ok: false,
        step: "find_sekolah_select",
        reason: "select sekolah_id tidak ditemukan"
      };
    }

    const option =
      Array.from(sekolahSelect.options || []).find(o => String(o.value) === TARGET_SCHOOL_VALUE) ||
      Array.from(sekolahSelect.options || []).find(o => clean(o.textContent) === TARGET_SCHOOL_TEXT) ||
      Array.from(sekolahSelect.options || []).find(o => /SDN 4 DWI TUNGGAL/i.test(clean(o.textContent)));

    if (!option) {
      return {
        ok: false,
        step: "find_school_option",
        reason: "Option SDN 4 DWI TUNGGAL / value 16870 tidak ditemukan",
        options: Array.from(sekolahSelect.options || []).map(o => ({
          value: o.value,
          text: clean(o.textContent)
        }))
      };
    }

    sekolahSelect.focus();
    sekolahSelect.value = option.value;
    sekolahSelect.selectedIndex = Array.from(sekolahSelect.options).indexOf(option);

    sekolahSelect.dispatchEvent(new Event("input", { bubbles: true }));
    sekolahSelect.dispatchEvent(new Event("change", { bubbles: true }));

    let jqueryTriggered = false;

    try {
      if (window.jQuery) {
        window.jQuery(sekolahSelect).val(option.value).trigger("change");
        jqueryTriggered = true;
      }
    } catch (error) {
      jqueryTriggered = false;
    }

    const rendered =
      document.querySelector(".select2-selection__rendered") ||
      document.querySelector(".select2-container .select2-selection__rendered");

    return {
      ok: true,
      step: "set_sekolah_select2_value",
      value: sekolahSelect.value,
      selectedIndex: sekolahSelect.selectedIndex,
      selectedText: clean(sekolahSelect.options[sekolahSelect.selectedIndex]?.textContent || ""),
      jqueryTriggered,
      renderedText: rendered ? clean(rendered.innerText || rendered.textContent) : ""
    };
  }, { TARGET_SCHOOL_VALUE, TARGET_SCHOOL_TEXT });

  await page.waitForTimeout(1000);

  const verify = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    const sekolahSelect =
      document.querySelector('select[name="sekolah_id"]') ||
      document.querySelector("select.sekolah");

    const bulanSelect =
      document.querySelector('select[name="bulan"]') ||
      document.querySelector("select.bulan");

    const tahunSelect =
      document.querySelector('select[name="tahun"]') ||
      document.querySelector("select.tahun");

    const cutiChecked = document.querySelector('input[name="status_cuti"]:checked');

    const rendered =
      document.querySelector(".select2-selection__rendered") ||
      document.querySelector(".select2-container .select2-selection__rendered");

    return {
      sekolah: sekolahSelect ? {
        name: sekolahSelect.name || "",
        value: sekolahSelect.value || "",
        selectedText: clean(sekolahSelect.options[sekolahSelect.selectedIndex]?.textContent || "")
      } : null,
      bulan: bulanSelect ? {
        value: bulanSelect.value || "",
        selectedText: clean(bulanSelect.options[bulanSelect.selectedIndex]?.textContent || "")
      } : null,
      tahun: tahunSelect ? {
        value: tahunSelect.value || "",
        selectedText: clean(tahunSelect.options[tahunSelect.selectedIndex]?.textContent || "")
      } : null,
      statusCuti: cutiChecked ? {
        value: cutiChecked.value || "",
        id: cutiChecked.id || ""
      } : null,
      renderedText: rendered ? clean(rendered.innerText || rendered.textContent) : "",
      bodyPreview: clean(document.body.innerText || "").slice(0, 1500)
    };
  });

  await shot(context, page, afterShot);

  const ok =
    result.ok &&
    verify.sekolah &&
    verify.sekolah.value === TARGET_SCHOOL_VALUE &&
    /SDN 4 DWI TUNGGAL/i.test(verify.sekolah.selectedText) &&
    verify.bulan &&
    verify.bulan.value === "6" &&
    verify.tahun &&
    verify.tahun.value === "2026" &&
    verify.statusCuti &&
    verify.statusCuti.value === "0";

  const report = {
    agent: "SET_SEKOLAH_SELECT2_VALUE_ONLY",
    rule: "NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_CHANGE_BULAN_NO_CHANGE_TAHUN_NO_CHANGE_CUTI_NO_SAVE",
    url: currentUrl,
    target: {
      sekolahValue: TARGET_SCHOOL_VALUE,
      sekolahText: TARGET_SCHOOL_TEXT
    },
    result,
    verify,
    ok,
    screenshots: [beforeShot, afterShot],
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`REPORT=${reportPath}`);

  if (!ok) {
    console.log(JSON.stringify(report, null, 2));
    throw new Error("STOP: Sekolah belum terverifikasi lengkap. Simpan tidak diklik.");
  }

  console.log("SMARTWORK_SEKOLAH_SELECT2_VALUE=OK_SDN_4_DWI_TUNGGAL_NO_SAVE");
  console.log(JSON.stringify(verify, null, 2));
}

main().catch(error => {
  console.error("SMARTWORK_SEKOLAH_SELECT2_VALUE=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
