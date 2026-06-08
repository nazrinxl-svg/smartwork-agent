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

// FIXED TEXT, bukan otomatis dari tanggal komputer.
const TARGET_MONTH = "Juni";

const report = {
  id: `siaga-bulan-fixed-text-${stamp}`,
  mode: "bulan-fixed-text-no-save",
  target: {
    bulan: TARGET_MONTH
  },
  safety: {
    noAutoCurrentMonth: true,
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

async function selectBulanByText(page) {
  const result = await page.evaluate(({ TARGET_MONTH }) => {
    function clean(text) {
      return String(text || "").replace(/\s+/g, " ").trim();
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
        window.jQuery(el).val(el.value).trigger("input").trigger("change").trigger("blur");
      }
    }

    const selects = Array.from(document.querySelectorAll("select")).filter(visible);

    const bulanSelect =
      selects.find((select) => /bulan|month/i.test(`${select.name || ""} ${select.id || ""}`)) ||
      selects.find((select) =>
        Array.from(select.options || []).some((option) => clean(option.textContent) === TARGET_MONTH)
      );

    if (!bulanSelect) {
      return {
        ok: false,
        reason: "Dropdown bulan tidak ditemukan",
        selectCount: selects.length
      };
    }

    const options = Array.from(bulanSelect.options || []);
    const optionBulan = options.find((option) => clean(option.textContent) === TARGET_MONTH);

    if (!optionBulan) {
      return {
        ok: false,
        reason: `Option teks ${TARGET_MONTH} tidak ditemukan`,
        selectName: bulanSelect.name || "",
        selectId: bulanSelect.id || "",
        options: options.map((option) => ({
          value: option.value,
          text: clean(option.textContent)
        }))
      };
    }

    bulanSelect.focus();
    bulanSelect.value = optionBulan.value;
    bulanSelect.selectedIndex = options.indexOf(optionBulan);
    fire(bulanSelect);

    return {
      ok: true,
      selectName: bulanSelect.name || "",
      selectId: bulanSelect.id || "",
      value: optionBulan.value,
      text: clean(optionBulan.textContent),
      selectedIndex: bulanSelect.selectedIndex
    };
  }, { TARGET_MONTH });

  step(
    "select_bulan_by_text",
    result.ok ? "OK" : "FAILED",
    result.ok ? `${result.text} (${result.value})` : result.reason
  );

  if (!result.ok && result.options) {
    console.log("OPTIONS_BULAN=");
    result.options.forEach((o) => console.log(`- value="${o.value}" text="${o.text}"`));
  }

  report.resultDetail = result;
  return result;
}

async function readBulan(page) {
  return await page.evaluate(({ TARGET_MONTH }) => {
    function clean(text) {
      return String(text || "").replace(/\s+/g, " ").trim();
    }

    function visible(el) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 20 && r.height > 10 && s.display !== "none" && s.visibility !== "hidden";
    }

    const selects = Array.from(document.querySelectorAll("select")).filter(visible);

    const bulanSelect =
      selects.find((select) => /bulan|month/i.test(`${select.name || ""} ${select.id || ""}`)) ||
      selects.find((select) =>
        Array.from(select.options || []).some((option) => clean(option.textContent) === TARGET_MONTH)
      );

    if (!bulanSelect) return null;

    return {
      name: bulanSelect.name || "",
      id: bulanSelect.id || "",
      value: bulanSelect.value || "",
      selectedText: clean(bulanSelect.options[bulanSelect.selectedIndex]?.textContent || "")
    };
  }, { TARGET_MONTH });
}

async function writeReport(page) {
  report.finalUrl = page.url();
  report.bodyPreview = (await bodyText(page)).slice(0, 1400);

  const jsonFile = path.join(reportsDir, `${stamp}-siaga-bulan-fixed-text.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-bulan-fixed-text.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdFile, [
    "# SIAGA Bulan Fixed Text",
    "",
    `- Result: ${report.result}`,
    `- Target bulan: ${TARGET_MONTH}`,
    "- Mode: pilih berdasarkan teks option, bukan otomatis tanggal komputer",
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
  console.log(`SMARTWORK_BULAN_FIXED_TEXT=${report.result}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SIAGA BULAN FIXED TEXT ===");
  console.log(`Target: option text = ${TARGET_MONTH}`);
  console.log("Mode: bukan otomatis bulan sekarang");
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
  await shot(context, page, "01-before-bulan-fixed-text");

  await selectBulanByText(page);
  await wait(500);

  const bulan = await readBulan(page);
  await shot(context, page, "02-after-bulan-fixed-text-no-save");

  if (bulan && bulan.selectedText === TARGET_MONTH) {
    step("final", "OK", `Bulan sudah ${TARGET_MONTH}. Simpan tidak diklik.`);
    report.result = "OK_BULAN_FIXED_TEXT_NO_SAVE";
  } else {
    step("final", "WARN", `Bulan belum ${TARGET_MONTH}. Sekarang: ${bulan ? bulan.selectedText : "tidak terbaca"}`);
    report.result = "WARN_BULAN_FIXED_TEXT_NO_SAVE";
  }

  await writeReport(page);
}

main().catch((error) => {
  console.error("SMARTWORK_BULAN_FIXED_TEXT=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
