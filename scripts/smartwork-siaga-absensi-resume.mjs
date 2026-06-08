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

const monthNames = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

const now = new Date();
const targetMonth = monthNames[now.getMonth()];
const targetYear = String(now.getFullYear());

const report = {
  id: `siaga-absensi-resume-${stamp}`,
  mode: "resume-current-session-no-login",
  dryRun: true,
  targetValues: {
    sekolah: "sekolah pertama tersedia",
    bulan: targetMonth,
    tahun: targetYear,
    statusCuti: "Tidak ada cuti"
  },
  safety: {
    noLoginRepeat: true,
    noSave: true,
    noSubmit: true,
    noDelete: true,
    noSend: true
  },
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

async function clickText(page, textValue) {
  const item = await page.evaluate((textValue) => {
    const all = Array.from(document.querySelectorAll("a, button, span, div, li"));
    const found = all.find((el) => {
      const t = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      return t === textValue || t === `+ ${textValue}` || t.includes(textValue);
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
  await wait(250);
  await page.mouse.click(item.x, item.y);
  step(`click_${textValue}`, "OK", item.text);
  return true;
}

async function ensureAbsensiForm(page, context) {
  let text = await bodyText(page);

  if (/\/login/i.test(page.url()) || /Masukkan Nomor Akun|Masukan Kata Kunci/i.test(text.slice(0, 1200))) {
    step("session_check", "STOP", "Masih di halaman login. Login dulu, lalu jalankan ulang script ini.");
    await shot(context, page, "01-login-page-stop");
    return false;
  }

  if (/Pilih Sekolah|Pilih Bulan|Pilih Tahun|Status Cuti/i.test(text)) {
    step("form_check", "OK", "Form Tambah Absensi sudah terbuka.");
    return true;
  }

  step("open_absensi", "OK", "Membuka /guru/absensi dengan session aktif.");
  await page.goto(absensiUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await wait(2500);

  text = await bodyText(page);

  if (/\/login/i.test(page.url()) || /Masukkan Nomor Akun|Masukan Kata Kunci/i.test(text.slice(0, 1200))) {
    step("session_check", "STOP", "Session habis. Login manual/siaga:login-test dulu.");
    await shot(context, page, "02-session-expired");
    return false;
  }

  if (/Pilih Sekolah|Pilih Bulan|Pilih Tahun|Status Cuti/i.test(text)) {
    step("form_check", "OK", "Form sudah terbuka setelah goto.");
    return true;
  }

  await shot(context, page, "02-absensi-before-tambah");

  const tambahClicked = await clickText(page, "Tambah");
  if (!tambahClicked) {
    step("click_tambah", "FAILED", "Tombol Tambah tidak ditemukan.");
    await shot(context, page, "03-tambah-not-found");
    return false;
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await wait(2500);

  text = await bodyText(page);

  if (/Pilih Sekolah|Pilih Bulan|Pilih Tahun|Status Cuti/i.test(text)) {
    step("form_check", "OK", "Form Tambah Absensi terbuka setelah klik Tambah.");
    return true;
  }

  step("form_check", "FAILED", "Klik Tambah sudah dilakukan, tapi form belum terdeteksi.");
  await shot(context, page, "04-form-not-detected");
  return false;
}

async function selectNativeByVisibleIndex(page, index, mode) {
  const result = await page.evaluate(({ index, mode, targetMonth, targetYear }) => {
    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    function visible(el) {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return r.width > 20 && r.height > 10 && s.display !== "none" && s.visibility !== "hidden";
    }

    const selects = Array.from(document.querySelectorAll("select")).filter(visible);
    const select = selects[index];

    if (!select) {
      return { ok: false, reason: `select index ${index} tidak ditemukan`, selectCount: selects.length };
    }

    const options = Array.from(select.options || []);
    let chosen = null;

    if (mode === "school") {
      chosen =
        options.find((o) => /DWI TUNGGAL|SDN 4|SD N 4|SD NEGERI 4/i.test(clean(o.textContent))) ||
        options.find((o) => o.value && !/Pilih|--|Select/i.test(clean(o.textContent)));
    }

    if (mode === "month") {
      chosen = options.find((o) => clean(o.textContent).toLowerCase() === targetMonth.toLowerCase());
    }

    if (mode === "year") {
      chosen = options.find((o) => clean(o.textContent) === targetYear || String(o.value) === targetYear);
    }

    if (!chosen) {
      return {
        ok: false,
        reason: `option ${mode} tidak ditemukan`,
        options: options.map((o) => clean(o.textContent))
      };
    }

    select.focus();
    select.value = chosen.value;
    select.selectedIndex = options.indexOf(chosen);

    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    select.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    if (window.jQuery) {
      window.jQuery(select).val(chosen.value).trigger("change");
    }

    return {
      ok: true,
      mode,
      value: chosen.value,
      text: clean(chosen.textContent),
      selectedIndex: select.selectedIndex,
      selectCount: selects.length
    };
  }, { index, mode, targetMonth, targetYear });

  step(`select_${mode}`, result.ok ? "OK" : "FAILED", result.ok ? result.text : result.reason);
  if (!result.ok && result.options) {
    console.log(`OPTIONS_${mode}=`);
    result.options.forEach((o) => console.log(`- ${o}`));
  }
  return result;
}

async function chooseNoCuti(page) {
  const result = await page.evaluate(() => {
    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    const labels = Array.from(document.querySelectorAll("label, span, div"));
    const label = labels.find((el) => /Tidak ada cuti/i.test(clean(el.innerText || el.textContent)));

    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));

    if (label) {
      const inside = label.querySelector('input[type="radio"]');
      if (inside) {
        inside.checked = true;
        inside.dispatchEvent(new Event("input", { bubbles: true }));
        inside.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, method: "inside-label" };
      }

      const lr = label.getBoundingClientRect();
      const near = radios
        .map((r) => {
          const rr = r.getBoundingClientRect();
          return {
            radio: r,
            score: Math.abs((rr.top + rr.height / 2) - (lr.top + lr.height / 2))
          };
        })
        .sort((a, b) => a.score - b.score)[0]?.radio;

      if (near) {
        near.checked = true;
        near.dispatchEvent(new Event("input", { bubbles: true }));
        near.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, method: "near-label" };
      }
    }

    if (radios[0]) {
      radios[0].checked = true;
      radios[0].dispatchEvent(new Event("input", { bubbles: true }));
      radios[0].dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, method: "first-radio-fallback" };
    }

    return { ok: false, method: "radio-not-found" };
  });

  step("select_cuti", result.ok ? "OK" : "FAILED", result.method);
  return result.ok;
}

async function debugSelects(page) {
  const data = await page.evaluate(() => {
    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    function visible(el) {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return r.width > 20 && r.height > 10 && s.display !== "none" && s.visibility !== "hidden";
    }

    return Array.from(document.querySelectorAll("select")).filter(visible).map((s, i) => ({
      index: i,
      value: s.value,
      selected: clean(s.options[s.selectedIndex]?.textContent || ""),
      options: Array.from(s.options).map((o) => clean(o.textContent))
    }));
  });

  report.selectDebug = data;
  console.log("=== SELECT DEBUG ===");
  data.forEach((s) => {
    console.log(`SELECT[${s.index}] selected=${s.selected} value=${s.value}`);
    s.options.forEach((o) => console.log(`  - ${o}`));
  });

  return data;
}

async function writeReport(page) {
  report.finalUrl = page.url();
  report.bodyPreview = (await bodyText(page)).slice(0, 1800);

  const jsonFile = path.join(reportsDir, `${stamp}-siaga-absensi-resume.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-absensi-resume.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(mdFile, [
    "# SIAGA Absensi Resume",
    "",
    `- Result: ${report.result}`,
    `- Bulan: ${targetMonth}`,
    `- Tahun: ${targetYear}`,
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
  console.log(`SMARTWORK_SIAGA_ABSENSI_RESUME=${report.result}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SMARTWORK SIAGA ABSENSI RESUME ===");
  console.log(`TARGET_MONTH=${targetMonth}`);
  console.log(`TARGET_YEAR=${targetYear}`);
  console.log("IMPORTANT: tidak login ulang, tidak klik Simpan.");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0];

  if (!page) throw new Error("Tab SIAGA tidak ditemukan. Jalankan npm run open:siaga dulu.");

  await page.bringToFront().catch(() => {});
  await wait(700);

  if (!safeUrl(page.url())) {
    throw new Error(`Domain tidak diizinkan: ${page.url()}`);
  }

  const ready = await ensureAbsensiForm(page, context);
  if (!ready) {
    report.result = "STOP_NOT_READY";
    await writeReport(page);
    return;
  }

  await shot(context, page, "01-form-before-fill");

  await debugSelects(page);

  const school = await selectNativeByVisibleIndex(page, 0, "school");
  await wait(700);

  const month = await selectNativeByVisibleIndex(page, 1, "month");
  await wait(700);

  const year = await selectNativeByVisibleIndex(page, 2, "year");
  await wait(700);

  const cuti = await chooseNoCuti(page);
  await wait(900);

  await debugSelects(page);
  await shot(context, page, "02-form-after-fill-no-save");

  if (school.ok && month.ok && year.ok && cuti) {
    step("final", "OK", "Form terisi. Tombol Simpan tidak diklik.");
    report.result = "OK_FILLED_NO_SAVE";
  } else {
    step("final", "WARN", `school=${school.ok}, month=${month.ok}, year=${year.ok}, cuti=${cuti}`);
    report.result = "WARN_PARTIAL_NO_SAVE";
  }

  await writeReport(page);
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_ABSENSI_RESUME=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
