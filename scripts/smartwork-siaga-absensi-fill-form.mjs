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

const now = new Date();
const currentYear = String(now.getFullYear());
const monthNames = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];
const currentMonth = monthNames[now.getMonth()];

const report = {
  id: `siaga-absensi-fill-form-${stamp}`,
  target: "SIAGA Pendis Kemenag",
  mode: "absensi-fill-form-v1",
  dryRun: true,
  plannedValues: {
    sekolah: "first_available_or_sdn_4_dwi_tunggal",
    bulan: currentMonth,
    tahun: currentYear,
    statusCuti: "Tidak ada cuti"
  },
  safety: {
    action: "fill_form_only",
    saveAllowed: false,
    sendAllowed: false,
    deleteAllowed: false,
    noSubmit: true,
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
  const jsonFile = path.join(reportsDir, `${stamp}-siaga-absensi-fill-form.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-absensi-fill-form.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(
    mdFile,
    [
      "# SmartWork SIAGA Absensi Fill Form V1",
      "",
      "- Target: SIAGA Pendis Kemenag",
      "- Mode: absensi-fill-form-v1",
      `- Result: ${report.result || "UNKNOWN"}`,
      `- Bulan: ${currentMonth}`,
      `- Tahun: ${currentYear}`,
      "- Status Cuti: Tidak ada cuti",
      "- Save/Submit: disabled",
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
  console.log(`SMARTWORK_SIAGA_ABSENSI_FILL=${report.result || "UNKNOWN"}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function ensureTambahForm(page, context) {
  if (!safeUrl(page.url())) {
    throw new Error(`Domain tidak diizinkan: ${page.url()}`);
  }

  const text = await bodyText(page);

  const isLogin =
    /\/login/i.test(page.url()) ||
    /Masukkan Nomor Akun|Masukan Kata Kunci|Masuk/i.test(text.slice(0, 1200));

  if (isLogin) {
    return {
      ok: false,
      reason: "Masih di halaman login. Jalankan npm run siaga:login-test dulu."
    };
  }

  const hasForm =
    /Pilih Sekolah|Pilih Bulan|Pilih Tahun|Status Cuti|Tidak ada cuti|Ada cuti/i.test(text);

  if (hasForm) {
    return { ok: true, reason: "Form tambah absensi sudah terbuka." };
  }

  await page.goto(absensiUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
  await waitHuman(2000);

  const afterAbsensiText = await bodyText(page);

  if (/Pilih Sekolah|Pilih Bulan|Pilih Tahun|Status Cuti/i.test(afterAbsensiText)) {
    return { ok: true, reason: "Form tambah absensi terbuka setelah goto." };
  }

  const tambah = await page.locator('a:has-text("Tambah"), button:has-text("Tambah"), text=Tambah').first();

  try {
    if (await tambah.count()) {
      await tambah.scrollIntoViewIfNeeded().catch(() => {});
      await waitHuman(300);
      await tambah.click({ timeout: 7000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
      await waitHuman(2000);

      const afterTambahText = await bodyText(page);
      if (/Pilih Sekolah|Pilih Bulan|Pilih Tahun|Status Cuti/i.test(afterTambahText)) {
        return { ok: true, reason: "Form tambah absensi terbuka setelah klik Tambah." };
      }
    }
  } catch {}

  await cdpShot(context, page, "form-not-ready");
  return { ok: false, reason: "Form tambah absensi tidak ditemukan." };
}

async function getLabelControl(page, labelText) {
  return await page.evaluate((labelText) => {
    const labels = Array.from(document.querySelectorAll("label, td, th, div, span"));
    const label = labels.find((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      return text === labelText || text.includes(labelText);
    });

    if (!label) return null;

    const labelRect = label.getBoundingClientRect();

    const controls = Array.from(document.querySelectorAll("select, input, textarea, .select2-selection, .select2-container"));
    const candidates = controls
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          type: el.getAttribute("type") || "",
          id: el.id || "",
          name: el.getAttribute("name") || "",
          cls: el.className || "",
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
          distance: Math.abs((r.top + r.height / 2) - (labelRect.top + labelRect.height / 2)) + Math.max(0, r.left - labelRect.right)
        };
      })
      .filter((x) => x.width > 20 && x.height > 10 && x.left > labelRect.left)
      .sort((a, b) => a.distance - b.distance);

    return candidates[0] || null;
  }, labelText);
}

async function selectByLabel(page, labelText, desiredText, options = {}) {
  const control = await getLabelControl(page, labelText);

  if (!control) {
    step(`select_${labelText}`, "FAILED", "Control tidak ditemukan.");
    return false;
  }

  step(`control_${labelText}`, "OK", `${control.tag} name=${control.name} id=${control.id}`);

  const selector =
    control.id ? `#${CSS.escape(control.id)}` :
    control.name ? `[name="${control.name}"]` :
    null;

  // Native select path.
  if (control.tag === "SELECT" && selector) {
    const select = page.locator(selector).first();

    const optionData = await select.locator("option").evaluateAll((opts) =>
      opts.map((o) => ({
        value: o.value,
        text: (o.innerText || o.textContent || "").trim(),
        disabled: o.disabled
      }))
    ).catch(() => []);

    let selected = null;

    if (desiredText === "__FIRST_SCHOOL__") {
      selected =
        optionData.find((o) => !o.disabled && /SDN 4 DWI TUNGGAL|SD N 4 DWI TUNGGAL|SD NEGERI 4 DWI TUNGGAL/i.test(o.text)) ||
        optionData.find((o) => !o.disabled && !/Pilih|--|Select/i.test(o.text) && o.value);
    } else {
      selected = optionData.find((o) => !o.disabled && new RegExp(desiredText, "i").test(o.text));
    }

    if (!selected) {
      step(`select_${labelText}`, "FAILED", `Option tidak ditemukan: ${desiredText}`);
      return false;
    }

    await select.selectOption(selected.value);
    await select.dispatchEvent("change").catch(() => {});
    await waitHuman(600);

    step(`select_${labelText}`, "OK", selected.text);
    return true;
  }

  // Select2/custom dropdown path.
  await page.mouse.move(control.x, control.y);
  await waitHuman(200);
  await page.mouse.click(control.x, control.y);
  await waitHuman(700);

  const searchInput = page.locator('.select2-search__field, input[type="search"]').last();
  if (await searchInput.count().catch(() => 0)) {
    const keyword = desiredText === "__FIRST_SCHOOL__" ? "SDN 4" : desiredText;
    await searchInput.fill(keyword).catch(() => {});
    await waitHuman(800);
  }

  const optionText = desiredText === "__FIRST_SCHOOL__"
    ? /SDN 4 DWI TUNGGAL|SD N 4 DWI TUNGGAL|SD NEGERI 4 DWI TUNGGAL/i
    : new RegExp(desiredText, "i");

  const option = page.locator('.select2-results__option, li, div, span').filter({ hasText: optionText }).first();

  try {
    if (await option.count()) {
      await option.click({ timeout: 7000 });
      await waitHuman(700);
      step(`select_${labelText}`, "OK", desiredText);
      return true;
    }
  } catch {}

  step(`select_${labelText}`, "FAILED", `Dropdown option tidak ditemukan: ${desiredText}`);
  return false;
}

async function chooseNoCuti(page) {
  const radios = await page.locator('input[type="radio"]').count().catch(() => 0);

  if (radios > 0) {
    const noCutiRadio = page.locator('label:has-text("Tidak ada cuti") input[type="radio"], input[type="radio"]').first();
    try {
      await noCutiRadio.check({ timeout: 5000 });
      await waitHuman(300);
      step("status_cuti", "OK", "Tidak ada cuti dipilih via radio.");
      return true;
    } catch {}
  }

  const clicked = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("label, span, div"));
    const found = all.find((el) => (el.innerText || el.textContent || "").trim().includes("Tidak ada cuti"));
    if (!found) return null;
    const input = found.querySelector('input[type="radio"]');
    if (input) {
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return "input-inside-label";
    }

    const rect = found.getBoundingClientRect();
    return {
      x: rect.left + 12,
      y: rect.top + rect.height / 2
    };
  });

  if (clicked && typeof clicked === "object") {
    await page.mouse.click(clicked.x, clicked.y);
    await waitHuman(300);
    step("status_cuti", "OK", "Tidak ada cuti dipilih via koordinat label.");
    return true;
  }

  if (clicked) {
    step("status_cuti", "OK", "Tidak ada cuti dipilih.");
    return true;
  }

  step("status_cuti", "WARN", "Radio Tidak ada cuti tidak ditemukan.");
  return false;
}

async function main() {
  console.log("=== SMARTWORK SIAGA ABSENSI FILL FORM V1 ===");
  console.log(`TARGET_MONTH=${currentMonth}`);
  console.log(`TARGET_YEAR=${currentYear}`);

  let browser;
  try {
    browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  } catch {
    console.error("SMARTWORK_SIAGA_ABSENSI_FILL=FAILED");
    console.error("Chrome debug belum aktif. Jalankan dulu: npm run open:siaga");
    process.exit(1);
  }

  step("connect_chrome_debug", "OK", "Chrome CDP 9222");

  const context = browser.contexts()[0] || await browser.newContext();
  let page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0];

  if (!page) page = await context.newPage();

  await page.bringToFront().catch(() => {});
  await waitHuman(800);

  const ready = await ensureTambahForm(page, context);
  if (!ready.ok) {
    step("form_check", "STOP", ready.reason);
    report.result = "STOP_FORM_NOT_READY";
    report.finalUrl = page.url();
    report.bodyPreview = (await bodyText(page)).slice(0, 1500);
    await writeReport();
    return;
  }

  step("form_check", "OK", ready.reason);
  await cdpShot(context, page, "01-before-fill-form");

  const schoolOk = await selectByLabel(page, "Sekolah", "__FIRST_SCHOOL__");
  const monthOk = await selectByLabel(page, "Bulan", currentMonth);
  const yearOk = await selectByLabel(page, "Tahun", currentYear);
  const cutiOk = await chooseNoCuti(page);

  await waitHuman(900);
  await cdpShot(context, page, "02-after-fill-form-no-save");

  report.finalUrl = page.url();
  report.bodyPreview = (await bodyText(page)).slice(0, 2000);
  report.detected = {
    schoolOk,
    monthOk,
    yearOk,
    cutiOk,
    currentMonth,
    currentYear
  };

  if (schoolOk && monthOk && yearOk && cutiOk) {
    step("fill_result", "OK", "Sekolah, bulan, tahun, dan Tidak ada cuti sudah dipilih. Simpan tidak diklik.");
    report.result = "OK_FORM_FILLED_NO_SAVE";
  } else {
    step("fill_result", "WARN", `school=${schoolOk}, month=${monthOk}, year=${yearOk}, cuti=${cutiOk}`);
    report.result = "WARN_FORM_PARTIAL_FILLED_NO_SAVE";
  }

  await writeReport();
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_ABSENSI_FILL=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
