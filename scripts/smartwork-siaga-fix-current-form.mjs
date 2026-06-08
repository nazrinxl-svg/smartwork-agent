import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const allowedHost = "siagapendis.kemenag.go.id";

const TARGET_MONTH = "Juni";
const TARGET_YEAR = "2026";

const report = {
  id: `siaga-fix-current-form-${stamp}`,
  mode: "fix-current-form-no-save",
  safety: {
    noSave: true,
    noSubmit: true,
    noDelete: true,
    noSend: true
  },
  steps: [],
  screenshots: []
};

function step(name, status, note = "") {
  report.steps.push({ time: new Date().toISOString(), name, status, note });
  console.log(`${name}: ${status}${note ? " - " + note : ""}`);
}

function safeUrl(url) {
  try {
    return new URL(url).hostname === allowedHost;
  } catch {
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bodyText(page) {
  return await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
}

async function shot(context, page, name) {
  const file = path.join(shotsDir, `${stamp}-${name}.png`);
  try {
    await page.bringToFront().catch(() => {});
    await page.setViewportSize({ width: 1366, height: 768 }).catch(() => {});
    await wait(300);

    const session = await context.newCDPSession(page);
    const result = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false
    });

    fs.writeFileSync(file, Buffer.from(result.data, "base64"));
    report.screenshots.push(file);
    console.log(`SCREENSHOT=${file}`);
  } catch (error) {
    step(`screenshot_${name}`, "WARN", error.message);
  }
}

async function fillByLabel(page) {
  const result = await page.evaluate(({ TARGET_MONTH, TARGET_YEAR }) => {
    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    function visible(el) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 20 && r.height > 10 && s.display !== "none" && s.visibility !== "hidden";
    }

    function fire(el) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
      if (window.jQuery) {
        window.jQuery(el).trigger("input");
        window.jQuery(el).trigger("change");
        window.jQuery(el).trigger("blur");
      }
    }

    function findLabel(labelText) {
      const labels = Array.from(document.querySelectorAll("label, div, span, td, th, b, strong"));
      return labels.find((el) => {
        const t = clean(el.innerText || el.textContent);
        return t === labelText || t.includes(labelText);
      });
    }

    function findSelectNear(labelText) {
      const label = findLabel(labelText);
      const selects = Array.from(document.querySelectorAll("select")).filter(visible);

      if (!label) return null;

      const lr = label.getBoundingClientRect();

      const candidates = selects
        .map((select) => {
          const r = select.getBoundingClientRect();
          return {
            select,
            score:
              Math.abs((r.top + r.height / 2) - (lr.top + lr.height / 2)) +
              (r.left < lr.right ? 1000 : 0)
          };
        })
        .sort((a, b) => a.score - b.score);

      return candidates[0]?.select || null;
    }

    function choose(select, matcher) {
      if (!select) return { ok: false, reason: "select tidak ditemukan" };

      const options = Array.from(select.options || []);
      const option = options.find((o) => !o.disabled && matcher(clean(o.textContent), String(o.value || "")));

      if (!option) {
        return {
          ok: false,
          reason: "option tidak ditemukan",
          name: select.name || "",
          id: select.id || "",
          current: clean(select.options[select.selectedIndex]?.textContent || ""),
          options: options.map((o) => ({ value: o.value, text: clean(o.textContent) }))
        };
      }

      select.focus();
      select.value = option.value;
      select.selectedIndex = options.indexOf(option);
      fire(select);

      return {
        ok: true,
        name: select.name || "",
        id: select.id || "",
        value: option.value,
        text: clean(option.textContent)
      };
    }

    const sekolahSelect = findSelectNear("Sekolah");
    const bulanSelect = findSelectNear("Bulan");
    const tahunSelect = findSelectNear("Tahun");

    const sekolah = choose(sekolahSelect, (text, value) => {
      return value && !/Pilih|--|Select/i.test(text);
    });

    const bulan = choose(bulanSelect, (text, value) => {
      return text.toLowerCase() === TARGET_MONTH.toLowerCase() ||
        value === "6" ||
        value === "06" ||
        value.toLowerCase() === "juni";
    });

    const tahun = choose(tahunSelect, (text, value) => {
      return text === TARGET_YEAR || value === TARGET_YEAR;
    });

    let cuti = { ok: false, reason: "radio tidak ditemukan" };
    const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(visible);
    const labels = Array.from(document.querySelectorAll("label, span, div"));

    const noCutiLabel = labels.find((el) => /Tidak ada cuti/i.test(clean(el.innerText || el.textContent)));

    if (noCutiLabel) {
      const inside = noCutiLabel.querySelector('input[type="radio"]');
      if (inside) {
        inside.checked = true;
        fire(inside);
        cuti = { ok: true, method: "inside-label" };
      } else if (radios[0]) {
        radios[0].checked = true;
        fire(radios[0]);
        cuti = { ok: true, method: "first-radio" };
      }
    } else if (radios[0]) {
      radios[0].checked = true;
      fire(radios[0]);
      cuti = { ok: true, method: "fallback-first-radio" };
    }

    const after = Array.from(document.querySelectorAll("select")).filter(visible).map((s, i) => ({
      index: i,
      name: s.name || "",
      id: s.id || "",
      value: s.value || "",
      selected: clean(s.options[s.selectedIndex]?.textContent || "")
    }));

    return { sekolah, bulan, tahun, cuti, after };
  }, { TARGET_MONTH, TARGET_YEAR });

  step("pilih_sekolah", result.sekolah.ok ? "OK" : "FAILED", result.sekolah.ok ? result.sekolah.text : result.sekolah.reason);
  step("pilih_bulan", result.bulan.ok ? "OK" : "FAILED", result.bulan.ok ? result.bulan.text : result.bulan.reason);
  step("pilih_tahun", result.tahun.ok ? "OK" : "FAILED", result.tahun.ok ? result.tahun.text : result.tahun.reason);
  step("pilih_cuti", result.cuti.ok ? "OK" : "FAILED", result.cuti.method || result.cuti.reason);

  console.log("=== AFTER VALUE ===");
  result.after.forEach((s) => console.log(`SELECT[${s.index}] ${s.name || s.id}: ${s.selected} (${s.value})`));

  if (!result.sekolah.ok && result.sekolah.options) {
    console.log("OPTIONS_SEKOLAH=");
    result.sekolah.options.forEach((o) => console.log(`- value=${o.value} text=${o.text}`));
  }

  if (!result.bulan.ok && result.bulan.options) {
    console.log("OPTIONS_BULAN=");
    result.bulan.options.forEach((o) => console.log(`- value=${o.value} text=${o.text}`));
  }

  if (!result.tahun.ok && result.tahun.options) {
    console.log("OPTIONS_TAHUN=");
    result.tahun.options.forEach((o) => console.log(`- value=${o.value} text=${o.text}`));
  }

  report.fillResult = result;
  return Boolean(result.sekolah.ok && result.bulan.ok && result.tahun.ok && result.cuti.ok);
}

async function writeReport(page) {
  report.finalUrl = page.url();
  report.bodyPreview = (await bodyText(page)).slice(0, 1600);

  const jsonFile = path.join(reportsDir, `${stamp}-siaga-fix-current-form.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-fix-current-form.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdFile, [
    "# SIAGA Fix Current Form",
    "",
    `- Result: ${report.result}`,
    "- Simpan: tidak diklik",
    `- Target bulan: ${TARGET_MONTH}`,
    `- Target tahun: ${TARGET_YEAR}`,
    "",
    "## Steps",
    ...report.steps.map((s) => `- ${s.name}: ${s.status}${s.note ? " — " + s.note : ""}`),
    "",
    "## Screenshots",
    ...report.screenshots.map((s) => `- ${s}`),
    ""
  ].join("\n"), "utf8");

  console.log(`REPORT_JSON=${jsonFile}`);
  console.log(`REPORT_MD=${mdFile}`);
  console.log(`SMARTWORK_FIX_FORM=${report.result}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SIAGA FIX CURRENT FORM ===");
  console.log("Target: sekolah pertama, Juni, 2026, Tidak ada cuti");
  console.log("Safety: NO SAVE");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0];

  if (!page) throw new Error("Tab SIAGA tidak ditemukan.");

  await page.bringToFront().catch(() => {});
  await wait(700);

  const text = await bodyText(page);

  if (!/Sekolah|Bulan|Tahun|Status Cuti|Simpan/i.test(text)) {
    step("page_check", "STOP", "Form Tambah Absensi belum terlihat.");
    await shot(context, page, "01-not-form");
    report.result = "STOP_NOT_FORM";
    await writeReport(page);
    return;
  }

  step("page_check", "OK", "Form Tambah Absensi terlihat.");
  await shot(context, page, "01-before-fix");

  const ok = await fillByLabel(page);

  await wait(1000);
  await shot(context, page, "02-after-fix-no-save");

  report.result = ok ? "OK_FILLED_NO_SAVE" : "WARN_PARTIAL_NO_SAVE";
  await writeReport(page);
}

main().catch((error) => {
  console.error("SMARTWORK_FIX_FORM=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
