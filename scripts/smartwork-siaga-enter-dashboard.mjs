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
const loginUrl = "https://siagapendis.kemenag.go.id/login";

const report = {
  id: `siaga-enter-dashboard-${stamp}`,
  mode: "enter-dashboard",
  dryRun: true,
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

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
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

async function first(page, selectors, timeout = 1800) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    try {
      if (await loc.count()) {
        await loc.waitFor({ state: "visible", timeout });
        return { loc, selector };
      }
    } catch {}
  }
  return null;
}

async function clickText(page, textValue) {
  const item = await page.evaluate((textValue) => {
    const all = Array.from(document.querySelectorAll("a, button, span, div, li"));
    const found = all.find((el) => {
      const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      return t === textValue || t.includes(textValue);
    });

    if (!found) return null;

    const r = found.getBoundingClientRect();
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      w: r.width,
      h: r.height,
      text: (found.innerText || found.textContent || "").replace(/\s+/g, " ").trim()
    };
  }, textValue);

  if (!item || item.w <= 0 || item.h <= 0) return false;

  await page.mouse.move(item.x, item.y);
  await wait(200);
  await page.mouse.click(item.x, item.y);
  step(`click_${textValue}`, "OK", item.text);
  return true;
}

async function loginIfNeeded(page, context) {
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await wait(1800);

  const text = await bodyText(page);
  const stillLogin =
    /\/login/i.test(page.url()) &&
    /Masukkan Nomor Akun|Masukan Kata Kunci|Masuk/i.test(text.slice(0, 1500));

  if (!stillLogin) {
    step("login_check", "OK", `Sudah login atau redirect: ${page.url()}`);
    return true;
  }

  loadEnvLocal();

  const username = process.env.SIAGA_USERNAME;
  const password = process.env.SIAGA_PASSWORD;

  if (!username || !password) {
    step("login_check", "STOP", ".env.local belum berisi SIAGA_USERNAME/SIAGA_PASSWORD");
    await shot(context, page, "01-login-required");
    return false;
  }

  if (/captcha|otp|kode keamanan|verifikasi|recaptcha/i.test(text)) {
    step("login_check", "STOP", "Ada CAPTCHA/OTP/verifikasi. Selesaikan manual.");
    await shot(context, page, "01-verification-required");
    return false;
  }

  const userInput = await first(page, [
    'input[placeholder*="Nomor Akun" i]',
    'input[type="text"]',
    'input[name="username"]',
    'input[name="login"]'
  ], 2500);

  const passInput = await first(page, [
    'input[placeholder*="Kata Kunci" i]',
    'input[type="password"]',
    'input[name="password"]'
  ], 2500);

  if (!userInput || !passInput) {
    step("login_form", "FAILED", "Input login tidak ditemukan.");
    await shot(context, page, "01-login-form-not-found");
    return false;
  }

  await userInput.loc.click();
  await userInput.loc.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await userInput.loc.press("Backspace");
  await userInput.loc.pressSequentially(username, { delay: 80 });

  await passInput.loc.click();
  await passInput.loc.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await passInput.loc.press("Backspace");
  await passInput.loc.pressSequentially(password, { delay: 80 });

  step("login_fill", "OK", "Credential diisi dari .env.local.");

  const btn = await first(page, [
    'button:has-text("Masuk")',
    'input[type="submit"]',
    'button[type="submit"]'
  ], 2500);

  if (btn) {
    await btn.loc.click();
    step("login_submit", "OK", btn.selector);
  } else {
    await passInput.loc.press("Enter");
    step("login_submit", "OK", "Enter dari password.");
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await wait(3000);

  const afterText = await bodyText(page);
  const loginAgain =
    /\/login/i.test(page.url()) &&
    /Masukkan Nomor Akun|Masukan Kata Kunci|Masuk/i.test(afterText.slice(0, 1500));

  if (loginAgain) {
    step("login_result", "FAILED", "Masih di halaman login.");
    await shot(context, page, "02-still-login");
    return false;
  }

  step("login_result", "OK", page.url());
  return true;
}

async function enterDashboard(page, context) {
  await wait(1000);

  let text = await bodyText(page);

  if (/Portofolio|Jadwal & Tugas|Absensi|Status Mengajar/i.test(text)) {
    step("dashboard_check", "OK", "Sudah berada di dashboard guru.");
    await shot(context, page, "03-dashboard-guru");
    return true;
  }

  if (/\/index\/beranda/i.test(page.url()) || /Beranda/i.test(text)) {
    step("beranda_detected", "OK", "Masuk ke beranda umum. Klik Dashboard.");

    await shot(context, page, "03-beranda-before-dashboard-click");

    const clicked =
      await clickText(page, "Dashboard") ||
      await page.locator('a:has-text("Dashboard")').first().click({ timeout: 5000 }).then(() => true).catch(() => false);

    if (!clicked) {
      step("dashboard_click", "FAILED", "Link Dashboard tidak ditemukan.");
      await shot(context, page, "04-dashboard-link-not-found");
      return false;
    }

    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await wait(3000);

    text = await bodyText(page);

    if (/Portofolio|Jadwal & Tugas|Absensi|Status Mengajar/i.test(text)) {
      step("dashboard_result", "OK", "Dashboard guru terbuka.");
      await shot(context, page, "04-dashboard-guru-opened");
      return true;
    }

    step("dashboard_result", "WARN", `Belum pasti masuk dashboard guru. url=${page.url()}`);
    await shot(context, page, "04-dashboard-unknown");
    return false;
  }

  step("dashboard_check", "WARN", `Halaman tidak dikenali: ${page.url()}`);
  await shot(context, page, "03-page-unknown");
  return false;
}

async function writeReport(page) {
  report.finalUrl = page.url();
  report.bodyPreview = (await bodyText(page)).slice(0, 1600);

  const jsonFile = path.join(reportsDir, `${stamp}-siaga-enter-dashboard.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-enter-dashboard.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdFile, [
    "# SIAGA Enter Dashboard",
    "",
    `- Result: ${report.result}`,
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
  console.log(`SMARTWORK_SIAGA_DASHBOARD=${report.result}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SMARTWORK SIAGA ENTER DASHBOARD ===");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0] || await browser.newContext();
  let page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0] || await context.newPage();

  await page.bringToFront().catch(() => {});
  await wait(700);

  const loggedIn = await loginIfNeeded(page, context);

  if (!loggedIn) {
    report.result = "STOP_LOGIN_REQUIRED";
    await writeReport(page);
    return;
  }

  const dashboardOk = await enterDashboard(page, context);

  report.result = dashboardOk ? "OK_DASHBOARD_GURU_OPENED" : "WARN_DASHBOARD_NOT_CONFIRMED";
  await writeReport(page);
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_DASHBOARD=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
