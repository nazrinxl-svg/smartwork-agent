import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
const shotsDir = path.join(root, "shots");
const profileRoot = path.join(root, "browser-profile", "parallel-siaga-real");

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const TARGET_TEACHER_ID = process.env.TARGET_TEACHER_ID || "guru-002";
const TARGET_CREATE_URL = process.env.TARGET_CREATE_URL || "https://siagapendis.kemenag.go.id/guru/absensi/detail/8864101/2026-06-01/create";

const reportPath = path.join(reportsDir, "siaga-diagnose-create-form-state-report.json");

function now() {
  return new Date().toISOString();
}

async function main() {
  console.log("SMARTWORK_DIAGNOSE_CREATE_FORM_STATE=START");
  console.log("RULE=NO_INPUT_NO_SAVE_NO_SUBMIT_NO_DELETE");
  console.log("TARGET_TEACHER_ID=" + TARGET_TEACHER_ID);
  console.log("TARGET_CREATE_URL=" + TARGET_CREATE_URL);

  const profileDir = path.join(profileRoot, `${TARGET_TEACHER_ID}-siaga`);

  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
    args: ["--start-maximized"]
  });

  const page = browser.pages()[0] || await browser.newPage();

  await page.goto(TARGET_CREATE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);

  const screenshotPath = path.join(
    shotsDir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${TARGET_TEACHER_ID}-diagnose-create-form-state.png`
  );

  await page.screenshot({ path: screenshotPath, fullPage: true });

  const data = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    function visible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    }

    const forms = Array.from(document.querySelectorAll("form")).map((form, index) => ({
      index,
      action: form.getAttribute("action") || "",
      method: form.getAttribute("method") || "",
      enctype: form.getAttribute("enctype") || "",
      text: clean(form.innerText || form.textContent).slice(0, 1500)
    }));

    const inputs = Array.from(document.querySelectorAll("input, select, textarea")).map((el, index) => {
      const r = el.getBoundingClientRect();
      return {
        index,
        tag: el.tagName,
        visible: visible(el),
        type: el.getAttribute("type") || "",
        name: el.getAttribute("name") || "",
        id: el.id || "",
        className: String(el.className || ""),
        value: el.value || "",
        placeholder: el.getAttribute("placeholder") || "",
        required: Boolean(el.required),
        disabled: Boolean(el.disabled),
        readOnly: Boolean(el.readOnly),
        rect: { x: r.x, y: r.y, w: r.width, h: r.height }
      };
    });

    const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a")).map((el, index) => ({
      index,
      tag: el.tagName,
      visible: visible(el),
      type: el.getAttribute("type") || "",
      text: clean(el.innerText || el.value || el.textContent),
      href: el.getAttribute("href") || "",
      className: String(el.className || "")
    }));

    const alerts = Array.from(document.querySelectorAll(".alert, .error, .invalid-feedback, .help-block, [class*='alert'], [class*='error'], [class*='invalid']"))
      .map((el, index) => ({
        index,
        tag: el.tagName,
        visible: visible(el),
        className: String(el.className || ""),
        text: clean(el.innerText || el.textContent)
      }))
      .filter((x) => x.text);

    const scriptsText = Array.from(document.scripts)
      .map((s) => s.src || clean(s.textContent).slice(0, 300))
      .filter(Boolean)
      .slice(0, 80);

    return {
      url: location.href,
      title: document.title || "",
      bodyPreview: clean(document.body.innerText || "").slice(0, 2500),
      forms,
      inputs,
      buttons,
      alerts,
      scriptsText
    };
  });

  const report = {
    ok: true,
    mode: "siaga-diagnose-create-form-state",
    rule: "NO_INPUT_NO_SAVE_NO_SUBMIT_NO_DELETE",
    targetTeacherId: TARGET_TEACHER_ID,
    targetCreateUrl: TARGET_CREATE_URL,
    screenshot: path.relative(root, screenshotPath).replaceAll("\\", "/"),
    data,
    createdAt: now()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("SMARTWORK_DIAGNOSE_CREATE_FORM_STATE=DONE");
  console.log("REPORT=" + reportPath);
  console.log("SCREENSHOT=" + screenshotPath);

  console.log("\n=== INPUTS ===");
  data.inputs.forEach((i) => {
    console.log(`[${i.index}] tag=${i.tag} visible=${i.visible} type="${i.type}" name="${i.name}" id="${i.id}" value="${i.value}" required=${i.required} disabled=${i.disabled} readOnly=${i.readOnly} class="${i.className}"`);
  });

  console.log("\n=== BUTTONS ===");
  data.buttons.forEach((b) => {
    console.log(`[${b.index}] tag=${b.tag} visible=${b.visible} type="${b.type}" text="${b.text}" href="${b.href}" class="${b.className}"`);
  });

  console.log("\n=== ALERTS ===");
  data.alerts.forEach((a) => {
    console.log(`[${a.index}] visible=${a.visible} class="${a.className}" text="${a.text}"`);
  });

  // Browser dibiarkan terbuka untuk cek manual.
}

main().catch((error) => {
  const report = {
    ok: false,
    mode: "siaga-diagnose-create-form-state",
    rule: "NO_INPUT_NO_SAVE_NO_SUBMIT_NO_DELETE",
    error: error.message,
    endedAt: now()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.error("SMARTWORK_DIAGNOSE_CREATE_FORM_STATE=FAILED");
  console.error(error.stack || error.message);
  console.error("REPORT=" + reportPath);
  process.exit(1);
});
