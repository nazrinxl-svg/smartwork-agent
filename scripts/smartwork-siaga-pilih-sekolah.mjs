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

const report = {
  id: `siaga-pilih-sekolah-${stamp}`,
  mode: "pilih-sekolah-only",
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

  report[title.replace(/\s+/g, "_").toLowerCase()] = data;
  return data;
}

async function pilihSekolah(page) {
  const result = await page.evaluate(() => {
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

    const selects = Array.from(document.querySelectorAll("select")).filter(visible);

    const schoolSelect =
      selects.find((s) => /sekolah|school/i.test(`${s.name || ""} ${s.id || ""}`)) ||
      selects.find((s) => Array.from(s.options || []).some((o) => /Pilih Sekolah|DWI TUNGGAL|SDN|SD N|SD NEGERI/i.test(clean(o.textContent)))) ||
      selects[0];

    if (!schoolSelect) {
      return { ok: false, reason: "Dropdown sekolah tidak ditemukan", selectCount: selects.length };
    }

    const options = Array.from(schoolSelect.options || []);

    const chosen =
      options.find((o) => !o.disabled && /DWI TUNGGAL|SDN 4|SD N 4|SD NEGERI 4/i.test(clean(o.textContent))) ||
      options.find((o) => !o.disabled && o.value && !/Pilih|--|Select/i.test(clean(o.textContent)));

    if (!chosen) {
      return {
        ok: false,
        reason: "Option sekolah valid tidak ditemukan",
        selectName: schoolSelect.name || "",
        selectId: schoolSelect.id || "",
        selectedText: clean(schoolSelect.options[schoolSelect.selectedIndex]?.textContent || ""),
        options: options.map((o) => ({
          value: o.value,
          text: clean(o.textContent),
          disabled: o.disabled
        }))
      };
    }

    schoolSelect.focus();
    schoolSelect.value = chosen.value;
    schoolSelect.selectedIndex = options.indexOf(chosen);
    fire(schoolSelect);

    return {
      ok: true,
      selectName: schoolSelect.name || "",
      selectId: schoolSelect.id || "",
      value: chosen.value,
      text: clean(chosen.textContent),
      selectedIndex: schoolSelect.selectedIndex
    };
  });

  if (result.ok) {
    step("pilih_sekolah_js", "OK", `${result.text} (${result.value})`);
    return result;
  }

  step("pilih_sekolah_js", "FAILED", result.reason);

  console.log("OPTIONS_SEKOLAH=");
  (result.options || []).forEach((o) => console.log(`- value="${o.value}" text="${o.text}" disabled=${o.disabled}`));

  return result;
}

async function fallbackKeyboardSekolah(page) {
  step("fallback_keyboard", "INFO", "Coba klik dropdown Sekolah lalu ArrowDown Enter.");

  const box = await page.evaluate(() => {
    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    function visible(el) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 20 && r.height > 10 && s.display !== "none" && s.visibility !== "hidden";
    }

    const selects = Array.from(document.querySelectorAll("select")).filter(visible);
    const schoolSelect =
      selects.find((s) => /sekolah|school/i.test(`${s.name || ""} ${s.id || ""}`)) ||
      selects.find((s) => Array.from(s.options || []).some((o) => /Pilih Sekolah|DWI TUNGGAL|SDN|SD N|SD NEGERI/i.test(clean(o.textContent)))) ||
      selects[0];

    if (!schoolSelect) return null;

    const r = schoolSelect.getBoundingClientRect();
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      w: r.width,
      h: r.height
    };
  });

  if (!box) {
    step("fallback_keyboard", "FAILED", "box dropdown sekolah tidak ditemukan");
    return false;
  }

  await page.mouse.move(box.x, box.y);
  await wait(250);
  await page.mouse.click(box.x, box.y);
  await wait(400);

  await page.keyboard.press("Home").catch(() => {});
  await wait(150);
  await page.keyboard.press("ArrowDown");
  await wait(250);
  await page.keyboard.press("Enter");
  await wait(900);

  step("fallback_keyboard", "OK", "ArrowDown + Enter dijalankan");
  return true;
}

async function writeReport(page) {
  report.finalUrl = page.url();
  report.bodyPreview = (await bodyText(page)).slice(0, 1500);

  const jsonFile = path.join(reportsDir, `${stamp}-siaga-pilih-sekolah.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-pilih-sekolah.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(mdFile, [
    "# SIAGA Pilih Sekolah",
    "",
    `- Result: ${report.result}`,
    "- Simpan: tidak diklik",
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
  console.log(`SMARTWORK_PILIH_SEKOLAH=${report.result}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SIAGA PILIH SEKOLAH ONLY ===");
  console.log("Target: pilih sekolah pertama/SDN 4 DWI TUNGGAL");
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
  await shot(context, page, "01-before-pilih-sekolah");

  await debugSelects(page, "BEFORE PILIH SEKOLAH");

  let result = await pilihSekolah(page);

  if (!result.ok) {
    await fallbackKeyboardSekolah(page);
  }

  await wait(1000);

  const after = await debugSelects(page, "AFTER PILIH SEKOLAH");
  await shot(context, page, "02-after-pilih-sekolah-no-save");

  const schoolSelected = after.some((s) => {
    return /sekolah|school/i.test(`${s.name} ${s.id}`) && !/Pilih Sekolah/i.test(s.selectedText);
  }) || after[0]?.selectedText && !/Pilih Sekolah/i.test(after[0].selectedText);

  if (schoolSelected) {
    step("final", "OK", "Sekolah sudah terpilih. Tombol Simpan tidak diklik.");
    report.result = "OK_SEKOLAH_SELECTED_NO_SAVE";
  } else {
    step("final", "WARN", "Sekolah belum terlihat terpilih. Tombol Simpan tidak diklik.");
    report.result = "WARN_SEKOLAH_NOT_SELECTED_NO_SAVE";
  }

  await writeReport(page);
}

main().catch((error) => {
  console.error("SMARTWORK_PILIH_SEKOLAH=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
