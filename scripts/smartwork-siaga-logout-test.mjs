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
  id: `siaga-logout-test-${stamp}`,
  target: "SIAGA Pendis Kemenag",
  mode: "logout-test",
  dryRun: true,
  safety: {
    action: "logout_only",
    saveAllowed: false,
    sendAllowed: false,
    deleteAllowed: false,
    noBypassLogin: true,
    noBypassCaptcha: true,
    noBypassOtp: true
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

async function waitHuman(ms = 700) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function cdpShot(context, page, name) {
  const file = path.join(shotsDir, `${stamp}-${name}.png`);

  try {
    await page.bringToFront().catch(() => {});
    await page.setViewportSize({ width: 1366, height: 768 }).catch(() => {});
    await waitHuman(400);

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

async function firstVisible(page, selectors, timeout = 1200) {
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

async function bodyText(page) {
  return await page.locator("body").innerText({ timeout: 8000 }).catch(() => "");
}

async function writeReport() {
  const jsonFile = path.join(reportsDir, `${stamp}-siaga-logout-test.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-logout-test.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(
    mdFile,
    [
      "# SmartWork SIAGA Logout Test V1",
      "",
      "- Target: SIAGA Pendis Kemenag",
      "- Mode: logout-test",
      `- Result: ${report.result || "UNKNOWN"}`,
      "- Action: logout only",
      "- Save/Send/Delete: disabled",
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
  console.log(`SMARTWORK_SIAGA_LOGOUT=${report.result || "UNKNOWN"}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SMARTWORK SIAGA LOGOUT TEST V1 ===");

  let browser;
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  } catch {
    console.error("SMARTWORK_SIAGA_LOGOUT=FAILED");
    console.error("Chrome debug belum aktif. Jalankan dulu: npm run open:siaga");
    process.exit(1);
  }

  step("connect_chrome_debug", "OK", "Chrome CDP 9222");

  const context = browser.contexts()[0] || await browser.newContext();
  let page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0];

  if (!page) {
    console.error("SMARTWORK_SIAGA_LOGOUT=FAILED");
    console.error("Tab SIAGA tidak ditemukan.");
    process.exit(1);
  }

  await page.bringToFront().catch(() => {});
  await waitHuman(800);

  if (!safeUrl(page.url())) {
    throw new Error(`Domain tidak diizinkan: ${page.url()}`);
  }

  step("current_page", "OK", page.url());
  await cdpShot(context, page, "01-before-logout");

  const textBefore = await bodyText(page);

  if (/masukkan nomor akun|masukkan kata kunci/i.test(textBefore) || /\/login/i.test(page.url())) {
    step("already_logged_out", "OK", "Halaman sudah berada di login.");
    report.result = "OK_ALREADY_LOGGED_OUT";
    report.finalUrl = page.url();
    await cdpShot(context, page, "02-already-login-page");
    await writeReport();
    return;
  }

  // Coba klik tombol/link logout langsung jika ada.
  let logoutTarget = await firstVisible(page, [
    'a:has-text("Logout")',
    'button:has-text("Logout")',
    'a:has-text("Keluar")',
    'button:has-text("Keluar")',
    'a[href*="logout"]',
    'a[href*="keluar"]'
  ], 1500);

  // Jika belum ada, buka menu/hamburger/profile dulu.
  if (!logoutTarget) {
    const menuTarget = await firstVisible(page, [
      'button:has-text("☰")',
      '.fa-bars',
      '.navbar-toggler',
      'button[aria-label*="menu" i]',
      'button:has(svg)',
      'a:has-text("Akun")',
      'button:has-text("Akun")',
      'a:has-text("Profil")',
      'button:has-text("Profil")'
    ], 1800);

    if (menuTarget) {
      await menuTarget.loc.click({ timeout: 7000 });
      step("open_menu", "OK", `selector=${menuTarget.selector}`);
      await waitHuman(1000);
      await cdpShot(context, page, "02-menu-opened");

      logoutTarget = await firstVisible(page, [
        'a:has-text("Logout")',
        'button:has-text("Logout")',
        'a:has-text("Keluar")',
        'button:has-text("Keluar")',
        'a[href*="logout"]',
        'a[href*="keluar"]'
      ], 2500);
    } else {
      step("open_menu", "WARN", "Menu akun/hamburger tidak ditemukan.");
    }
  }

  if (!logoutTarget) {
    step("logout_target", "FAILED", "Tombol/link logout tidak ditemukan.");
    report.result = "FAILED_LOGOUT_BUTTON_NOT_FOUND";
    report.finalUrl = page.url();
    await cdpShot(context, page, "03-logout-not-found");
    await writeReport();
    return;
  }

  step("logout_target", "OK", `selector=${logoutTarget.selector}`);

  await logoutTarget.loc.click({ timeout: 7000 });
  step("logout_clicked", "OK", "Klik logout dilakukan.");

  await page.waitForLoadState("domcontentloaded", { timeout: 12000 }).catch(() => {});
  await waitHuman(2500);

  // Kalau muncul modal konfirmasi, klik Ya/OK/Keluar.
  const confirmTarget = await firstVisible(page, [
    'button:has-text("Ya")',
    'button:has-text("OK")',
    'button:has-text("Keluar")',
    'button:has-text("Logout")',
    'a:has-text("Ya")',
    'a:has-text("OK")'
  ], 1200);

  if (confirmTarget) {
    await confirmTarget.loc.click({ timeout: 7000 });
    step("logout_confirm_clicked", "OK", `selector=${confirmTarget.selector}`);
    await page.waitForLoadState("domcontentloaded", { timeout: 12000 }).catch(() => {});
    await waitHuman(2500);
  }

  const textAfter = await bodyText(page);
  const finalUrl = page.url();

  report.finalUrl = finalUrl;
  report.bodyPreview = textAfter.slice(0, 900);

  const isLoginPage =
    /\/login/i.test(finalUrl) ||
    /masukkan nomor akun|masukkan kata kunci|masuk/i.test(textAfter.slice(0, 1200));

  if (isLoginPage) {
    step("logout_result", "OK", "Berhasil keluar akun dan kembali ke halaman login.");
    await cdpShot(context, page, "04-after-logout-login-page");
    report.result = "OK_LOGOUT_CONFIRMED";
  } else {
    step("logout_result", "WARN", `Belum pasti logout. finalUrl=${finalUrl}`);
    await cdpShot(context, page, "04-after-logout-unknown");
    report.result = "WARN_LOGOUT_NOT_CONFIRMED";
  }

  await writeReport();
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_LOGOUT=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
