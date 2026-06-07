import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report = {
  id: `smartwork-runtime-v1-${stamp}`,
  mode: "dryRun",
  browser: "Chrome CDP 9222",
  target: "SmartLearn Pro Local",
  url: process.env.SMARTWORK_URL || "http://localhost:5173",
  safety: {
    dryRun: true,
    save: false,
    send: false,
    delete: false,
    allowSend: false,
    allowDelete: false,
  },
  steps: [],
  screenshots: [],
};

function logStep(name, status, note = "") {
  const item = {
    time: new Date().toISOString(),
    name,
    status,
    note,
  };
  report.steps.push(item);
  console.log(`${name}: ${status}${note ? " - " + note : ""}`);
}

async function shot(page, name) {
  const file = path.join(shotsDir, `${stamp}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  report.screenshots.push(file);
  console.log(`SCREENSHOT=${file}`);
  return file;
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    try {
      if (await loc.count()) {
        await loc.waitFor({ state: "visible", timeout: 1500 });
        return { loc, selector };
      }
    } catch {}
  }
  return null;
}

async function humanFill(locator, value) {
  await locator.click({ timeout: 5000 });
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await locator.press("Backspace");
  await locator.pressSequentially(value, { delay: 70 });
  await locator.press("Tab");
}

async function waitHuman(ms = 700) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== SMARTWORK RUNTIME TEST V1 ===");
  console.log("Connecting to Chrome debug: http://127.0.0.1:9222");

  const email = process.env.SMARTWORK_EMAIL || "tes.guru.pai02@gmail.com";
  const password = process.env.SMARTWORK_PASSWORD || "12345678";
  const url = report.url;

  let browser;
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  } catch (error) {
    console.error("SMARTWORK_RUNTIME=FAILED");
    console.error("Chrome debug belum aktif. Jalankan dulu: npm run open:browser");
    console.error(error.message);
    process.exit(1);
  }

  const context = browser.contexts()[0] || await browser.newContext();
  let page = context.pages().find((p) => p.url().startsWith(url)) || context.pages()[0];

  if (!page) {
    page = await context.newPage();
  }

  logStep("connect_chrome_debug", "OK", "Connected to Chrome via CDP 9222");

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitHuman(1200);
  logStep("open_smartlearn_local", "OK", url);
  await shot(page, "01-open-smartlearn");

  const emailInput = await firstVisible(page, [
    'input[type="email"]',
    'input[name="email"]',
    'input[placeholder*="email" i]',
    'input[placeholder*="gmail" i]',
  ]);

  const passwordInput = await firstVisible(page, [
    'input[type="password"]',
    'input[name="password"]',
    'input[placeholder*="password" i]',
    'input[placeholder*="sandi" i]',
  ]);

  if (emailInput && passwordInput) {
    logStep("login_form_detected", "OK", `email=${emailInput.selector}, password=${passwordInput.selector}`);

    await humanFill(emailInput.loc, email);
    await waitHuman(400);
    await humanFill(passwordInput.loc, password);
    await waitHuman(500);

    const submit = await firstVisible(page, [
      'button[type="submit"]',
      'button:has-text("Masuk")',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
    ]);

    if (!submit) {
      throw new Error("Tombol login tidak ditemukan.");
    }

    await submit.loc.click();
    logStep("login_submit_clicked", "OK", "Human-like input + click");
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await waitHuman(2500);
    await shot(page, "02-after-login");
  } else {
    logStep("login_form_detected", "SKIPPED", "Kemungkinan sudah login atau form login tidak tampil.");
    await shot(page, "02-login-skipped");
  }

  const bodyText = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
  const dashboardDetected =
    /Rapor Digital|Dashboard|Input Nilai|Guru|Siswa|SmartLearn/i.test(bodyText);

  if (!dashboardDetected) {
    logStep("dashboard_detected", "WARN", "Teks dashboard belum pasti terdeteksi. Cek screenshot.");
  } else {
    logStep("dashboard_detected", "OK", "SmartLearn UI detected");
  }

  report.finalUrl = page.url();
  report.bodyPreview = bodyText.slice(0, 700);

  const reportJson = path.join(reportsDir, `${stamp}-runtime-test-report.json`);
  const reportMd = path.join(reportsDir, `${stamp}-runtime-test-report.md`);

  fs.writeFileSync(reportJson, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(
    reportMd,
    [
      `# SmartWork Runtime Test V1`,
      ``,
      `- Result: ${dashboardDetected ? "OK" : "WARN"}`,
      `- Browser: Chrome CDP 9222`,
      `- URL: ${url}`,
      `- Final URL: ${report.finalUrl}`,
      `- Dry Run: true`,
      `- Save/Send/Delete: disabled`,
      ``,
      `## Steps`,
      ...report.steps.map((s) => `- ${s.name}: ${s.status}${s.note ? ` — ${s.note}` : ""}`),
      ``,
      `## Screenshots`,
      ...report.screenshots.map((s) => `- ${s}`),
      ``,
    ].join("\n"),
    "utf8"
  );

  console.log(`REPORT_JSON=${reportJson}`);
  console.log(`REPORT_MD=${reportMd}`);
  console.log(dashboardDetected ? "SMARTWORK_RUNTIME=OK" : "SMARTWORK_RUNTIME=WARN");
  console.log("SMARTWORK_DRYRUN=TRUE");

  await browser.close().catch(() => {});
}

main().catch((error) => {
  console.error("SMARTWORK_RUNTIME=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
