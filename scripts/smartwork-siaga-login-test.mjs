import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const loginUrl = "https://siagapendis.kemenag.go.id/login";
const allowedHost = "siagapendis.kemenag.go.id";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

const username = process.env.SIAGA_USERNAME;
const password = process.env.SIAGA_PASSWORD;

const report = {
  id: `siaga-login-test-v4-${stamp}`,
  target: "SIAGA Pendis Kemenag",
  mode: "login-test-dashboard-aware",
  dryRun: true,
  allowedHost,
  safety: {
    noBypassLogin: true,
    noBypassCaptcha: true,
    noBypassOtp: true,
    saveAllowed: false,
    sendAllowed: false,
    deleteAllowed: false,
    passwordStored: false,
    passwordPrinted: false,
    screenshotAfterPasswordFill: false
  },
  steps: [],
  screenshots: []
};

function step(name, status, note = "") {
  report.steps.push({
    time: new Date().toISOString(),
    name,
    status,
    note
  });
  console.log(`${name}: ${status}${note ? " - " + note : ""}`);
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname === allowedHost;
  } catch {
    return false;
  }
}

function redact(text = "") {
  return text
    .replaceAll(password || "", "[PASSWORD_REDACTED]")
    .replaceAll(username || "", "[USERNAME_REDACTED]")
    .slice(0, 1000);
}

async function waitHuman(ms = 700) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function cdpShot(context, page, name) {
  const file = path.join(shotsDir, `${stamp}-${name}.png`);

  try {
    await page.bringToFront().catch(() => {});
    await page.setViewportSize({ width: 1366, height: 768 }).catch(() => {});
    await waitHuman(500);

    const session = await context.newCDPSession(page);
    const result = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false
    });

    fs.writeFileSync(file, Buffer.from(result.data, "base64"));
    report.screenshots.push(file);
    console.log(`SCREENSHOT=${file}`);
    return file;
  } catch (error) {
    step(`screenshot_${name}`, "WARN", error.message);
    return null;
  }
}

async function firstVisible(page, selectors, timeout = 1800) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    try {
      if (await loc.count()) {
        await loc.waitFor({ state: "visible", timeout });
        return { selector, loc };
      }
    } catch {}
  }
  return null;
}

async function visibleCount(page, selectors) {
  let total = 0;
  for (const selector of selectors) {
    try {
      total += await page.locator(selector).count();
    } catch {}
  }
  return total;
}

async function humanType(locator, value) {
  await locator.click({ timeout: 7000 });
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await locator.press("Backspace");
  await waitHuman(200);
  await locator.pressSequentially(value, { delay: 110 });
  await waitHuman(250);
}

async function valueLength(locator) {
  try {
    const value = await locator.inputValue({ timeout: 2000 });
    return value.length;
  } catch {
    return -1;
  }
}

function isDashboardUrl(url) {
  return /\/index\/beranda|\/beranda|dashboard|home/i.test(url);
}

function isLoginUrl(url) {
  return /\/login/i.test(url);
}

async function dashboardSignals(page) {
  const text = await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
  const url = page.url();

  const loginInputCount = await visibleCount(page, [
    'input[type="password"]',
    'button:has-text("Masuk")',
    'button:has-text("Login")',
    'input[placeholder*="Kata Kunci" i]',
    'input[placeholder*="Nomor Akun" i]'
  ]);

  const hasDashboardText = /beranda|dashboard|profil|data|laporan|ptk|guru|administrasi|absensi|portofolio|jadwal|tugas|siaga/i.test(text);
  const hasLoginText = /masukkan nomor akun|masukkan kata kunci/i.test(text.slice(0, 1200));

  return {
    url,
    text,
    isDashboardUrl: isDashboardUrl(url),
    isLoginUrl: isLoginUrl(url),
    loginInputCount,
    hasDashboardText,
    hasLoginText
  };
}

async function writeReport() {
  const jsonFile = path.join(reportsDir, `${stamp}-siaga-login-test-v4.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-login-test-v4.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(
    mdFile,
    [
      "# SmartWork SIAGA Login Test V4",
      "",
      "- Target: SIAGA Pendis Kemenag",
      "- Mode: login-test-dashboard-aware",
      "- Dry Run: true",
      `- Result: ${report.result || "UNKNOWN"}`,
      "- Save/Send/Delete: disabled",
      "- Password stored: false",
      "- Screenshot after password fill: false",
      "",
      "## Steps",
      ...report.steps.map((s) => `- ${s.name}: ${s.status}${s.note ? ` — ${s.note}` : ""}`),
      "",
      "## Screenshots",
      ...report.screenshots.map((s) => `- ${s}`),
      ""
    ].join("\n"),
    "utf8"
  );

  console.log(`REPORT_JSON=${jsonFile}`);
  console.log(`REPORT_MD=${mdFile}`);
  console.log(`SMARTWORK_SIAGA_LOGIN=${report.result || "UNKNOWN"}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SMARTWORK SIAGA LOGIN TEST V4 DASHBOARD AWARE ===");

  let browser;
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  } catch {
    console.error("SMARTWORK_SIAGA_LOGIN=FAILED");
    console.error("Chrome debug belum aktif. Jalankan dulu: npm run open:siaga");
    process.exit(1);
  }

  step("connect_chrome_debug", "OK", "Chrome CDP 9222");

  const context = browser.contexts()[0] || await browser.newContext();
  let page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0];
  if (!page) page = await context.newPage();

  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await waitHuman(2200);

  if (!safeUrl(page.url())) {
    throw new Error(`Domain tidak diizinkan: ${page.url()}`);
  }

  step("open_siaga", "OK", page.url());

  let signals = await dashboardSignals(page);

  report.detectorBeforeLogin = {
    url: signals.url,
    isDashboardUrl: signals.isDashboardUrl,
    isLoginUrl: signals.isLoginUrl,
    loginInputCount: signals.loginInputCount,
    hasDashboardText: signals.hasDashboardText,
    hasLoginText: signals.hasLoginText
  };

  // Ini kasus bro sekarang: session sudah aktif dan login redirect ke beranda.
  if (signals.isDashboardUrl && signals.loginInputCount === 0) {
    step("already_logged_in", "OK", "Login page redirect ke beranda. Session SIAGA masih aktif.");
    await cdpShot(context, page, "01-siaga-dashboard-already-login");

    report.result = "OK_ALREADY_LOGGED_IN";
    report.finalUrl = page.url();
    report.bodyPreview = redact(signals.text);
    await writeReport();
    return;
  }

  await cdpShot(context, page, "01-login-before-fill");

  if (/captcha|kode keamanan|otp|verifikasi|recaptcha/i.test(signals.text)) {
    step("captcha_or_otp_detected", "STOP", "Selesaikan manual. Agent tidak bypass verifikasi.");
    report.result = "STOP_VERIFICATION_REQUIRED";
    report.finalUrl = page.url();
    report.bodyPreview = redact(signals.text);
    await writeReport();
    return;
  }

  if (!username || !password) {
    step("credential_env_loaded", "FAILED", "SIAGA_USERNAME/SIAGA_PASSWORD belum tersedia di .env.local.");
    report.result = "FAILED_NO_CREDENTIAL";
    report.finalUrl = page.url();
    report.bodyPreview = redact(signals.text);
    await writeReport();
    return;
  }

  step("credential_env_loaded", "OK", `usernameLength=${username.length}, passwordLength=${password.length}`);

  const userInput = await firstVisible(page, [
    'input[placeholder*="Nomor Akun" i]',
    'input[type="text"]',
    'input[name="username"]',
    'input[name="email"]',
    'input[name="login"]'
  ]);

  const passInput = await firstVisible(page, [
    'input[placeholder*="Kata Kunci" i]',
    'input[type="password"]',
    'input[name="password"]'
  ]);

  if (!userInput || !passInput) {
    step("login_form_detected", "FAILED", "Input akun/kata kunci tidak ditemukan dan belum terdeteksi dashboard.");
    await cdpShot(context, page, "02-form-not-found");
    report.result = "FAILED_FORM_NOT_FOUND";
    report.finalUrl = page.url();
    report.bodyPreview = redact(signals.text);
    await writeReport();
    return;
  }

  step("login_form_detected", "OK", `username=${userInput.selector}, password=${passInput.selector}`);

  await humanType(userInput.loc, username);
  await waitHuman(350);
  await humanType(passInput.loc, password);
  await waitHuman(500);

  const userLen = await valueLength(userInput.loc);
  const passLen = await valueLength(passInput.loc);
  step("input_value_check", userLen > 0 && passLen > 0 ? "OK" : "WARN", `usernameLength=${userLen}, passwordLength=${passLen}`);
  step("credentials_filled", "OK", "Tidak ada screenshot setelah password diisi.");

  const submit = await firstVisible(page, [
    'button:has-text("Masuk")',
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Login")'
  ], 2500);

  if (submit) {
    await submit.loc.click({ timeout: 7000 });
    step("submit_button_clicked", "OK", `selector=${submit.selector}`);
  } else {
    await passInput.loc.press("Enter");
    step("submit_enter_pressed", "OK", "Tombol tidak ditemukan, Enter ditekan dari password field.");
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await waitHuman(4000);

  if (!safeUrl(page.url())) {
    step("domain_guard", "STOP", `Redirect keluar domain: ${page.url()}`);
    await cdpShot(context, page, "03-domain-stop");
    report.result = "STOP_DOMAIN_CHANGED";
    report.finalUrl = page.url();
    await writeReport();
    return;
  }

  signals = await dashboardSignals(page);

  report.finalUrl = page.url();
  report.bodyPreview = redact(signals.text);
  report.detectorAfterLogin = {
    url: signals.url,
    isDashboardUrl: signals.isDashboardUrl,
    isLoginUrl: signals.isLoginUrl,
    loginInputCount: signals.loginInputCount,
    hasDashboardText: signals.hasDashboardText,
    hasLoginText: signals.hasLoginText
  };

  if (signals.isDashboardUrl && signals.loginInputCount === 0) {
    step("login_result", "OK", "Dashboard SIAGA terkonfirmasi.");
    await cdpShot(context, page, "03-dashboard-after-login");
    report.result = "OK_LOGIN_CONFIRMED";
  } else if (!signals.isLoginUrl && signals.loginInputCount === 0 && signals.hasDashboardText) {
    step("login_result", "OK", "Login kemungkinan berhasil. Dashboard text terdeteksi.");
    await cdpShot(context, page, "03-dashboard-likely");
    report.result = "OK_LOGIN_LIKELY";
  } else {
    step("login_result", "WARN", `Belum login pasti. url=${signals.url}, loginInputCount=${signals.loginInputCount}`);
    await cdpShot(context, page, "03-still-login-or-unknown");
    report.result = "WARN_STILL_LOGIN_OR_NO_RESPONSE";
  }

  await writeReport();
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_LOGIN=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
