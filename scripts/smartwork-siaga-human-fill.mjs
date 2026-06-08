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
  id: `siaga-human-fill-${stamp}`,
  mode: "human-like-keyboard-no-save",
  safety: {
    noSave: true,
    noSubmit: true,
    noDelete: true
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

async function findControlBox(page, labelText) {
  return await page.evaluate((labelText) => {
    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    function visible(el) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 20 && r.height > 10 && s.display !== "none" && s.visibility !== "hidden";
    }

    const labels = Array.from(document.querySelectorAll("label, div, span, td, th"));
    const label = labels.find((el) => {
      const t = clean(el.innerText || el.textContent);
      return t === labelText || t.includes(labelText);
    });

    const controls = Array.from(document.querySelectorAll("select, input, .select2-selection, .select2-container"))
      .filter(visible);

    if (!label) {
      const fallback = controls[0];
      if (!fallback) return null;
      const r = fallback.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, tag: fallback.tagName, fallback: true };
    }

    const lr = label.getBoundingClientRect();

    const candidates = controls
      .map((el) => {
        const r = el.getBoundingClientRect();
        const sameRow = Math.abs((r.top + r.height / 2) - (lr.top + lr.height / 2));
        const rightSide = r.left > lr.left ? 0 : 9999;
        return {
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          w: r.width,
          h: r.height,
          top: r.top,
          left: r.left,
          tag: el.tagName,
          score: sameRow + rightSide
        };
      })
      .sort((a, b) => a.score - b.score);

    return candidates[0] || null;
  }, labelText);
}

async function clickControlByLabel(page, label) {
  const box = await findControlBox(page, label);

  if (!box) {
    step(`find_${label}`, "FAILED", "control tidak ditemukan");
    return false;
  }

  await page.mouse.move(box.x, box.y);
  await wait(250);
  await page.mouse.click(box.x, box.y);
  await wait(500);

  step(`click_${label}`, "OK", `x=${Math.round(box.x)}, y=${Math.round(box.y)}, tag=${box.tag}`);
  return true;
}

async function selectFirstSchool(page) {
  const ok = await clickControlByLabel(page, "Sekolah");
  if (!ok) return false;

  // Dari placeholder "Pilih Sekolah", pilih option pertama yang tersedia.
  await page.keyboard.press("Home").catch(() => {});
  await wait(150);
  await page.keyboard.press("ArrowDown");
  await wait(250);
  await page.keyboard.press("Enter");
  await wait(900);

  step("pilih_sekolah_keyboard", "OK", "ArrowDown + Enter");
  return true;
}

async function selectJuni(page) {
  const ok = await clickControlByLabel(page, "Bulan");
  if (!ok) return false;

  // Opsi bulan: Pilih Bulan, Januari, Februari, Maret, April, Mei, Juni
  await page.keyboard.press("Home").catch(() => {});
  await wait(150);

  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("ArrowDown");
    await wait(120);
  }

  await page.keyboard.press("Enter");
  await wait(900);

  step("pilih_bulan_keyboard", "OK", "Juni = ArrowDown 6x + Enter");
  return true;
}

async function selectTahun2026(page) {
  const ok = await clickControlByLabel(page, "Tahun");
  if (!ok) return false;

  // Dari screenshot: Pilih Tahun, 2022, 2023, 2024, 2025, 2026
  await page.keyboard.press("Home").catch(() => {});
  await wait(150);

  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("ArrowDown");
    await wait(120);
  }

  await page.keyboard.press("Enter");
  await wait(900);

  step("pilih_tahun_keyboard", "OK", "2026 = ArrowDown 5x + Enter");
  return true;
}

async function chooseNoCuti(page) {
  const clicked = await page.evaluate(() => {
    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    const all = Array.from(document.querySelectorAll("label, span, div"));
    const label = all.find((el) => /Tidak ada cuti/i.test(clean(el.innerText || el.textContent)));
    if (!label) return null;

    const radio = label.querySelector('input[type="radio"]');
    if (radio) {
      const r = radio.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, method: "radio-inside" };
    }

    const r = label.getBoundingClientRect();
    return { x: r.left + 10, y: r.top + r.height / 2, method: "label" };
  });

  if (!clicked) {
    step("pilih_cuti", "WARN", "Tidak ada cuti tidak ditemukan");
    return false;
  }

  await page.mouse.move(clicked.x, clicked.y);
  await wait(200);
  await page.mouse.click(clicked.x, clicked.y);
  await wait(400);

  step("pilih_cuti", "OK", clicked.method);
  return true;
}

async function readVisibleValues(page) {
  return await page.evaluate(() => {
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
      .map((s, i) => ({
        index: i,
        name: s.name || "",
        id: s.id || "",
        value: s.value || "",
        selected: clean(s.options[s.selectedIndex]?.textContent || "")
      }));
  });
}

async function writeReport(page) {
  const jsonFile = path.join(reportsDir, `${stamp}-siaga-human-fill.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-human-fill.md`);

  report.finalUrl = page.url();
  report.valuesAfter = await readVisibleValues(page);
  report.bodyPreview = (await bodyText(page)).slice(0, 1200);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(mdFile, [
    "# SIAGA Human Fill",
    "",
    `- Result: ${report.result}`,
    "- Simpan: tidak diklik",
    "",
    "## Steps",
    ...report.steps.map((s) => `- ${s.name}: ${s.status}${s.note ? " — " + s.note : ""}`),
    "",
    "## Values After",
    ...report.valuesAfter.map((v) => `- SELECT[${v.index}] ${v.name || v.id}: ${v.selected} (${v.value})`),
    "",
    "## Screenshots",
    ...report.screenshots.map((s) => `- ${s}`),
    ""
  ].join("\n"), "utf8");

  console.log("=== VALUES AFTER ===");
  report.valuesAfter.forEach((v) => console.log(`SELECT[${v.index}] ${v.name || v.id}: ${v.selected} (${v.value})`));

  console.log(`REPORT_JSON=${jsonFile}`);
  console.log(`REPORT_MD=${mdFile}`);
  console.log(`SMARTWORK_HUMAN_FILL=${report.result}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SIAGA HUMAN-LIKE FILL CURRENT FORM ===");
  console.log("Target: Sekolah pertama, Juni, 2026, Tidak ada cuti");
  console.log("Safety: NO SAVE");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0];

  if (!page) throw new Error("Tab SIAGA tidak ditemukan.");

  await page.bringToFront().catch(() => {});
  await wait(700);

  const text = await bodyText(page);

  if (!/Sekolah|Bulan|Tahun|Status Cuti|Simpan/i.test(text)) {
    step("page_check", "STOP", "Form Tambah Absensi belum terbuka.");
    await shot(context, page, "01-not-form");
    report.result = "STOP_NOT_FORM";
    await writeReport(page);
    return;
  }

  step("page_check", "OK", "Form Tambah Absensi terlihat.");
  await shot(context, page, "01-before-human-fill");

  const schoolOk = await selectFirstSchool(page);
  const monthOk = await selectJuni(page);
  const yearOk = await selectTahun2026(page);
  const cutiOk = await chooseNoCuti(page);

  await wait(1000);
  await shot(context, page, "02-after-human-fill-no-save");

  report.result = schoolOk && monthOk && yearOk && cutiOk
    ? "DONE_CHECK_BROWSER_NO_SAVE"
    : "WARN_CHECK_BROWSER_NO_SAVE";

  await writeReport(page);
}

main().catch((error) => {
  console.error("SMARTWORK_HUMAN_FILL=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
