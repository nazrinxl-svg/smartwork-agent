import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "reports", "siaga-login-dom-diagnose-report.json");
const SHOT_PATH = path.join(ROOT, "shots", `${new Date().toISOString().replaceAll(":", "-")}-siaga-login-dom-diagnose.png`);

function safeText(v) {
  return String(v || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

async function main() {
  console.log("SMARTWORK_DIAGNOSE=SIAGA_LOGIN_DOM_ONLY");
  console.log("RULE=NO_CREDENTIAL_NO_LOGIN_NO_INPUT_NO_SAVE");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const page = await browser.newPage({
    viewport: { width: 1365, height: 768 },
  });

  const log = [];
  const add = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}`;
    log.push(line);
    console.log(line);
  };

  try {
    add("OPEN=https://siagapendis.kemenag.go.id/");
    await page.goto("https://siagapendis.kemenag.go.id/", {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });

    await page.waitForTimeout(5000);

    const title = await page.title();
    const url = page.url();

    add(`TITLE=${title}`);
    add(`URL=${url}`);

    await page.screenshot({ path: SHOT_PATH, fullPage: true });
    add(`SCREENSHOT=${SHOT_PATH}`);

    const data = await page.evaluate(() => {
      const pick = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const label =
          el.closest("label")?.innerText ||
          document.querySelector(`label[for="${el.id}"]`)?.innerText ||
          "";

        return {
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type") || "",
          name: el.getAttribute("name") || "",
          id: el.id || "",
          className: String(el.className || ""),
          placeholder: el.getAttribute("placeholder") || "",
          autocomplete: el.getAttribute("autocomplete") || "",
          ariaLabel: el.getAttribute("aria-label") || "",
          valueLength: String(el.value || "").length,
          label,
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none",
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          },
        };
      };

      const inputSelectors = [
        "input",
        "textarea",
        "select",
        "[contenteditable='true']",
      ];

      const buttonSelectors = [
        "button",
        "a",
        "input[type='submit']",
        "input[type='button']",
        "[role='button']",
      ];

      const inputs = Array.from(document.querySelectorAll(inputSelectors.join(","))).map(pick);

      const buttons = Array.from(document.querySelectorAll(buttonSelectors.join(","))).map((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type") || "",
          name: el.getAttribute("name") || "",
          id: el.id || "",
          className: String(el.className || ""),
          href: el.getAttribute("href") || "",
          text: (el.innerText || el.value || el.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 180),
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none",
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          },
        };
      });

      return {
        documentTextSample: document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 2000),
        inputs,
        buttons,
      };
    });

    const report = {
      ok: true,
      mode: "siaga-login-dom-diagnose",
      rule: "NO_CREDENTIAL_NO_LOGIN_NO_INPUT_NO_SAVE",
      title,
      url,
      screenshot: path.relative(ROOT, SHOT_PATH).replaceAll("\\", "/"),
      inputCount: data.inputs.length,
      visibleInputCount: data.inputs.filter((x) => x.visible).length,
      buttonCount: data.buttons.length,
      visibleButtonCount: data.buttons.filter((x) => x.visible).length,
      inputs: data.inputs.map((x) => ({ ...x, label: safeText(x.label) })),
      buttons: data.buttons.map((x) => ({ ...x, text: safeText(x.text) })),
      documentTextSample: safeText(data.documentTextSample),
      log,
    };

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`REPORT=${REPORT_PATH}`);
  } catch (error) {
    const report = {
      ok: false,
      mode: "siaga-login-dom-diagnose",
      rule: "NO_CREDENTIAL_NO_LOGIN_NO_INPUT_NO_SAVE",
      error: error?.message || String(error),
      log,
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error("SMARTWORK_DIAGNOSE_FAILED", error);
  process.exit(1);
});
