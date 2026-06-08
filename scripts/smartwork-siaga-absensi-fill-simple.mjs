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
  id: `siaga-absensi-fill-simple-v2-${stamp}`,
  mode: "fill-form-no-save",
  target: "SIAGA Pendis Absensi",
  dryRun: true,
  targetValues: {
    sekolah: "pilih sekolah tersedia",
    bulan: targetMonth,
    tahun: targetYear,
    statusCuti: "Tidak ada cuti"
  },
  safety: {
    noSave: true,
    noSubmit: true,
    noSend: true,
    noDelete: true
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

async function clickTambahIfNeeded(page) {
  const text = await bodyText(page);

  if (/Pilih Sekolah|Pilih Bulan|Pilih Tahun|Status Cuti/i.test(text)) {
    step("form_check", "OK", "Form tambah absensi sudah terbuka.");
    return true;
  }

  if (!/\/guru\/absensi/i.test(page.url())) {
    await page.goto(absensiUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await wait(2000);
  }

  const textAfterGoto = await bodyText(page);
  if (/Pilih Sekolah|Pilih Bulan|Pilih Tahun|Status Cuti/i.test(textAfterGoto)) {
    step("form_check", "OK", "Form tambah absensi sudah terbuka setelah goto.");
    return true;
  }

  const clicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("a, button, div, span"));
    const target = els.find((el) => {
      const t = (el.innerText || el.textContent || "").trim();
      return t === "Tambah" || t === "+ Tambah" || t.includes("Tambah");
    });

    if (!target) return null;

    const r = target.getBoundingClientRect();
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      text: (target.innerText || target.textContent || "").trim(),
      w: r.width,
      h: r.height
    };
  });

  if (!clicked || clicked.w <= 0 || clicked.h <= 0) {
    step("click_tambah", "FAILED", "Tombol Tambah tidak ditemukan.");
    return false;
  }

  await page.mouse.move(clicked.x, clicked.y);
  await wait(200);
  await page.mouse.click(clicked.x, clicked.y);
  step("click_tambah", "OK", clicked.text);

  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await wait(2200);

  const textAfterClick = await bodyText(page);
  if (/Pilih Sekolah|Pilih Bulan|Pilih Tahun|Status Cuti/i.test(textAfterClick)) {
    step("form_check", "OK", "Form tambah absensi terbuka.");
    return true;
  }

  step("form_check", "FAILED", "Form tambah belum terbuka.");
  return false;
}

async function fillNativeForm(page) {
  const result = await page.evaluate(({ targetMonth, targetYear }) => {
    function isVisible(el) {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return r.width > 20 && r.height > 10 && style.display !== "none" && style.visibility !== "hidden";
    }

    function norm(text) {
      return String(text || "").replace(/\s+/g, " ").trim();
    }

    function findLabel(labelText) {
      const els = Array.from(document.querySelectorAll("label, td, th, div, span, b, strong"));
      return els.find((el) => {
        const text = norm(el.innerText || el.textContent);
        return text === labelText || text.includes(labelText);
      });
    }

    function findSelectNearLabel(labelText) {
      const label = findLabel(labelText);
      const selects = Array.from(document.querySelectorAll("select")).filter(isVisible);

      if (!label) {
        return selects[0] || null;
      }

      const lr = label.getBoundingClientRect();

      const candidates = selects
        .map((select) => {
          const r = select.getBoundingClientRect();
          const sameRowScore = Math.abs((r.top + r.height / 2) - (lr.top + lr.height / 2));
          const rightScore = r.left >= lr.left ? 0 : 1000;
          return {
            select,
            score: sameRowScore + rightScore + Math.max(0, lr.right - r.left) / 10
          };
        })
        .sort((a, b) => a.score - b.score);

      return candidates[0]?.select || null;
    }

    function chooseOption(select, mode, wanted) {
      if (!select) return null;

      const options = Array.from(select.options || []);
      let option = null;

      if (mode === "school") {
        option =
          options.find((o) => /SDN 4 DWI TUNGGAL|SD N 4 DWI TUNGGAL|SD NEGERI 4 DWI TUNGGAL|DWI TUNGGAL/i.test(norm(o.textContent))) ||
          options.find((o) => o.value && !/Pilih|--|Select/i.test(norm(o.textContent)));
      }

      if (mode === "month") {
        option = options.find((o) => new RegExp(wanted, "i").test(norm(o.textContent)));
      }

      if (mode === "year") {
        option = options.find((o) => norm(o.textContent).includes(wanted) || String(o.value).includes(wanted));
      }

      if (!option) return null;

      select.value = option.value;
      select.selectedIndex = options.indexOf(option);

      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));

      return norm(option.textContent);
    }

    const sekolahSelect = findSelectNearLabel("Sekolah");
    const bulanSelect = findSelectNearLabel("Bulan");
    const tahunSelect = findSelectNearLabel("Tahun");

    const sekolah = chooseOption(sekolahSelect, "school");
    const bulan = chooseOption(bulanSelect, "month", targetMonth);
    const tahun = chooseOption(tahunSelect, "year", targetYear);

    let cuti = false;

    const labels = Array.from(document.querySelectorAll("label, span, div"));
    const noCutiLabel = labels.find((el) => /Tidak ada cuti/i.test(norm(el.innerText || el.textContent)));

    if (noCutiLabel) {
      const insideRadio = noCutiLabel.querySelector('input[type="radio"]');
      if (insideRadio) {
        insideRadio.checked = true;
        insideRadio.dispatchEvent(new Event("input", { bubbles: true }));
        insideRadio.dispatchEvent(new Event("change", { bubbles: true }));
        cuti = true;
      } else {
        const lr = noCutiLabel.getBoundingClientRect();
        const radios = Array.from(document.querySelectorAll('input[type="radio"]')).filter(isVisible);
        const nearRadio = radios
          .map((radio) => {
            const r = radio.getBoundingClientRect();
            return {
              radio,
              score: Math.abs((r.top + r.height / 2) - (lr.top + lr.height / 2))
            };
          })
          .sort((a, b) => a.score - b.score)[0]?.radio;

        if (nearRadio) {
          nearRadio.checked = true;
          nearRadio.dispatchEvent(new Event("input", { bubbles: true }));
          nearRadio.dispatchEvent(new Event("change", { bubbles: true }));
          cuti = true;
        }
      }
    }

    return {
      sekolah,
      bulan,
      tahun,
      cuti,
      allSelects: Array.from(document.querySelectorAll("select")).filter(isVisible).map((s) => ({
        value: s.value,
        text: norm(s.options[s.selectedIndex]?.textContent || "")
      }))
    };
  }, { targetMonth, targetYear });

  step("pilih_sekolah", result.sekolah ? "OK" : "FAILED", result.sekolah || "Belum terpilih");
  step("pilih_bulan", result.bulan ? "OK" : "FAILED", result.bulan || targetMonth);
  step("pilih_tahun", result.tahun ? "OK" : "FAILED", result.tahun || targetYear);
  step("pilih_status_cuti", result.cuti ? "OK" : "WARN", "Tidak ada cuti");
  step("debug_selects", "INFO", JSON.stringify(result.allSelects));

  report.selected = result;

  return Boolean(result.sekolah && result.bulan && result.tahun && result.cuti);
}

async function writeReport(page) {
  report.finalUrl = page.url();
  report.bodyPreview = (await bodyText(page)).slice(0, 1800);

  const jsonFile = path.join(reportsDir, `${stamp}-siaga-absensi-fill-simple-v2.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-absensi-fill-simple-v2.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(mdFile, [
    "# SIAGA Absensi Fill Simple V2",
    "",
    `- Result: ${report.result}`,
    `- Bulan target: ${targetMonth}`,
    `- Tahun target: ${targetYear}`,
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
  console.log(`SMARTWORK_SIAGA_ABSENSI_FILL_SIMPLE=${report.result}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SIAGA ABSENSI FILL SIMPLE V2 ===");
  console.log(`TARGET_MONTH=${targetMonth}`);
  console.log(`TARGET_YEAR=${targetYear}`);

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0] || await browser.newContext();

  let page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0] || await context.newPage();

  await page.bringToFront().catch(() => {});
  await wait(700);

  if (!safeUrl(page.url())) {
    throw new Error(`Domain tidak diizinkan: ${page.url()}`);
  }

  const text = await bodyText(page);
  if (/\/login/i.test(page.url()) || /Masukkan Nomor Akun|Masukan Kata Kunci/i.test(text.slice(0, 1200))) {
    step("login_check", "STOP", "Masih login page. Jalankan npm run siaga:login-test dulu.");
    await shot(context, page, "01-login-required");
    report.result = "STOP_LOGIN_REQUIRED";
    await writeReport(page);
    return;
  }

  const formReady = await clickTambahIfNeeded(page);

  if (!formReady) {
    report.result = "STOP_FORM_NOT_READY";
    await shot(context, page, "01-form-not-ready");
    await writeReport(page);
    return;
  }

  await shot(context, page, "01-before-fill");

  const ok = await fillNativeForm(page);

  await wait(1000);
  await shot(context, page, "02-after-fill-no-save");

  if (ok) {
    step("final", "OK", "Form terisi sesuai target. Tombol Simpan tidak diklik.");
    report.result = "OK_FORM_FILLED_NO_SAVE";
  } else {
    step("final", "WARN", "Form belum lengkap. Tombol Simpan tidak diklik.");
    report.result = "WARN_FORM_NOT_COMPLETE_NO_SAVE";
  }

  await writeReport(page);
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_ABSENSI_FILL_SIMPLE=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
