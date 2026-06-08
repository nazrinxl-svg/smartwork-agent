import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
const shotsDir = path.join(root, "shots");
fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const allowedHost = "siagapendis.kemenag.go.id";

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
    console.log(`SCREENSHOT=${file}`);
    return file;
  } catch (error) {
    console.log(`SCREENSHOT_WARN=${error.message}`);
    return null;
  }
}

async function main() {
  console.log("=== SMARTWORK SIAGA DIAGNOSE FORM ===");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0];

  if (!page) throw new Error("Tab SIAGA tidak ditemukan.");
  await page.bringToFront().catch(() => {});
  await wait(500);

  if (!safeUrl(page.url())) {
    throw new Error(`Domain tidak diizinkan: ${page.url()}`);
  }

  const screenshot = await shot(context, page, "diagnose-absensi-form");

  const data = await page.evaluate(() => {
    function clean(text) {
      return String(text || "").replace(/\s+/g, " ").trim();
    }

    function visible(el) {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return r.width > 1 && r.height > 1 && s.display !== "none" && s.visibility !== "hidden";
    }

    const selects = Array.from(document.querySelectorAll("select")).map((select, index) => {
      const r = select.getBoundingClientRect();
      return {
        index,
        visible: visible(select),
        id: select.id || "",
        name: select.name || "",
        className: String(select.className || ""),
        value: select.value || "",
        selectedIndex: select.selectedIndex,
        selectedText: clean(select.options[select.selectedIndex]?.textContent || ""),
        rect: {
          x: Math.round(r.left),
          y: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height)
        },
        options: Array.from(select.options || []).map((o, optionIndex) => ({
          optionIndex,
          value: o.value,
          text: clean(o.textContent),
          disabled: o.disabled
        }))
      };
    });

    const inputs = Array.from(document.querySelectorAll("input")).map((input, index) => {
      const r = input.getBoundingClientRect();
      return {
        index,
        visible: visible(input),
        type: input.type || "",
        id: input.id || "",
        name: input.name || "",
        value: input.type === "password" ? "[PASSWORD]" : input.value,
        checked: input.checked,
        className: String(input.className || ""),
        rect: {
          x: Math.round(r.left),
          y: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height)
        }
      };
    });

    const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a")).map((el, index) => {
      const r = el.getBoundingClientRect();
      return {
        index,
        visible: visible(el),
        tag: el.tagName,
        type: el.getAttribute("type") || "",
        id: el.id || "",
        className: String(el.className || ""),
        text: clean(el.innerText || el.textContent || el.value),
        href: el.getAttribute("href") || "",
        rect: {
          x: Math.round(r.left),
          y: Math.round(r.top),
          w: Math.round(r.width),
          h: Math.round(r.height)
        }
      };
    }).filter((b) => b.visible || /Simpan|Tambah|Input|Unduh|Ajukan/i.test(b.text));

    return {
      url: location.href,
      title: document.title,
      bodyPreview: clean(document.body.innerText).slice(0, 1500),
      selects,
      inputs,
      buttons
    };
  });

  const jsonFile = path.join(reportsDir, `${stamp}-siaga-diagnose-form.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-diagnose-form.md`);

  fs.writeFileSync(jsonFile, JSON.stringify({ screenshot, ...data }, null, 2), "utf8");

  const lines = [];
  lines.push("# SIAGA Diagnose Absensi Form");
  lines.push("");
  lines.push(`URL: ${data.url}`);
  lines.push(`Screenshot: ${screenshot || "-"}`);
  lines.push("");
  lines.push("## Selects");
  for (const s of data.selects) {
    lines.push(`### SELECT[${s.index}] name="${s.name}" id="${s.id}" visible=${s.visible}`);
    lines.push(`Selected: ${s.selectedText} | value=${s.value}`);
    for (const o of s.options) {
      lines.push(`- [${o.optionIndex}] value="${o.value}" text="${o.text}" disabled=${o.disabled}`);
    }
    lines.push("");
  }

  lines.push("## Inputs");
  for (const input of data.inputs) {
    lines.push(`- INPUT[${input.index}] type=${input.type} name="${input.name}" id="${input.id}" value="${input.value}" checked=${input.checked} visible=${input.visible}`);
  }

  lines.push("");
  lines.push("## Buttons/Links");
  for (const b of data.buttons) {
    lines.push(`- ${b.tag}[${b.index}] text="${b.text}" type="${b.type}" href="${b.href}" visible=${b.visible}`);
  }

  fs.writeFileSync(mdFile, lines.join("\n"), "utf8");

  console.log(`REPORT_JSON=${jsonFile}`);
  console.log(`REPORT_MD=${mdFile}`);

  console.log("=== SELECT SUMMARY ===");
  data.selects.forEach((s) => {
    console.log(`SELECT[${s.index}] name=${s.name} id=${s.id} selected=${s.selectedText}`);
    s.options.forEach((o) => console.log(`  - value=${o.value} text=${o.text}`));
  });

  console.log("SMARTWORK_DIAGNOSE_FORM=OK");
}

main().catch((error) => {
  console.error("SMARTWORK_DIAGNOSE_FORM=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
