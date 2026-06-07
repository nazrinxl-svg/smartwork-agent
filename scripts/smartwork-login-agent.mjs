import fs from "fs";
import path from "path";
import { chromium } from "playwright";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

const config = readJson("configs/smartlearn.local.json");

const BASE_URL = process.env.SMARTWORK_URL || config.url;
const EMAIL = process.env.SMARTWORK_EMAIL || config.login.email;
const PASSWORD = process.env.SMARTWORK_PASSWORD || config.login.password;
const CDP_URL = process.env.SMARTWORK_CDP || "http://127.0.0.1:9222";
const SLOW = Number(process.env.SMARTWORK_SLOW || 260);

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join("reports", `smartwork-login-${stamp}.json`);
const shotPath = path.join("shots", `smartwork-login-${stamp}.png`);

fs.mkdirSync("reports", { recursive: true });
fs.mkdirSync("shots", { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (text = "") => String(text).replace(/\s+/g, " ").trim();

const steps = [];

function step(label, data = {}) {
  const item = { at: new Date().toISOString(), label, ...data };
  steps.push(item);
  console.log(`${label}${Object.keys(data).length ? "=" + JSON.stringify(data) : ""}`);
}

async function findPage(browser) {
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      const url = page.url();
      if (url.includes("localhost:5173") || url.includes("127.0.0.1")) return page;
    }
  }

  const context = browser.contexts()[0] || await browser.newContext();
  return context.pages()[0] || await context.newPage();
}

async function clickFirst(page, candidates, label) {
  for (const item of candidates) {
    try {
      const count = await item.locator.count();
      if (count > 0) {
        const loc = item.locator.first();
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await wait(SLOW);
        await loc.click({ timeout: 4000 });
        await wait(SLOW * 2);
        step(`OK_CLICK_${label}`, { name: item.name });
        return true;
      }
    } catch {
      step(`TRY_FAIL_${label}`, { name: item.name });
    }
  }

  step(`MISS_CLICK_${label}`);
  return false;
}

async function screenshot(page) {
  const target = page.locator("main").first();
  await target.screenshot({ path: shotPath }).catch(async () => {
    await page.screenshot({ path: shotPath, fullPage: true });
  });
  step("SHOT_OK", { shotPath });
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL).catch(() => null);

  if (!browser) {
    console.log("SMARTWORK_LOGIN=CDP_NOT_CONNECTED");
    process.exit(2);
  }

  const page = await findPage(browser);

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.bringToFront();
  await wait(1200);

  const firstBody = clean(await page.locator("body").innerText().catch(() => ""));

  if (/Dashboard|Rapor|Guru Mata Pelajaran|Input Nilai/i.test(firstBody)) {
    step("LOGIN_ALREADY_OK");
    await screenshot(page);
    fs.writeFileSync(reportPath, JSON.stringify({ result: "ALREADY_LOGGED_IN", steps }, null, 2));
    console.log(`REPORT=${reportPath}`);
    console.log("SMARTWORK_LOGIN=ALREADY_LOGGED_IN");
    await browser.close();
    return;
  }

  await clickFirst(page, [
    { name: "Guru role exact", locator: page.getByRole("button", { name: /^Guru$/i }) },
    { name: "Guru text exact", locator: page.getByText(/^Guru$/i) },
    { name: "Guru button contains", locator: page.locator("button").filter({ hasText: /Guru/i }) }
  ], "ROLE_GURU");

  await wait(700);

  const emailCandidates = [
    page.locator("input[type='email']"),
    page.locator("input[name*='email' i]"),
    page.locator("input[placeholder*='email' i]"),
    page.locator("input").first()
  ];

  let emailOk = false;

  for (const locator of emailCandidates) {
    try {
      if ((await locator.count()) > 0) {
        const input = locator.first();
        await input.scrollIntoViewIfNeeded().catch(() => {});
        await input.click({ timeout: 3000 });
        await page.keyboard.press("Control+A").catch(() => {});
        await page.keyboard.type(EMAIL, { delay: 45 });
        emailOk = true;
        step("EMAIL_FILLED");
        break;
      }
    } catch {}
  }

  const passCandidates = [
    page.locator("input[type='password']"),
    page.locator("input[name*='password' i]"),
    page.locator("input[placeholder*='password' i]"),
    page.locator("input[placeholder*='sandi' i]")
  ];

  let passOk = false;

  for (const locator of passCandidates) {
    try {
      if ((await locator.count()) > 0) {
        const input = locator.first();
        await input.scrollIntoViewIfNeeded().catch(() => {});
        await input.click({ timeout: 3000 });
        await page.keyboard.press("Control+A").catch(() => {});
        await page.keyboard.type(PASSWORD, { delay: 55 });
        passOk = true;
        step("PASSWORD_FILLED");
        break;
      }
    } catch {}
  }

  if (!emailOk || !passOk) {
    await screenshot(page);
    fs.writeFileSync(reportPath, JSON.stringify({ result: "INPUT_NOT_FOUND", emailOk, passOk, steps }, null, 2));
    console.log(`REPORT=${reportPath}`);
    console.log("SMARTWORK_LOGIN=INPUT_NOT_FOUND");
    await browser.close();
    process.exit(3);
  }

  await wait(700);

  const submitOk = await clickFirst(page, [
    { name: "Masuk button", locator: page.getByRole("button", { name: /Masuk|Login|Sign in/i }) },
    { name: "Submit button", locator: page.locator("button[type='submit']") },
    { name: "Button has masuk", locator: page.locator("button").filter({ hasText: /Masuk|Login/i }) }
  ], "SUBMIT_LOGIN");

  if (!submitOk) {
    await page.keyboard.press("Enter").catch(() => {});
    step("ENTER_SUBMIT_FALLBACK");
  }

  await wait(3500);

  const afterBody = clean(await page.locator("body").innerText().catch(() => ""));
  const loginOk = /Dashboard|Rapor|Guru Mata Pelajaran|Input Nilai/i.test(afterBody);

  await screenshot(page);

  fs.writeFileSync(reportPath, JSON.stringify({
    result: loginOk ? "OK" : "MAYBE_FAILED",
    emailOk,
    passOk,
    loginOk,
    sample: afterBody.slice(0, 900),
    steps
  }, null, 2));

  console.log(`REPORT=${reportPath}`);
  console.log(loginOk ? "SMARTWORK_LOGIN=OK" : "SMARTWORK_LOGIN=MAYBE_FAILED");

  await browser.close();
  process.exit(loginOk ? 0 : 4);
}

main().catch((err) => {
  console.error("SMARTWORK_LOGIN_FATAL", err);
  process.exit(1);
});