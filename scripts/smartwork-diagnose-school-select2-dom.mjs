import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
const shotsDir = path.join(root, "shots");
fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportsDir, `${stamp}-diagnose-school-select2-dom.json`);
const shotPath = path.join(shotsDir, `${stamp}-diagnose-school-select2-dom.png`);

async function main() {
  console.log("SMARTWORK_DIAGNOSE=SCHOOL_SELECT2_DOM_ONLY");
  console.log("RULE=NO_CLICK_NO_INPUT_NO_SAVE");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("/guru/absensi/create")) ||
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id"));

  if (!page) throw new Error("STOP: Tab SIAGA tidak ditemukan.");

  await page.bringToFront();
  await page.waitForTimeout(500);

  const currentUrl = page.url();
  console.log(`CURRENT_URL=${currentUrl}`);

  if (!currentUrl.includes("/guru/absensi/create")) {
    throw new Error("STOP: Belum di form Tambah Absensi.");
  }

  await page.screenshot({ path: shotPath, fullPage: false });

  const data = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    function visible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    }

    const selects = Array.from(document.querySelectorAll("select")).map((s, index) => ({
      index,
      visible: visible(s),
      name: s.name || "",
      id: s.id || "",
      className: String(s.className || ""),
      value: s.value || "",
      selectedIndex: s.selectedIndex,
      selectedText: clean(s.options[s.selectedIndex]?.textContent || ""),
      options: Array.from(s.options || []).map((o, optionIndex) => ({
        optionIndex,
        value: o.value,
        text: clean(o.textContent),
        disabled: o.disabled,
        selected: o.selected
      }))
    }));

    const inputs = Array.from(document.querySelectorAll("input")).map((i, index) => ({
      index,
      visible: visible(i),
      type: i.type || "",
      name: i.name || "",
      id: i.id || "",
      className: String(i.className || ""),
      value: i.value || "",
      placeholder: i.placeholder || "",
      autocomplete: i.autocomplete || ""
    }));

    const select2Like = Array.from(document.querySelectorAll(
      ".select2, .select2-container, .select2-selection, .select2-selection__rendered, .select2-results__option, [class*='select2']"
    )).map((el, index) => {
      const r = el.getBoundingClientRect();
      return {
        index,
        tag: el.tagName,
        visible: visible(el),
        className: String(el.className || ""),
        id: el.id || "",
        role: el.getAttribute("role") || "",
        ariaSelected: el.getAttribute("aria-selected") || "",
        ariaControls: el.getAttribute("aria-controls") || "",
        ariaOwns: el.getAttribute("aria-owns") || "",
        text: clean(el.innerText || el.textContent),
        rect: {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height
        }
      };
    });

    const bodyPreview = clean(document.body.innerText || "").slice(0, 2000);

    return {
      url: location.href,
      bodyPreview,
      selects,
      inputs,
      select2Like
    };
  });

  fs.writeFileSync(reportPath, JSON.stringify({
    agent: "DIAGNOSE_SCHOOL_SELECT2_DOM_ONLY",
    rule: "NO_CLICK_NO_INPUT_NO_SAVE",
    url: currentUrl,
    screenshot: shotPath,
    data,
    createdAt: new Date().toISOString()
  }, null, 2), "utf8");

  console.log(`REPORT=${reportPath}`);
  console.log(`SCREENSHOT=${shotPath}`);

  console.log("\n=== SELECTS ===");
  data.selects.forEach(s => {
    console.log(`SELECT[${s.index}] visible=${s.visible} name="${s.name}" id="${s.id}" class="${s.className}" value="${s.value}" selected="${s.selectedText}"`);
    s.options.forEach(o => console.log(`  option[${o.optionIndex}] value="${o.value}" text="${o.text}" selected=${o.selected}`));
  });

  console.log("\n=== INPUTS ===");
  data.inputs.forEach(i => {
    console.log(`INPUT[${i.index}] visible=${i.visible} type="${i.type}" name="${i.name}" id="${i.id}" class="${i.className}" value="${i.value}" placeholder="${i.placeholder}"`);
  });

  console.log("\n=== SELECT2 LIKE ===");
  data.select2Like.forEach(x => {
    console.log(`S2[${x.index}] ${x.tag} visible=${x.visible} role="${x.role}" class="${x.className}" text="${x.text}"`);
  });

  console.log("SMARTWORK_DIAGNOSE_SCHOOL_SELECT2=OK_NO_SAVE");
}

main().catch(error => {
  console.error("SMARTWORK_DIAGNOSE_SCHOOL_SELECT2=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
