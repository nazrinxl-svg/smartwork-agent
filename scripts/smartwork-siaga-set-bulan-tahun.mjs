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
  id: `siaga-set-bulan-tahun-${stamp}`,
  mode: "set-bulan-tahun-only-no-save",
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

  return data;
}

async function setByLabel(page, labelText, targetText) {
  const result = await page.evaluate(({ labelText, targetText }) => {
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

    const labels = Array.from(document.querySelectorAll("label, div, span, td, th, b, strong"));
    const label = labels.find((el) => {
      const text = clean(el.innerText || el.textContent);
      return text === labelText || text.includes(labelText);
    });

    const selects = Array.from(document.querySelectorAll("select")).filter(visible);

    if (!label) {
      return { ok: false, reason: `Label ${labelText} tidak ditemukan` };
    }

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

    const select = candidates[0]?.select;

    if (!select) {
      return { ok: false, reason: `Dropdown dekat ${labelText} tidak ditemukan` };
    }

    const options = Array.from(select.options || []);
    const option = options.find((o) => clean(o.textContent).toLowerCase() === targetText.toLowerCase());

    if (!option) {
      return {
        ok: false,
        reason: `Option ${targetText} tidak ditemukan`,
        selectName: select.name || "",
        selectId: select.id || "",
        options: options.map((o) => ({ value: o.value, text: clean(o.textContent) }))
      };
    }

    select.focus();
    select.value = option.value;
    select.selectedIndex = options.indexOf(option);
    fire(select);

    return {
      ok: true,
      labelText,
      targetText,
      selectName: select.name || "",
      selectId: select.id || "",
      value: option.value,
      text: clean(option.textContent),
      selectedIndex: select.selectedIndex
    };
  }, { labelText, targetText });

  step(`set_${labelText}`, result.ok ? "OK" : "FAILED", result.ok ? `${result.text} (${result.value})` : result.reason);

  if (!result.ok && result.options) {
    console.log(`OPTIONS_${labelText}=`);
    result.options.forEach((o) => console.log(`- value="${o.value}" text="${o.text}"`));
  }

  return result;
}

async function fallbackKeyboard(page, labelText, arrowDownCount, expectedText) {
  step(`fallback_${labelText}`, "INFO", `Keyboard mode: Home + ArrowDown ${arrowDownCount}x + Enter`);

  const box = await page.evaluate((labelText) => {
    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    function visible(el) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 20 && r.height > 10 && s.display !== "none" && s.visibility !== "hidden";
    }

    const labels = Array.from(document.querySelectorAll("label, div, span, td, th, b, strong"));
    const label = labels.find((el) => {
      const text = clean(el.innerText || el.textContent);
      return text === labelText || text.includes(labelText);
    });

    const selects = Array.from(document.querySelectorAll("select")).filter(visible);
    if (!label) return null;

    const lr = label.getBoundingClientRect();

    const target = selects
      .map((select) => {
        const r = select.getBoundingClientRect();
        return {
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          w: r.width,
          h: r.height,
          score: Math.abs((r.top + r.height / 2) - (lr.top + lr.height / 2)) + (r.left < lr.right ? 1000 : 0)
        };
      })
      .sort((a, b) => a.score - b.score)[0];

    return target || null;
  }, labelText);

  if (!box) {
    step(`fallback_${labelText}`, "FAILED", "Box dropdown tidak ditemukan");
    return false;
  }

  await page.mouse.move(box.x, box.y);
  await wait(250);
  await page.mouse.click(box.x, box.y);
  await wait(300);

  await page.keyboard.press("Home").catch(() => {});
  await wait(150);

  for (let i = 0; i < arrowDownCount; i++) {
    await page.keyboard.press("ArrowDown");
    await wait(120);
  }

  await page.keyboard.press("Enter");
  await wait(800);

  step(`fallback_${labelText}`, "OK", expectedText);
  return true;
}

async function writeReport(page) {
  report.finalUrl = page.url();
  report.bodyPreview = (await bodyText(page)).slice(0, 1500);

  const jsonFile = path.join(reportsDir, `${stamp}-siaga-set-bulan-tahun.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-set-bulan-tahun.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(mdFile, [
    "# SIAGA Set Bulan Tahun",
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
  console.log(`SMARTWORK_SET_BULAN_TAHUN=${report.result}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SIAGA SET BULAN TAHUN ONLY ===");
  console.log("Target: Bulan Juni, Tahun 2026");
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
  await shot(context, page, "01-before-set-bulan-tahun");

  await debugSelects(page, "BEFORE SET");

  let bulan = await setByLabel(page, "Bulan", TARGET_MONTH);
  if (!bulan.ok) {
    // Pilih Bulan, Januari, Februari, Maret, April, Mei, Juni = ArrowDown 6x
    await fallbackKeyboard(page, "Bulan", 6, TARGET_MONTH);
  }

  await wait(500);

  let tahun = await setByLabel(page, "Tahun", TARGET_YEAR);
  if (!tahun.ok) {
    // Pilih Tahun, 2022, 2023, 2024, 2025, 2026 = ArrowDown 5x
    await fallbackKeyboard(page, "Tahun", 5, TARGET_YEAR);
  }

  await wait(800);

  const after = await debugSelects(page, "AFTER SET");
  await shot(context, page, "02-after-set-bulan-tahun-no-save");

  const monthOk = after.some((s) => s.selectedText === TARGET_MONTH);
  const yearOk = after.some((s) => s.selectedText === TARGET_YEAR);

  if (monthOk && yearOk) {
    step("final", "OK", "Bulan Juni dan Tahun 2026 sudah terpilih. Simpan tidak diklik.");
    report.result = "OK_BULAN_TAHUN_SELECTED_NO_SAVE";
  } else {
    step("final", "WARN", `monthOk=${monthOk}, yearOk=${yearOk}. Simpan tidak diklik.`);
    report.result = "WARN_BULAN_TAHUN_NOT_MATCH_NO_SAVE";
  }

  await writeReport(page);
}

main().catch((error) => {
  console.error("SMARTWORK_SET_BULAN_TAHUN=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
