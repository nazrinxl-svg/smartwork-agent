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

const targetMonth = "Juni";
const targetYear = "2026";

const report = {
  id: `siaga-absensi-resume-v2-${stamp}`,
  mode: "strict-tambah-form-no-save",
  dryRun: true,
  targetValues: {
    bulan: targetMonth,
    tahun: targetYear,
    statusCuti: "Tidak ada cuti"
  },
  safety: {
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

function isTambahFormText(text) {
  return /Sekolah/i.test(text) &&
    /Bulan/i.test(text) &&
    /Tahun/i.test(text) &&
    /Status Cuti/i.test(text) &&
    /Simpan/i.test(text);
}

async function diagnoseSelects(page, label = "SELECT DEBUG") {
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
      name: s.name || "",
      id: s.id || "",
      value: s.value || "",
      selected: clean(s.options[s.selectedIndex]?.textContent || ""),
      options: Array.from(s.options || []).map((o) => ({
        value: o.value,
        text: clean(o.textContent)
      }))
    }));
  });

  console.log(`=== ${label} ===`);
  data.forEach((s) => {
    console.log(`SELECT[${s.index}] name=${s.name} id=${s.id} selected=${s.selected} value=${s.value}`);
    s.options.forEach((o) => console.log(`  - value=${o.value} text=${o.text}`));
  });

  return data;
}

async function clickTambahButton(page) {
  const clicked = await page.evaluate(() => {
    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    const candidates = Array.from(document.querySelectorAll("a, button"))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          el,
          text: clean(el.innerText || el.textContent || el.value),
          href: el.getAttribute("href") || "",
          cls: String(el.className || ""),
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          w: r.width,
          h: r.height,
          visible: r.width > 10 && r.height > 10 && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden"
        };
      })
      .filter((x) => x.visible);

    const target =
      candidates.find((x) => /^\+?\s*Tambah$/i.test(x.text)) ||
      candidates.find((x) => /Tambah/i.test(x.text) && /btn|success|primary/i.test(x.cls)) ||
      candidates.find((x) => /tambah|create|add/i.test(x.href));

    if (!target) {
      return {
        ok: false,
        visibleButtons: candidates.map((x) => ({ text: x.text, href: x.href, cls: x.cls })).slice(0, 30)
      };
    }

    return {
      ok: true,
      text: target.text,
      href: target.href,
      cls: target.cls,
      x: target.x,
      y: target.y
    };
  });

  if (!clicked.ok) {
    console.log("=== BUTTON DEBUG ===");
    for (const b of clicked.visibleButtons || []) {
      console.log(`button/link text="${b.text}" href="${b.href}" class="${b.cls}"`);
    }
    return false;
  }

  await page.mouse.move(clicked.x, clicked.y);
  await wait(250);
  await page.mouse.click(clicked.x, clicked.y);
  step("click_tambah", "OK", `text=${clicked.text} href=${clicked.href}`);
  return true;
}

async function ensureTambahForm(page, context) {
  let text = await bodyText(page);

  if (/\/login/i.test(page.url()) || /Masukkan Nomor Akun|Masukan Kata Kunci/i.test(text.slice(0, 1200))) {
    step("session_check", "STOP", "Masih di halaman login.");
    await shot(context, page, "01-login-stop");
    return false;
  }

  if (isTambahFormText(text)) {
    step("form_check", "OK", "Sudah di form Tambah Absensi.");
    return true;
  }

  step("open_absensi", "OK", "Membuka halaman Absensi.");
  await page.goto(absensiUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await wait(2500);

  text = await bodyText(page);

  if (isTambahFormText(text)) {
    step("form_check", "OK", "Form Tambah sudah terbuka setelah goto.");
    return true;
  }

  await shot(context, page, "02-before-click-tambah");
  await diagnoseSelects(page, "SELECT DEBUG BEFORE TAMBAH");

  const clicked = await clickTambahButton(page);
  if (!clicked) {
    step("click_tambah", "FAILED", "Tombol Tambah tidak ditemukan.");
    await shot(context, page, "03-tambah-not-found");
    return false;
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await wait(2500);

  text = await bodyText(page);

  if (isTambahFormText(text)) {
    step("form_check", "OK", "Form Tambah Absensi terbuka setelah klik Tambah.");
    await shot(context, page, "03-form-tambah-opened");
    return true;
  }

  step("form_check", "FAILED", "Setelah klik Tambah, form belum terdeteksi.");
  await shot(context, page, "03-after-tambah-not-form");
  await diagnoseSelects(page, "SELECT DEBUG AFTER TAMBAH FAILED");
  return false;
}

async function fillForm(page) {
  const result = await page.evaluate(({ targetMonth, targetYear }) => {
    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    function visible(el) {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return r.width > 20 && r.height > 10 && s.display !== "none" && s.visibility !== "hidden";
    }

    const selects = Array.from(document.querySelectorAll("select")).filter(visible);

    function selectByMatcher(index, matcher) {
      const select = selects[index];
      if (!select) return { ok: false, reason: `select ${index} not found` };

      const options = Array.from(select.options || []);
      const option = options.find((o) => matcher(clean(o.textContent), String(o.value || "")));

      if (!option) {
        return {
          ok: false,
          reason: `option not found`,
          selectName: select.name || "",
          selectId: select.id || "",
          options: options.map((o) => clean(o.textContent))
        };
      }

      select.value = option.value;
      select.selectedIndex = options.indexOf(option);

      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));

      if (window.jQuery) {
        window.jQuery(select).val(option.value).trigger("change");
      }

      return {
        ok: true,
        text: clean(option.textContent),
        value: option.value,
        selectName: select.name || "",
        selectId: select.id || ""
      };
    }

    const school = selectByMatcher(0, (text, value) => {
      return /DWI TUNGGAL|SDN 4|SD N 4|SD NEGERI 4/i.test(text) ||
        (value && !/Pilih|--|Select/i.test(text));
    });

    const month = selectByMatcher(1, (text) => text.toLowerCase() === targetMonth.toLowerCase());

    const year = selectByMatcher(2, (text, value) => text === targetYear || value === targetYear);

    let cuti = false;

    const labels = Array.from(document.querySelectorAll("label, span, div"));
    const noCutiLabel = labels.find((el) => /Tidak ada cuti/i.test(clean(el.innerText || el.textContent)));
    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));

    if (noCutiLabel) {
      const inside = noCutiLabel.querySelector('input[type="radio"]');
      if (inside) {
        inside.checked = true;
        inside.dispatchEvent(new Event("input", { bubbles: true }));
        inside.dispatchEvent(new Event("change", { bubbles: true }));
        cuti = true;
      } else if (radios[0]) {
        radios[0].checked = true;
        radios[0].dispatchEvent(new Event("input", { bubbles: true }));
        radios[0].dispatchEvent(new Event("change", { bubbles: true }));
        cuti = true;
      }
    } else if (radios[0]) {
      radios[0].checked = true;
      radios[0].dispatchEvent(new Event("input", { bubbles: true }));
      radios[0].dispatchEvent(new Event("change", { bubbles: true }));
      cuti = true;
    }

    return {
      selectCount: selects.length,
      school,
      month,
      year,
      cuti,
      selectedAfter: selects.map((s, i) => ({
        index: i,
        name: s.name || "",
        id: s.id || "",
        value: s.value || "",
        selected: clean(s.options[s.selectedIndex]?.textContent || "")
      }))
    };
  }, { targetMonth, targetYear });

  console.log("=== FILL RESULT ===");
  console.log(JSON.stringify(result, null, 2));

  step("select_count_form", result.selectCount >= 3 ? "OK" : "WARN", String(result.selectCount));
  step("select_school", result.school.ok ? "OK" : "FAILED", result.school.ok ? result.school.text : result.school.reason);
  step("select_month", result.month.ok ? "OK" : "FAILED", result.month.ok ? result.month.text : result.month.reason);
  step("select_year", result.year.ok ? "OK" : "FAILED", result.year.ok ? result.year.text : result.year.reason);
  step("select_cuti", result.cuti ? "OK" : "FAILED", "Tidak ada cuti");

  report.fillResult = result;

  return Boolean(result.school.ok && result.month.ok && result.year.ok && result.cuti);
}

async function writeReport(page) {
  report.finalUrl = page.url();
  report.bodyPreview = (await bodyText(page)).slice(0, 1800);

  const jsonFile = path.join(reportsDir, `${stamp}-siaga-absensi-resume-v2.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-absensi-resume-v2.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(mdFile, [
    "# SIAGA Absensi Resume V2",
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
  console.log(`SMARTWORK_SIAGA_ABSENSI_RESUME2=${report.result}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SMARTWORK SIAGA ABSENSI RESUME V2 ===");
  console.log(`TARGET_MONTH=${targetMonth}`);
  console.log(`TARGET_YEAR=${targetYear}`);
  console.log("Safety: NO SAVE");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0];

  if (!page) throw new Error("Tab SIAGA tidak ditemukan.");

  await page.bringToFront().catch(() => {});
  await wait(700);

  if (!safeUrl(page.url())) {
    throw new Error(`Domain tidak diizinkan: ${page.url()}`);
  }

  const ready = await ensureTambahForm(page, context);

  if (!ready) {
    report.result = "STOP_FORM_NOT_READY";
    await writeReport(page);
    return;
  }

  await shot(context, page, "04-before-fill-form");
  await diagnoseSelects(page, "SELECT DEBUG FORM BEFORE FILL");

  const ok = await fillForm(page);

  await wait(1000);
  await diagnoseSelects(page, "SELECT DEBUG FORM AFTER FILL");
  await shot(context, page, "05-after-fill-no-save");

  if (ok) {
    step("final", "OK", "Form Tambah terisi. Tombol Simpan tidak diklik.");
    report.result = "OK_FILLED_NO_SAVE";
  } else {
    step("final", "WARN", "Form belum lengkap. Tombol Simpan tidak diklik.");
    report.result = "WARN_PARTIAL_NO_SAVE";
  }

  await writeReport(page);
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_ABSENSI_RESUME2=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
