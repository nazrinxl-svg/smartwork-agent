import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");

fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const shotPath = path.join(shotsDir, `${stamp}-diagnose-detail-jam-form.png`);
const reportPath = path.join(reportsDir, `${stamp}-diagnose-detail-jam-form.json`);

async function main() {
  console.log("SMARTWORK_DIAGNOSE=DETAIL_ABSENSI_JAM_FORM");
  console.log("RULE=NO_INPUT_NO_SAVE_NO_ZOOM_NO_VIEWPORT");

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

  if (!currentUrl.includes("/guru/absensi/detail")) {
    throw new Error("STOP: Belum berada di halaman Detail Absensi/Jam.");
  }

  await page.screenshot({ path: shotPath, fullPage: false });
  console.log(`SCREENSHOT=${shotPath}`);

  const data = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    function visible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    }

    const inputs = Array.from(document.querySelectorAll("input")).map((el, index) => {
      const r = el.getBoundingClientRect();
      return {
        index,
        visible: visible(el),
        type: el.type || "",
        name: el.name || "",
        id: el.id || "",
        className: String(el.className || ""),
        value: el.value || "",
        placeholder: el.placeholder || "",
        autocomplete: el.autocomplete || "",
        min: el.min || "",
        max: el.max || "",
        step: el.step || "",
        rect: { x: r.x, y: r.y, w: r.width, h: r.height }
      };
    });

    const labels = Array.from(document.querySelectorAll("label, div, span, p, td, th"))
      .filter(visible)
      .map((el, index) => ({
        index,
        tag: el.tagName,
        className: String(el.className || ""),
        text: clean(el.innerText || el.textContent)
      }))
      .filter(x => /Jam Masuk|Jam Pulang|Simpan Detail Absensi|Tanggal|Detail Absensi/i.test(x.text))
      .slice(0, 80);

    const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a"))
      .filter(visible)
      .map((el, index) => ({
        index,
        tag: el.tagName,
        type: el.getAttribute("type") || "",
        text: clean(el.innerText || el.value || el.textContent),
        href: el.getAttribute("href") || "",
        className: String(el.className || "")
      }))
      .slice(0, 80);

    const possiblePickers = Array.from(document.querySelectorAll(
      "[class*='time'], [class*='picker'], [class*='clock'], .bootstrap-timepicker, .timepicker, .datetimepicker, .ui-timepicker"
    )).map((el, index) => {
      const r = el.getBoundingClientRect();
      return {
        index,
        tag: el.tagName,
        visible: visible(el),
        className: String(el.className || ""),
        id: el.id || "",
        text: clean(el.innerText || el.textContent),
        rect: { x: r.x, y: r.y, w: r.width, h: r.height }
      };
    });

    const forms = Array.from(document.querySelectorAll("form")).map((form, index) => ({
      index,
      action: form.getAttribute("action") || "",
      method: form.getAttribute("method") || "",
      text: clean(form.innerText || form.textContent).slice(0, 1000)
    }));

    return {
      url: location.href,
      title: document.title || "",
      bodyPreview: clean(document.body.innerText || "").slice(0, 1800),
      inputs,
      labels,
      buttons,
      possiblePickers,
      forms
    };
  });

  fs.writeFileSync(reportPath, JSON.stringify({
    agent: "DIAGNOSE_DETAIL_ABSENSI_JAM_FORM",
    rule: "NO_INPUT_NO_SAVE_NO_ZOOM_NO_VIEWPORT",
    url: currentUrl,
    data,
    screenshot: shotPath,
    createdAt: new Date().toISOString()
  }, null, 2), "utf8");

  console.log(`REPORT=${reportPath}`);

  console.log("\n=== INPUTS ===");
  data.inputs.forEach(i => {
    console.log(`[${i.index}] visible=${i.visible} type="${i.type}" name="${i.name}" id="${i.id}" class="${i.className}" value="${i.value}" placeholder="${i.placeholder}" min="${i.min}" max="${i.max}" step="${i.step}"`);
  });

  console.log("\n=== BUTTONS ===");
  data.buttons.forEach(b => {
    console.log(`[${b.index}] ${b.tag} type="${b.type}" text="${b.text}" href="${b.href}" class="${b.className}"`);
  });

  console.log("\n=== POSSIBLE TIME PICKERS ===");
  data.possiblePickers.forEach(p => {
    console.log(`[${p.index}] ${p.tag} visible=${p.visible} id="${p.id}" class="${p.className}" text="${p.text}"`);
  });

  console.log("SMARTWORK_DIAGNOSE_DETAIL_JAM_FORM=OK");
}

main().catch(error => {
  console.error("SMARTWORK_DIAGNOSE_DETAIL_JAM_FORM=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
