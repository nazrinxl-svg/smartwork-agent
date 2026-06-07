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
const absensiUrl = "https://siagapendis.kemenag.go.id/guru/absensi";

const report = {
  id: `siaga-absensi-tambah-${stamp}`,
  target: "SIAGA Pendis Kemenag",
  mode: "absensi-tambah-v1",
  dryRun: true,
  safety: {
    action: "click_tambah_only",
    saveAllowed: false,
    sendAllowed: false,
    deleteAllowed: false,
    inputAllowed: false,
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
    await waitHuman(350);

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
  const jsonFile = path.join(reportsDir, `${stamp}-siaga-absensi-tambah.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-absensi-tambah.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(
    mdFile,
    [
      "# SmartWork SIAGA Absensi Tambah V1",
      "",
      "- Target: SIAGA Pendis Kemenag",
      "- Mode: absensi-tambah-v1",
      `- Result: ${report.result || "UNKNOWN"}`,
      "- Action: click Tambah only",
      "- Input/Save/Send/Delete: disabled",
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
  console.log(`SMARTWORK_SIAGA_ABSENSI_TAMBAH=${report.result || "UNKNOWN"}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function clickTambahPrecise(page) {
  const selectors = [
    'a:has-text("Tambah")',
    'button:has-text("Tambah")',
    'span:has-text("Tambah")',
    'div:has-text("Tambah")',
    'text=Tambah'
  ];

  for (const selector of selectors) {
    try {
      const loc = page.locator(selector).filter({ hasText: /Tambah/i }).first();
      if (await loc.count()) {
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await waitHuman(250);

        const box = await loc.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
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

  const item = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("a, button, span, div"));
    const found = all.find((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      return text === "Tambah" || text === "+ Tambah" || text.includes("Tambah");
    });

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
    return `mouse:evaluate:${item.tag}:${item.text}`;
  }

  return null;
}

async function main() {
  console.log("=== SMARTWORK SIAGA ABSENSI TAMBAH V1 ===");

  let browser;
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  } catch {
    console.error("SMARTWORK_SIAGA_ABSENSI_TAMBAH=FAILED");
    console.error("Chrome debug belum aktif. Jalankan dulu: npm run open:siaga");
    process.exit(1);
  }

  step("connect_chrome_debug", "OK", "Chrome CDP 9222");

  const context = browser.contexts()[0] || await browser.newContext();
  let page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0];

  if (!page) page = await context.newPage();

  await page.bringToFront().catch(() => {});
  await waitHuman(600);

  if (!safeUrl(page.url())) {
    throw new Error(`Domain tidak diizinkan: ${page.url()}`);
  }

  if (!/\/guru\/absensi/i.test(page.url())) {
    step("open_absensi_url", "OK", "Membuka halaman absensi langsung.");
    await page.goto(absensiUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await waitHuman(2200);
  } else {
    step("open_absensi_url", "OK", "Sudah berada di halaman absensi.");
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

  if (!/Absensi|Petunjuk Upload Berkas Presensi|Tambah/i.test(beforeText)) {
    step("absensi_page_check", "WARN", "Halaman absensi belum pasti, tapi lanjut cek tombol Tambah.");
  } else {
    step("absensi_page_check", "OK", "Halaman Absensi terdeteksi.");
  }

  await cdpShot(context, page, "01-before-click-tambah");

  const clicked = await clickTambahPrecise(page);

  if (!clicked) {
    step("click_tambah", "FAILED", "Tombol Tambah tidak ditemukan.");
    await cdpShot(context, page, "02-tambah-not-found");
    report.result = "FAILED_TAMBAH_BUTTON_NOT_FOUND";
    report.finalUrl = page.url();
    report.bodyPreview = beforeText.slice(0, 1800);
    await writeReport();
    return;
  }

  step("click_tambah", "OK", clicked);

  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await waitHuman(2500);

  const afterText = await bodyText(page);
  report.finalUrl = page.url();
  report.bodyPreview = afterText.slice(0, 2000);

  const tambahOpened =
    /Tambah|Input|Presensi|Absensi|Bulan|Tahun|Sekolah|Tanggal|Simpan|Upload|Berkas/i.test(afterText) &&
    !/Masukkan Nomor Akun|Masukan Kata Kunci/i.test(afterText.slice(0, 1200));

  if (tambahOpened) {
    step("tambah_page_detected", "OK", "Form/halaman Tambah Absensi terdeteksi.");
    await cdpShot(context, page, "03-after-click-tambah");
    report.result = "OK_TAMBAH_OPENED";
  } else {
    step("tambah_page_detected", "WARN", "Klik Tambah dilakukan, tapi halaman/form belum pasti.");
    await cdpShot(context, page, "03-after-click-tambah-unknown");
    report.result = "WARN_TAMBAH_CLICKED_UNKNOWN";
  }

  await writeReport();
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_ABSENSI_TAMBAH=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
