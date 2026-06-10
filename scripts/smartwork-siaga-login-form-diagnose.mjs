import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const out = path.join(ROOT, "reports", "siaga-login-form-diagnose.json");
const shot = path.join(ROOT, "shots", `${new Date().toISOString().replace(/[:.]/g, "-")}-siaga-login-form-diagnose.png`);

const browser = await chromium.launchPersistentContext(
  path.join(ROOT, "browser-profile", "guru-001-siaga"),
  { headless: false, viewport: null }
);

const page = browser.pages()[0] || await browser.newPage();
await page.goto("https://siagapendis.kemenag.go.id/login", { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: shot, fullPage: true }).catch(() => {});

const state = await page.evaluate(() => {
  const clean = v => String(v || "").replace(/\s+/g, " ").trim();

  return {
    url: location.href,
    title: document.title,
    body: clean(document.body.innerText || "").slice(0, 2000),
    forms: Array.from(document.querySelectorAll("form")).map((form, formIndex) => ({
      formIndex,
      action: form.action || "",
      method: form.method || "",
      text: clean(form.innerText || "").slice(0, 1000),
      inputs: Array.from(form.querySelectorAll("input, select, textarea")).map((el, index) => ({
        index,
        tag: el.tagName,
        type: el.type || "",
        name: el.name || "",
        id: el.id || "",
        placeholder: el.placeholder || "",
        value: el.type === "password" ? "***" : el.value || "",
        autocomplete: el.autocomplete || "",
        required: el.required || false
      })),
      buttons: Array.from(form.querySelectorAll("button, input[type='submit'], a")).map((el, index) => ({
        index,
        tag: el.tagName,
        type: el.type || "",
        text: clean(el.innerText || el.textContent || el.value || ""),
        id: el.id || "",
        name: el.name || "",
        className: el.className || "",
        href: el.href || ""
      }))
    })),
    allButtons: Array.from(document.querySelectorAll("button, input[type='submit'], a")).slice(0, 30).map((el, index) => ({
      index,
      tag: el.tagName,
      type: el.type || "",
      text: clean(el.innerText || el.textContent || el.value || ""),
      id: el.id || "",
      name: el.name || "",
      className: el.className || "",
      href: el.href || ""
    }))
  };
});

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(state, null, 2), "utf8");

console.log("REPORT=" + out);
console.log("SHOT=" + shot);
console.log(JSON.stringify({
  url: state.url,
  forms: state.forms.length,
  firstForm: state.forms[0],
  allButtons: state.allButtons.slice(0, 10)
}, null, 2));

await browser.close();
