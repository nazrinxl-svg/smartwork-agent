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
  id: `siaga-fill-current-form-${stamp}`,
  mode: "current-form-only-no-save",
  safety: {
    noLogin: true,
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

async function debugSelects(page, title) {
  const data = await page.evaluate(() => {
    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    function visible(el) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 20 && r.height > 10 && s.display !== "none" && s.visibility !== "hidden";
    }

    return Array.from(document.querySelectorAll("select"))
      .filter(visible)
      .map((select, index) => ({
        index,
        name: select.name || "",
        id: select.id || "",
        value: select.value || "",
        selectedText: clean(select.options[select.selectedIndex]?.textContent || ""),
        options: Array.from(select.options || []).map((o, optionIndex) => ({
          optionIndex,
          value: o.value,
          text: clean(o.textContent),
          disabled: o.disabled
        }))
      }));
  });

  console.log(`=== ${title} ===`);
  data.forEach((s) => {
    console.log(`SELECT[${s.index}] name=${s.name} id=${s.id} selected="${s.selectedText}" value="${s.value}"`);
    s.options.forEach((o) => console.log(`  - [${o.optionIndex}] value="${o.value}" text="${o.text}" disabled=${o.disabled}`));
  });

  return data;
}

async function fillCurrentForm(page) {
  const result = await page.evaluate(({ TARGET_MONTH, TARGET_YEAR }) => {
    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    function visible(el) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 20 && r.height > 10 && s.display !== "none" && s.visibility !== "hidden";
    }

    function fireChange(select) {
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      select.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      if (window.jQuery) {
        window.jQuery(select).trigger("input");
        window.jQuery(select).trigger("change");
      }
    }

    const selects = Array.from(document.querySelectorAll("select")).filter(visible);

    const out = {
      selectCount: selects.length,
      school: { ok: false },
      month: { ok: false },
      year: { ok: false },
      cuti: { ok: false }
    };

    function choose(select, matcher) {
      if (!select) return null;

      const options = Array.from(select.options || []);
      const opt = options.find((o) => !o.disabled && matcher(clean(o.textContent), String(o.value || "")));

      if (!opt) return null;

      select.value = opt.value;
      select.selectedIndex = options.indexOf(opt);
      fireChange(select);

      return {
        value: opt.value,
        text: clean(opt.textContent),
        selectedIndex: select.selectedIndex,
        name: select.name || "",
        id: select.id || ""
      };
    }

    // Di form Tambah yang sedang tampil:
    // SELECT[0] = Sekolah
    // SELECT[1] = Bulan
    // SELECT[2] = Tahun
    const schoolSelected = choose(selects[0], (text, value) => {
      return value && !/Pilih|--|Select/i.test(text);
    });

    const monthSelected = choose(selects[1], (text, value) => {
      return text.toLowerCase() === TARGET_MONTH.toLowerCase() ||
        value === "6" ||
        value === "06" ||
        value.toLowerCase() === "juni";
    });

    const yearSelected = choose(selects[2], (text, value) => {
      return text === TARGET_YEAR || value === TARGET_YEAR;
    });

    out.school = schoolSelected ? { ok: true, ...schoolSelected } : {
      ok: false,
      reason: "Option sekolah valid tidak ditemukan",
      options: selects[0] ? Array.from(selects[0].options).map((o) => clean(o.textContent)) : []
    };

    out.month = monthSelected ? { ok: true, ...monthSelected } : {
      ok: false,
      reason: "Option Juni tidak ditemukan",
      options: selects[1] ? Array.from(selects[1].options).map((o) => clean(o.textContent)) : []
    };

    out.year = yearSelected ? { ok: true, ...yearSelected } : {
      ok: false,
      reason: "Option 2026 tidak ditemukan",
      options: selects[2] ? Array.from(selects[2].options).map((o) => clean(o.textContent)) : []
    };

    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));

    const noCutiRadio =
      radios.find((radio) => {
        const parentText = clean(radio.closest("label, div, span, p")?.innerText || "");
        return /Tidak ada cuti/i.test(parentText);
      }) ||
      radios[0];

    if (noCutiRadio) {
      noCutiRadio.checked = true;
      noCutiRadio.dispatchEvent(new Event("input", { bubbles: true }));
      noCutiRadio.dispatchEvent(new Event("change", { bubbles: true }));
      out.cuti = { ok: true, method: "radio" };
    }

    out.after = selects.map((s, i) => ({
      index: i,
      name: s.name || "",
      id: s.id || "",
      value: s.value || "",
      selectedText: clean(s.options[s.selectedIndex]?.textContent || "")
    }));

    return out;
  }, { TARGET_MONTH, TARGET_YEAR });

  step("select_count", result.selectCount >= 3 ? "OK" : "WARN", String(result.selectCount));
  step("pilih_sekolah", result.school.ok ? "OK" : "FAILED", result.school.ok ? result.school.text : result.school.reason);
  step("pilih_bulan", result.month.ok ? "OK" : "FAILED", result.month.ok ? result.month.text : result.month.reason);
  step("pilih_tahun", result.year.ok ? "OK" : "FAILED", result.year.ok ? result.year.text : result.year.reason);
  step("pilih_cuti", result.cuti.ok ? "OK" : "FAILED", "Tidak ada cuti");

  report.fillResult = result;

  if (!result.school.ok) {
    console.log("OPTIONS_SEKOLAH=");
    (result.school.options || []).forEach((o) => console.log(`- ${o}`));
  }

  if (!result.month.ok) {
    console.log("OPTIONS_BULAN=");
    (result.month.options || []).forEach((o) => console.log(`- ${o}`));
  }

  if (!result.year.ok) {
    console.log("OPTIONS_TAHUN=");
    (result.year.options || []).forEach((o) => console.log(`- ${o}`));
  }

  console.log("=== AFTER VALUE ===");
  result.after.forEach((s) => console.log(`SELECT[${s.index}] ${s.name || s.id} = ${s.selectedText} (${s.value})`));

  return Boolean(result.school.ok && result.month.ok && result.year.ok && result.cuti.ok);
}

async function writeReport(page) {
  report.finalUrl = page.url();
  report.bodyPreview = (await bodyText(page)).slice(0, 1800);

  const jsonFile = path.join(reportsDir, `${stamp}-siaga-fill-current-form.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-fill-current-form.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(mdFile, [
    "# SIAGA Fill Current Form",
    "",
    `- Result: ${report.result}`,
    "- Simpan: tidak diklik",
    `- Bulan target: ${TARGET_MONTH}`,
    `- Tahun target: ${TARGET_YEAR}`,
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
  console.log(`SMARTWORK_FILL_CURRENT=${report.result}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SIAGA FILL CURRENT FORM ONLY ===");
  console.log(`TARGET_MONTH=${TARGET_MONTH}`);
  console.log(`TARGET_YEAR=${TARGET_YEAR}`);
  console.log("Safety: NO SAVE");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0];

  if (!page) throw new Error("Tab SIAGA tidak ditemukan.");

  await page.bringToFront().catch(() => {});
  await wait(700);

  if (!safeUrl(page.url())) {
    throw new Error(`Domain tidak diizinkan: ${page.url()}`);
  }

  const text = await bodyText(page);

  if (/\/login/i.test(page.url()) || /Masukkan Nomor Akun|Masukan Kata Kunci/i.test(text.slice(0, 1200))) {
    step("page_check", "STOP", "Masih di login. Login dulu.");
    await shot(context, page, "01-login-stop");
    report.result = "STOP_LOGIN_REQUIRED";
    await writeReport(page);
    return;
  }

  if (!/Status Cuti|Simpan|Sekolah|Bulan|Tahun/i.test(text)) {
    step("page_check", "STOP", "Form Tambah Absensi belum terlihat. Buka form Tambah dulu.");
    await shot(context, page, "01-not-form");
    report.result = "STOP_NOT_FORM";
    await writeReport(page);
    return;
  }

  step("page_check", "OK", "Form saat ini terdeteksi.");
  await shot(context, page, "01-before-fill");

  await debugSelects(page, "BEFORE FILL");

  const ok = await fillCurrentForm(page);

  await wait(1000);
  await debugSelects(page, "AFTER FILL");
  await shot(context, page, "02-after-fill-no-save");

  if (ok) {
    step("final", "OK", "Form terisi. Tombol Simpan tidak diklik.");
    report.result = "OK_FILLED_NO_SAVE";
  } else {
    step("final", "WARN", "Form belum lengkap. Tombol Simpan tidak diklik.");
    report.result = "WARN_PARTIAL_NO_SAVE";
  }

  await writeReport(page);
}

main().catch((error) => {
  console.error("SMARTWORK_FILL_CURRENT=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
