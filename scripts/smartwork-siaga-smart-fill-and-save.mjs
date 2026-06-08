import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportsDir, `${stamp}-siaga-smart-fill-and-save.json`);
const beforeShot = path.join(shotsDir, `${stamp}-01-before-smart-fill-save.png`);
const readyShot = path.join(shotsDir, `${stamp}-02-ready-before-save.png`);
const afterShot = path.join(shotsDir, `${stamp}-03-after-save-result.png`);

const TARGET = {
  sekolahValue: "16870",
  sekolahText: "SDN 4 DWI TUNGGAL",
  bulanValue: "6",
  bulanText: "Juni",
  tahunValue: "2026",
  tahunText: "2026",
  cutiValue: "0"
};

function clean(t) {
  return String(t || "").replace(/\s+/g, " ").trim();
}

async function main() {
  console.log("SMARTWORK_AGENT=SIAGA_SMART_FILL_AND_SAVE");
  console.log("RULE=FILL_MISSING_ONLY_THEN_SAVE_USER_ALLOWED");
  console.log("EXPECTED=SAVE_MAY_FAIL_DUPLICATE_DATA_ALREADY_EXISTS");

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
  await page.screenshot({ path: readyShot, fullPage: false });
  console.log(`SCREENSHOT_READY=${readyShot}`);

  if (!fillResult.ok) {
    const report = {
      agent: "SIAGA_SMART_FILL_AND_SAVE",
      status: "STOP_FILL_NOT_READY_SAVE_NOT_CLICKED",
      url: currentUrl,
      fillResult,
      screenshots: [beforeShot, readyShot],
      createdAt: new Date().toISOString()
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`REPORT=${reportPath}`);
    console.log(JSON.stringify(report, null, 2));
    throw new Error("STOP: Field belum lengkap, Simpan tidak diklik.");
  }

  console.log("READY_BEFORE_SAVE=OK");
  console.log("STEP=CLICK_SIMPAN");

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
        type: el.getAttribute("type") || ""
      }));

    const simpan =
      buttons.find(b => /^Simpan$/i.test(b.text)) ||
      buttons.find(b => /Simpan/i.test(b.text)) ||
      buttons.find(b => b.type === "submit");

    if (!simpan) {
      return {
        ok: false,
        reason: "Tombol Simpan tidak ditemukan",
        buttons: buttons.map(b => ({ text: b.text, type: b.type }))
      };
    }

    simpan.el.click();
    await sleep(2000);

    return {
      ok: true,
      clickedText: simpan.text || simpan.type || "submit"
    };
  });

  await page.waitForTimeout(2500);
  await page.screenshot({ path: afterShot, fullPage: false });
  console.log(`SCREENSHOT_AFTER_SAVE=${afterShot}`);

  const afterSave = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    const bodyText = clean(document.body.innerText || "");
    const alerts = Array.from(document.querySelectorAll(".alert, .alert-danger, .alert-success, .alert-warning, [class*='alert']"))
      .map(el => clean(el.innerText || el.textContent))
      .filter(Boolean);

    return {
      url: location.href,
      bodyPreview: bodyText.slice(0, 2000),
      alerts,
      duplicateDetected:
        /Data absensi di bulan, tahun dan sekolah ini sudah ada/i.test(bodyText) ||
        /sudah ada/i.test(bodyText)
    };
  });

  const report = {
    agent: "SIAGA_SMART_FILL_AND_SAVE",
    rule: "FILL_MISSING_ONLY_THEN_SAVE_USER_ALLOWED",
    expected: "SAVE_MAY_FAIL_DUPLICATE_DATA_ALREADY_EXISTS",
    urlBefore: currentUrl,
    fillResult,
    saveResult,
    afterSave,
    screenshots: [beforeShot, readyShot, afterShot],
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`REPORT=${reportPath}`);

  if (!saveResult.ok) {
    console.log(JSON.stringify(report, null, 2));
    throw new Error("Simpan gagal diklik.");
  }

  if (afterSave.duplicateDetected) {
    console.log("SMARTWORK_SAVE_RESULT=DUPLICATE_DATA_ALREADY_EXISTS_EXPECTED");
  } else {
    console.log("SMARTWORK_SAVE_RESULT=SAVE_CLICKED_CHECK_SCREENSHOT");
  }

  console.log("SMARTWORK_SMART_FILL_AND_SAVE=OK_SAVE_CLICKED");
  console.log(JSON.stringify(afterSave, null, 2));
}

main().catch(error => {
  console.error("SMARTWORK_SMART_FILL_AND_SAVE=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
