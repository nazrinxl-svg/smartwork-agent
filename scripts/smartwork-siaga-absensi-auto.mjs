import fs from "fs";
import path from "path";
import http from "http";
import { spawn } from "child_process";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");
const profileDir = path.join(root, "browser-profile", "chrome");

fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(profileDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const allowedHost = "siagapendis.kemenag.go.id";
const loginUrl = "https://siagapendis.kemenag.go.id/login";
const absensiUrl = "https://siagapendis.kemenag.go.id/guru/absensi";

const now = new Date();
const year = String(now.getFullYear());
const months = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];
const month = months[now.getMonth()];

const report = {
  id: `siaga-absensi-auto-${stamp}`,
  target: "SIAGA Pendis",
  mode: "auto-fill-no-save",
  dryRun: true,
  targetValues: {
    bulan: month,
    tahun: year,
    statusCuti: "Tidak ada cuti"
  },
  safety: {
    fillOnly: true,
    noSave: true,
    noSend: true,
    noDelete: true,
    noBypassCaptcha: true,
    noBypassOtp: true
  },
  steps: [],
  screenshots: []
};

function step(name, status, note = "") {
  report.steps.push({ time: new Date().toISOString(), name, status, note });
  console.log(`${name}: ${status}${note ? " - " + note : ""}`);
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

function checkChromeDebug() {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:9222/json/version", (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(900, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function openChromeIfNeeded() {
  const active = await checkChromeDebug();
  if (active) {
    step("chrome_debug", "OK", "Reuse Chrome debug 9222");
    return;
  }

  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe")
  ].filter(Boolean);

  const chromePath = candidates.find((p) => fs.existsSync(p));
  if (!chromePath) throw new Error("Google Chrome tidak ditemukan.");

  spawn(chromePath, [
    "--remote-debugging-port=9222",
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-popup-blocking",
    "--start-maximized",
    loginUrl
  ], { detached: true, stdio: "ignore" }).unref();

  step("chrome_debug", "OK", "Chrome baru dibuka");
  await wait(2500);
}

async function bodyText(page) {
  return await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
}

async function shot(context, page, name) {
  const file = path.join(shotsDir, `${stamp}-${name}.png`);
  try {
    await page.bringToFront().catch(() => {});
    await page.setViewportSize({ width: 1366, height: 768 }).catch(() => {});
    await wait(400);

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

async function first(page, selectors, timeout = 1500) {
  for (const selector of selectors) {
    const loc = page.locator(selector).first();
    try {
      if (await loc.count()) {
        await loc.waitFor({ state: "visible", timeout });
        return loc;
      }
    } catch {}
  }
  return null;
}

async function loginIfNeeded(page, context) {
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await wait(1800);

  let text = await bodyText(page);
  const loginVisible =
    /\/login/i.test(page.url()) &&
    /Masukkan Nomor Akun|Masukan Kata Kunci|Masuk/i.test(text.slice(0, 1500));

  if (!loginVisible) {
    step("login_check", "OK", `Sudah login atau redirect: ${page.url()}`);
    return true;
  }

  const username = process.env.SIAGA_USERNAME;
  const password = process.env.SIAGA_PASSWORD;

  if (!username || !password) {
    step("login_check", "STOP", ".env.local belum berisi SIAGA_USERNAME/SIAGA_PASSWORD");
    await shot(context, page, "01-login-required");
    return false;
  }

  if (/captcha|otp|kode keamanan|verifikasi|recaptcha/i.test(text)) {
    step("login_check", "STOP", "Ada verifikasi/CAPTCHA/OTP. Selesaikan manual.");
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

  await userInput.click();
  await userInput.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await userInput.press("Backspace");
  await userInput.pressSequentially(username, { delay: 80 });

  await passInput.click();
  await passInput.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await passInput.press("Backspace");
  await passInput.pressSequentially(password, { delay: 80 });

  step("login_fill", "OK", "Credential diisi dari .env.local, tidak disimpan ke report.");

  const btn = await first(page, [
    'button:has-text("Masuk")',
    'input[type="submit"]',
    'button[type="submit"]'
  ], 2500);

  if (btn) {
    await btn.click();
    step("login_submit", "OK", "Klik Masuk.");
  } else {
    await passInput.press("Enter");
    step("login_submit", "OK", "Enter dari password field.");
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await wait(3000);

  text = await bodyText(page);
  const stillLogin =
    /\/login/i.test(page.url()) &&
    /Masukkan Nomor Akun|Masukan Kata Kunci|Masuk/i.test(text.slice(0, 1500));

  if (stillLogin) {
    step("login_result", "FAILED", "Masih di login setelah submit.");
    await shot(context, page, "02-still-login");
    return false;
  }

  step("login_result", "OK", page.url());
  return true;
}

async function clickText(page, textValue) {
  const item = await page.evaluate((textValue) => {
    const all = Array.from(document.querySelectorAll("a, button, span, div, li"));
    const found = all.find((el) => {
      const t = (el.innerText || el.textContent || "").trim();
      return t === textValue || t === `+ ${textValue}` || t.includes(textValue);
    });

    if (!found) return null;
    const r = found.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: (found.innerText || found.textContent || "").trim(), w: r.width, h: r.height };
  }, textValue);

  if (!item || item.w <= 0 || item.h <= 0) return false;

  await page.mouse.move(item.x, item.y);
  await wait(250);
  await page.mouse.click(item.x, item.y);
  step(`click_${textValue}`, "OK", item.text);
  return true;
}

async function ensureAbsensiTambahForm(page, context) {
  await page.goto(absensiUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await wait(2200);

  let text = await bodyText(page);

  if (/Pilih Sekolah|Pilih Bulan|Pilih Tahun|Status Cuti/i.test(text)) {
    step("form_check", "OK", "Form tambah sudah terbuka.");
    return true;
  }

  if (!/Absensi|Tambah/i.test(text)) {
    step("absensi_page", "WARN", "Absensi belum pasti, tapi lanjut cari Tambah.");
  } else {
    step("absensi_page", "OK", "Halaman absensi terdeteksi.");
  }

  await shot(context, page, "03-absensi-page-before-tambah");

  const clicked = await clickText(page, "Tambah");
  if (!clicked) {
    step("click_tambah", "FAILED", "Tombol Tambah tidak ditemukan.");
    await shot(context, page, "04-tambah-not-found");
    return false;
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await wait(2200);

  text = await bodyText(page);

  if (/Pilih Sekolah|Pilih Bulan|Pilih Tahun|Status Cuti/i.test(text)) {
    step("form_check", "OK", "Form tambah terbuka setelah klik Tambah.");
    return true;
  }

  step("form_check", "FAILED", "Form tambah belum muncul setelah klik Tambah.");
  await shot(context, page, "04-form-not-opened");
  return false;
}

async function setSelectsAndRadio(page) {
  const result = await page.evaluate(({ month, year }) => {
    function visible(el) {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return r.width > 20 && r.height > 10 && style.display !== "none" && style.visibility !== "hidden";
    }

    function setSelect(select, matcher, fallbackFirst = false) {
      const options = Array.from(select.options || []);
      let opt = options.find((o) => matcher((o.textContent || "").trim(), o.value));
      if (!opt && fallbackFirst) {
        opt = options.find((o) => {
          const t = (o.textContent || "").trim();
          return o.value && !/Pilih|--|Select/i.test(t);
        });
      }
      if (!opt) return null;

      select.value = opt.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return (opt.textContent || "").trim();
    }

    const selects = Array.from(document.querySelectorAll("select")).filter(visible);

    const out = {
      visibleSelectCount: selects.length,
      sekolah: null,
      bulan: null,
      tahun: null,
      cuti: false
    };

    if (selects[0]) {
      out.sekolah = setSelect(
        selects[0],
        (text) => /SDN 4 DWI TUNGGAL|SD N 4 DWI TUNGGAL|SD NEGERI 4 DWI TUNGGAL/i.test(text),
        true
      );
    }

    if (selects[1]) {
      out.bulan = setSelect(selects[1], (text) => new RegExp(month, "i").test(text), false);
    }

    if (selects[2]) {
      out.tahun = setSelect(selects[2], (text, value) => text.includes(year) || value.includes(year), false);
    }

    const labels = Array.from(document.querySelectorAll("label, span, div"));
    const noCutiLabel = labels.find((el) => /Tidak ada cuti/i.test((el.innerText || el.textContent || "").trim()));

    if (noCutiLabel) {
      const inputInside = noCutiLabel.querySelector('input[type="radio"]');
      if (inputInside) {
        inputInside.checked = true;
        inputInside.dispatchEvent(new Event("input", { bubbles: true }));
        inputInside.dispatchEvent(new Event("change", { bubbles: true }));
        out.cuti = true;
      } else {
        const radio = Array.from(document.querySelectorAll('input[type="radio"]')).find((r) => {
          const rect = r.getBoundingClientRect();
          const labelRect = noCutiLabel.getBoundingClientRect();
          return Math.abs(rect.top - labelRect.top) < 35;
        }) || document.querySelector('input[type="radio"]');

        if (radio) {
          radio.checked = true;
          radio.dispatchEvent(new Event("input", { bubbles: true }));
          radio.dispatchEvent(new Event("change", { bubbles: true }));
          out.cuti = true;
        }
      }
    }

    return out;
  }, { month, year });

  step("fill_sekolah", result.sekolah ? "OK" : "FAILED", result.sekolah || "Tidak terpilih");
  step("fill_bulan", result.bulan ? "OK" : "FAILED", result.bulan || month);
  step("fill_tahun", result.tahun ? "OK" : "FAILED", result.tahun || year);
  step("fill_cuti", result.cuti ? "OK" : "WARN", "Tidak ada cuti");
  step("visible_select_count", "INFO", String(result.visibleSelectCount));

  return Boolean(result.sekolah && result.bulan && result.tahun && result.cuti);
}

async function writeReport(page) {
  report.finalUrl = page.url();
  report.bodyPreview = (await bodyText(page)).slice(0, 1800);

  const jsonFile = path.join(reportsDir, `${stamp}-siaga-absensi-auto.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-absensi-auto.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdFile, [
    "# SIAGA Absensi Auto Fill",
    "",
    `- Result: ${report.result}`,
    `- Bulan: ${month}`,
    `- Tahun: ${year}`,
    "- Simpan: tidak diklik",
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
  console.log(`SMARTWORK_SIAGA_ABSENSI_AUTO=${report.result}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SMARTWORK SIAGA ABSENSI AUTO FILL V1 ===");
  console.log(`TARGET_MONTH=${month}`);
  console.log(`TARGET_YEAR=${year}`);

  loadEnvLocal();
  await openChromeIfNeeded();

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0] || await browser.newContext();
  let page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0] || await context.newPage();

  await page.bringToFront().catch(() => {});
  await wait(700);

  const loggedIn = await loginIfNeeded(page, context);
  if (!loggedIn) {
    report.result = "STOP_LOGIN_FAILED_OR_REQUIRED";
    await writeReport(page);
    return;
  }

  const formReady = await ensureAbsensiTambahForm(page, context);
  if (!formReady) {
    report.result = "STOP_FORM_NOT_READY";
    await writeReport(page);
    return;
  }

  await shot(context, page, "05-before-fill");
  const filled = await setSelectsAndRadio(page);
  await wait(1200);
  await shot(context, page, "06-after-fill-no-save");

  if (filled) {
    step("final", "OK", "Form terisi. Tombol Simpan tidak diklik.");
    report.result = "OK_FORM_FILLED_NO_SAVE";
  } else {
    step("final", "WARN", "Form sebagian terisi. Tombol Simpan tidak diklik.");
    report.result = "WARN_FORM_PARTIAL_FILLED_NO_SAVE";
  }

  await writeReport(page);
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_ABSENSI_AUTO=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
