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
const homeUrl = "https://siagapendis.kemenag.go.id/index/beranda";

const report = {
  id: `siaga-absensi-open-v2-${stamp}`,
  target: "SIAGA Pendis Kemenag",
  mode: "absensi-open-v2",
  dryRun: true,
  safety: {
    action: "open_absensi_only",
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
    return new URL(url).hostname === allowedHost;
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

async function writeReport() {
  const jsonFile = path.join(reportsDir, `${stamp}-siaga-absensi-open-v2.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-absensi-open-v2.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(
    mdFile,
    [
      "# SmartWork SIAGA Absensi Open V2",
      "",
      "- Target: SIAGA Pendis Kemenag",
      "- Mode: absensi-open-v2",
      `- Result: ${report.result || "UNKNOWN"}`,
      "- Action: open Absensi only",
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

async function clickAbsensiPrecise(page) {
  // Cara 1: klik link atau item yang teksnya tepat Absensi.
  const candidates = [
    'a:has-text("Absensi")',
    'li:has-text("Absensi")',
    'span:has-text("Absensi")',
    'div:has-text("Absensi")',
    'text=Absensi'
  ];

  for (const selector of candidates) {
    try {
      const loc = page.locator(selector).filter({ hasText: /^Absensi$/ }).first();
      if (await loc.count()) {
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await waitHuman(300);

        const box = await loc.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await waitHuman(250);
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          return `mouse:${selector}`;
        }

        await loc.click({ timeout: 7000 });
        return selector;
      }
    } catch {}
  }

  // Cara 2: evaluasi semua elemen, cari teks Absensi, klik koordinatnya.
  const item = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("a, li, span, div, button"));
    const found = all.find((el) => (el.innerText || el.textContent || "").trim() === "Absensi");
    if (!found) return null;

    const rect = found.getBoundingClientRect();
    return {
      text: (found.innerText || found.textContent || "").trim(),
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
      tag: found.tagName
    };
  });

  if (item && item.width > 0 && item.height > 0) {
    await page.mouse.move(item.x, item.y);
    await waitHuman(250);
    await page.mouse.click(item.x, item.y);
    return `mouse:evaluate:${item.tag}`;
  }

  return null;
}

async function main() {
  console.log("=== SMARTWORK SIAGA ABSENSI OPEN V2 ===");

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

  if (!page) page = await context.newPage();

  await page.bringToFront().catch(() => {});
  await waitHuman(700);

  if (!safeUrl(page.url())) {
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await waitHuman(1500);
  }

  if (!safeUrl(page.url())) {
    throw new Error(`Domain tidak diizinkan: ${page.url()}`);
  }

  const beforeText = await bodyText(page);
  const isLogin =
    /\/login/i.test(page.url()) ||
    /Masukkan Nomor Akun|Masukan Kata Kunci|Masuk/i.test(beforeText.slice(0, 1200));

  if (isLogin) {
    step("login_check", "STOP", "Masih di halaman login. Jalankan npm run siaga:login-test dulu.");
    await cdpShot(context, page, "01-login-required");
    report.result = "STOP_LOGIN_REQUIRED";
    report.finalUrl = page.url();
    report.bodyPreview = beforeText.slice(0, 1200);
    await writeReport();
    return;
  }

  step("login_check", "OK", page.url());
  await cdpShot(context, page, "01-before-click-absensi");

  if (!/Absensi/i.test(beforeText)) {
    step("menu_absensi_visible", "WARN", "Teks Absensi belum terlihat di body. Pastikan sidebar terbuka.");
  } else {
    step("menu_absensi_visible", "OK", "Teks Absensi terlihat di sidebar.");
  }

  const clicked = await clickAbsensiPrecise(page);

  if (!clicked) {
    step("click_absensi", "FAILED", "Tidak menemukan teks Absensi untuk diklik.");
    await cdpShot(context, page, "02-absensi-not-found");
    report.result = "FAILED_ABSENSI_MENU_NOT_FOUND";
    report.finalUrl = page.url();
    report.bodyPreview = beforeText.slice(0, 1500);
    await writeReport();
    return;
  }

  step("click_absensi", "OK", clicked);

  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await waitHuman(3000);

  const afterText = await bodyText(page);
  report.finalUrl = page.url();
  report.bodyPreview = afterText.slice(0, 1800);

  const opened =
    /Absensi|Kehadiran|Hadir|Tidak Hadir|Tanggal|Jadwal/i.test(afterText) ||
    /absensi/i.test(page.url());

  if (opened) {
    step("absensi_page_detected", "OK", "Halaman/area Absensi terbuka atau terdeteksi.");
    await cdpShot(context, page, "03-absensi-opened");
    report.result = "OK_ABSENSI_OPENED";
  } else {
    step("absensi_page_detected", "WARN", "Klik berhasil, tapi halaman Absensi belum pasti.");
    await cdpShot(context, page, "03-after-click-unknown");
    report.result = "WARN_ABSENSI_CLICKED_UNKNOWN";
  }

  await writeReport();
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_ABSENSI=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
