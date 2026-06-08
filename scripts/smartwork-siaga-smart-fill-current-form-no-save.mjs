import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportsDir, `${stamp}-siaga-smart-fill-current-form-no-save.json`);
const beforeShot = path.join(shotsDir, `${stamp}-01-before-smart-fill-no-save.png`);
const afterShot = path.join(shotsDir, `${stamp}-02-after-smart-fill-no-save.png`);

const TARGET = {
  sekolahValue: "16870",
  sekolahText: "SDN 4 DWI TUNGGAL",
  bulanValue: "6",
  bulanText: "Juni",
  tahunValue: "2026",
  tahunText: "2026",
  cutiValue: "0"
};

async function main() {
  console.log("SMARTWORK_AGENT=SIAGA_SMART_FILL_CURRENT_FORM_NO_SAVE");
  console.log("RULE=FILL_MISSING_ONLY_NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_ZOOM_NO_VIEWPORT_NO_SAVE");

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

  await page.screenshot({ path: beforeShot, fullPage: false });
  console.log(`SCREENSHOT_BEFORE=${beforeShot}`);

  const fillResult = await page.evaluate(async ({ TARGET }) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    function fire(el) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));

      try {
        if (window.jQuery) {
          window.jQuery(el).trigger("change");
        }
      } catch {}
    }

    function selectState(select) {
      if (!select) return null;

      return {
        name: select.name || "",
        className: String(select.className || ""),
        value: select.value || "",
        selectedText: clean(select.options[select.selectedIndex]?.textContent || ""),
        selectedIndex: select.selectedIndex
      };
    }

    function setSelect(select, targetValue, targetRegex, label) {
      if (!select) {
        return { ok: false, label, reason: `${label} select tidak ditemukan` };
      }

      const before = selectState(select);
      const options = Array.from(select.options || []);
      const option =
        options.find(o => String(o.value) === String(targetValue)) ||
        options.find(o => targetRegex.test(clean(o.textContent)));

      if (!option) {
        return {
          ok: false,
          label,
          reason: `${label} option tidak ditemukan`,
          before,
          options: options.map(o => ({ value: o.value, text: clean(o.textContent) }))
        };
      }

      select.focus();
      select.value = option.value;
      select.selectedIndex = options.indexOf(option);
      fire(select);

      return { ok: true, label, before, after: selectState(select) };
    }

    const bodyText = clean(document.body.innerText || "");

    if (!/Sekolah/i.test(bodyText) || !/Bulan/i.test(bodyText) || !/Tahun/i.test(bodyText) || !/Status Cuti/i.test(bodyText) || !/Simpan/i.test(bodyText)) {
      return {
        ok: false,
        step: "form_check",
        reason: "Form Tambah Absensi belum terlihat",
        bodyPreview: bodyText.slice(0, 1200)
      };
    }

    const sekolahSelect =
      document.querySelector('select[name="sekolah_id"]') ||
      document.querySelector("select.sekolah");

    const bulanSelect =
      document.querySelector('select[name="bulan"]') ||
      document.querySelector("select.bulan");

    const tahunSelect =
      document.querySelector('select[name="tahun"]') ||
      document.querySelector("select.tahun");

    const cuti0 =
      document.querySelector('input[name="status_cuti"][value="0"]') ||
      document.querySelector("#status_cuti0");

    const cuti1 =
      document.querySelector('input[name="status_cuti"][value="1"]') ||
      document.querySelector("#status_cuti1");

    const before = {
      sekolah: selectState(sekolahSelect),
      bulan: selectState(bulanSelect),
      tahun: selectState(tahunSelect),
      cuti0Checked: cuti0 ? cuti0.checked : false,
      cuti1Checked: cuti1 ? cuti1.checked : false
    };

    const actions = [];

    if (!sekolahSelect || sekolahSelect.value !== TARGET.sekolahValue) {
      actions.push(setSelect(sekolahSelect, TARGET.sekolahValue, /SDN 4 DWI TUNGGAL/i, "sekolah"));
      await sleep(500);
    } else {
      actions.push({ ok: true, label: "sekolah", skipped: true, reason: "Sekolah sudah benar", state: selectState(sekolahSelect) });
    }

    if (!bulanSelect || bulanSelect.value !== TARGET.bulanValue) {
      actions.push(setSelect(bulanSelect, TARGET.bulanValue, /^Juni$/i, "bulan"));
      await sleep(500);
    } else {
      actions.push({ ok: true, label: "bulan", skipped: true, reason: "Bulan sudah Juni", state: selectState(bulanSelect) });
    }

    if (!tahunSelect || tahunSelect.value !== TARGET.tahunValue) {
      actions.push(setSelect(tahunSelect, TARGET.tahunValue, /^2026$/i, "tahun"));
      await sleep(500);
    } else {
      actions.push({ ok: true, label: "tahun", skipped: true, reason: "Tahun sudah 2026", state: selectState(tahunSelect) });
    }

    if (cuti0 && !cuti0.checked) {
      cuti0.checked = true;
      fire(cuti0);
      try { cuti0.click(); } catch {}
      actions.push({ ok: true, label: "status_cuti", action: "checked_tidak_ada_cuti" });
      await sleep(300);
    } else {
      actions.push({ ok: true, label: "status_cuti", skipped: true, reason: "Tidak ada cuti sudah terpilih" });
    }

    const after = {
      sekolah: selectState(sekolahSelect),
      bulan: selectState(bulanSelect),
      tahun: selectState(tahunSelect),
      cuti0Checked: cuti0 ? cuti0.checked : false,
      cuti1Checked: cuti1 ? cuti1.checked : false
    };

    const ok =
      after.sekolah &&
      after.sekolah.value === TARGET.sekolahValue &&
      /SDN 4 DWI TUNGGAL/i.test(after.sekolah.selectedText) &&
      after.bulan &&
      after.bulan.value === TARGET.bulanValue &&
      after.tahun &&
      after.tahun.value === TARGET.tahunValue &&
      after.cuti0Checked === true;

    return { ok, before, actions, after };
  }, { TARGET });

  await page.waitForTimeout(1000);
  await page.screenshot({ path: afterShot, fullPage: false });
  console.log(`SCREENSHOT_AFTER=${afterShot}`);

  const report = {
    agent: "SIAGA_SMART_FILL_CURRENT_FORM_NO_SAVE",
    rule: "FILL_MISSING_ONLY_NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_ZOOM_NO_VIEWPORT_NO_SAVE",
    url: currentUrl,
    target: TARGET,
    result: fillResult,
    screenshots: [beforeShot, afterShot],
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`REPORT=${reportPath}`);

  if (!fillResult.ok) {
    console.log(JSON.stringify(report, null, 2));
    throw new Error("STOP: Smart fill belum lengkap. Simpan tidak diklik.");
  }

  console.log("SMARTWORK_SMART_FILL_CURRENT_FORM=OK_READY_NO_SAVE");
  console.log(JSON.stringify(fillResult.after, null, 2));
}

main().catch(error => {
  console.error("SMARTWORK_SMART_FILL_CURRENT_FORM=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
