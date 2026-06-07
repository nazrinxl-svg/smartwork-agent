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
  id: `siaga-absensi-scout-${stamp}`,
  target: "SIAGA Pendis Kemenag",
  mode: "absensi-scout",
  dryRun: true,
  safety: {
    action: "navigate_and_screenshot_only",
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

async function bodyText(page) {
  return await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
}

async function firstVisible(page, selectors, timeout = 2000) {
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

async function clickIfVisible(page, selectors, timeout = 2000) {
  const found = await firstVisible(page, selectors, timeout);
  if (!found) return null;

  await found.loc.scrollIntoViewIfNeeded().catch(() => {});
  await waitHuman(300);
  await found.loc.click({ timeout: 7000 });
  return found.selector;
}

async function ensureLoggedIn(page) {
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await waitHuman(2200);

  const text = await bodyText(page);
  const url = page.url();

  const isLogin =
    /\/login/i.test(url) &&
    /masukkan nomor akun|masukkan kata kunci|masuk/i.test(text.slice(0, 1500));

  if (isLogin) {
    return {
      loggedIn: false,
      reason: "Masih di halaman login. Jalankan npm run siaga:login-test dulu."
    };
  }

  if (!safeUrl(url)) {
    return {
      loggedIn: false,
      reason: `Domain tidak diizinkan: ${url}`
    };
  }

  return {
    loggedIn: true,
    reason: url
  };
}

async function openSideMenuIfNeeded(page, context) {
  const text = await bodyText(page);

  if (/Absensi/i.test(text)) {
    step("side_menu_visible", "OK", "Menu Absensi sudah terlihat.");
    return true;
  }

  const clicked = await clickIfVisible(page, [
    'button:has-text("☰")',
    'button[aria-label*="menu" i]',
    '.navbar-toggler',
    '.fa-bars',
    'i.fa-bars',
    'a:has(.fa-bars)',
    'button:has(svg)'
  ], 2000);

  if (clicked) {
    step("open_side_menu", "OK", `selector=${clicked}`);
    await waitHuman(1000);
    await cdpShot(context, page, "02-menu-opened");
    return true;
  }

  step("open_side_menu", "WARN", "Tombol menu tidak ditemukan, lanjut cari Absensi langsung.");
  return false;
}

async function writeReport() {
  const jsonFile = path.join(reportsDir, `${stamp}-siaga-absensi-scout.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-absensi-scout.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(
    mdFile,
    [
      "# SmartWork SIAGA Absensi Scout V1",
      "",
      "- Target: SIAGA Pendis Kemenag",
      "- Mode: absensi-scout",
      `- Result: ${report.result || "UNKNOWN"}`,
      "- Action: navigate and screenshot only",
      "- Save/Send/Delete: disabled",
      "",
      "## Steps",
      ...report.steps.map((s) => `- ${s.name}: ${s.status}${s.note ? ` — ${s.note}` : ""}`),
      "",
      "## Screenshots",
      ...report.screenshots.map((s) => `- ${s}`),
      "",
      "## Final URL",
      report.finalUrl || "",
      ""
    ].join("\n"),
    "utf8"
  );

  console.log(`REPORT_JSON=${jsonFile}`);
  console.log(`REPORT_MD=${mdFile}`);
  console.log(`SMARTWORK_SIAGA_ABSENSI=${report.result || "UNKNOWN"}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SMARTWORK SIAGA ABSENSI SCOUT V1 ===");

  let browser;
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  } catch {
    console.error("SMARTWORK_SIAGA_ABSENSI=FAILED");
    console.error("Chrome debug belum aktif. Jalankan dulu: npm run open:siaga");
    process.exit(1);
  }

  step("connect_chrome_debug", "OK", "Chrome CDP 9222");

  const context = browser.contexts()[0] || await browser.newContext();
  let page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0];

  if (!page) {
    page = await context.newPage();
  }

  await page.bringToFront().catch(() => {});

  const loginCheck = await ensureLoggedIn(page);

  if (!loginCheck.loggedIn) {
    step("login_check", "STOP", loginCheck.reason);
    await cdpShot(context, page, "01-login-required");
    report.result = "STOP_LOGIN_REQUIRED";
    report.finalUrl = page.url();
    report.bodyPreview = (await bodyText(page)).slice(0, 1000);
    await writeReport();
    return;
  }

  step("login_check", "OK", loginCheck.reason);
  await cdpShot(context, page, "01-dashboard-before-absensi");

  await openSideMenuIfNeeded(page, context);

  const clickedAbsensi = await clickIfVisible(page, [
    'a:has-text("Absensi")',
    'button:has-text("Absensi")',
    'li:has-text("Absensi") a',
    'text=Absensi'
  ], 3500);

  if (!clickedAbsensi) {
    step("click_absensi", "FAILED", "Menu Absensi tidak ditemukan.");
    await cdpShot(context, page, "03-absensi-not-found");
    report.result = "FAILED_ABSENSI_MENU_NOT_FOUND";
    report.finalUrl = page.url();
    report.bodyPreview = (await bodyText(page)).slice(0, 1200);
    await writeReport();
    return;
  }

  step("click_absensi", "OK", `selector=${clickedAbsensi}`);

  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await waitHuman(2500);

  const finalText = await bodyText(page);
  report.finalUrl = page.url();
  report.bodyPreview = finalText.slice(0, 1500);

  const absensiDetected =
    /absensi|kehadiran|hadir|tanggal|jadwal|tugas/i.test(finalText) ||
    /absensi/i.test(page.url());

  if (absensiDetected) {
    step("absensi_page_detected", "OK", "Halaman/area Absensi terdeteksi.");
    await cdpShot(context, page, "04-absensi-page");
    report.result = "OK_ABSENSI_OPENED";
  } else {
    step("absensi_page_detected", "WARN", "Klik Absensi berhasil, tapi halaman belum pasti terdeteksi.");
    await cdpShot(context, page, "04-after-click-absensi-unknown");
    report.result = "WARN_ABSENSI_CLICKED_UNKNOWN_PAGE";
  }

  await writeReport();
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_ABSENSI=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
