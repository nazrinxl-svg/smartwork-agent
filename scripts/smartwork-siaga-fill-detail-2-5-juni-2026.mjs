import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");

fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportsDir, `${stamp}-siaga-fill-detail-2-5-juni-2026.json`);

const TARGET_DAYS = [
  { tanggal: "2", date: "2026-06-02", hari: "Selasa", pulangStart: "14:15", pulangEnd: "14:30" },
  { tanggal: "3", date: "2026-06-03", hari: "Rabu", pulangStart: "14:15", pulangEnd: "14:30" },
  { tanggal: "4", date: "2026-06-04", hari: "Kamis", pulangStart: "14:15", pulangEnd: "14:30" },
  { tanggal: "5", date: "2026-06-05", hari: "Jum'at", pulangStart: "11:30", pulangEnd: "11:35" }
];

function pad(num) {
  return String(num).padStart(2, "0");
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomTimeRange(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startTotal = sh * 60 + sm;
  const endTotal = eh * 60 + em;
  const picked = randomInt(startTotal, endTotal);
  return `${pad(Math.floor(picked / 60))}:${pad(picked % 60)}`;
}

function jamMasukRandom() {
  // Aman: tidak lewat 07:00, dibuat 06:50-06:59 supaya tidak menyentuh batas 07:00 terus.
  return randomTimeRange("06:50", "06:59");
}

async function screenshot(page, name) {
  const file = path.join(shotsDir, `${stamp}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`SCREENSHOT=${file}`);
  return file;
}

async function openTambahForDate(page, target) {
  return await page.evaluate(async ({ target }) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    function visible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    }

    function click(el) {
      el.scrollIntoView({ block: "center", inline: "center" });
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
      el.dispatchEvent(new MouseEvent("mouseover", opts));
      el.dispatchEvent(new MouseEvent("mousemove", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
    }

    const rows = Array.from(document.querySelectorAll("tr"))
      .filter(visible)
      .map((tr, index) => ({
        tr,
        index,
        text: clean(tr.innerText || tr.textContent)
      }));

    const row = rows.find(r => {
      const parts = r.text.split(" ");
      return parts[0] === target.tanggal && r.text.includes(target.hari);
    });

    if (!row) {
      return {
        ok: false,
        step: "find_row",
        reason: `Row tanggal ${target.tanggal} ${target.hari} tidak ditemukan`,
        rows: rows.map(r => ({ index: r.index, text: r.text })).slice(0, 20)
      };
    }

    if (!row.text.includes("-")) {
      return {
        ok: true,
        skipped: true,
        step: "already_filled",
        reason: `Tanggal ${target.tanggal} sudah terisi, tidak klik Tambah`,
        rowText: row.text
      };
    }

    const buttons = Array.from(row.tr.querySelectorAll("a, button"))
      .filter(visible)
      .map(el => ({
        el,
        text: clean(el.innerText || el.value || el.textContent),
        href: el.getAttribute("href") || "",
        className: String(el.className || "")
      }));

    const tambah =
      buttons.find(b => /^Tambah$/i.test(b.text)) ||
      buttons.find(b => /Tambah/i.test(b.text)) ||
      buttons.find(b => /create/i.test(b.href));

    if (!tambah) {
      return {
        ok: false,
        step: "find_tambah",
        reason: `Tombol Tambah tanggal ${target.tanggal} tidak ditemukan`,
        rowText: row.text,
        buttons: buttons.map(b => ({ text: b.text, href: b.href, className: b.className }))
      };
    }

    click(tambah.el);
    await sleep(1200);

    return {
      ok: true,
      step: "clicked_tambah",
      rowIndex: row.index,
      rowText: row.text,
      clickedText: tambah.text,
      href: tambah.href
    };
  }, { target });
}

async function fillAndSaveTime(page, target, jamMasuk, jamPulang) {
  return await page.evaluate(async ({ target, jamMasuk, jamPulang }) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    function visible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    }

    function fire(el) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const tanggal = document.querySelector('input[name="tanggal"]');
    const masuk = document.querySelector('input[name="jam_masuk"]') || document.querySelector("#jam_masuk");
    const pulang = document.querySelector('input[name="jam_pulang"]') || document.querySelector("#jam_pulang");

    if (!tanggal || tanggal.value !== target.date) {
      return {
        ok: false,
        step: "verify_date",
        reason: `Form bukan tanggal ${target.date}`,
        tanggalValue: tanggal ? tanggal.value : null,
        url: location.href
      };
    }

    if (!masuk || !pulang) {
      return {
        ok: false,
        step: "find_time_inputs",
        reason: "Input jam_masuk/jam_pulang tidak ditemukan"
      };
    }

    masuk.focus();
    masuk.value = jamMasuk;
    fire(masuk);
    masuk.blur();

    pulang.focus();
    pulang.value = jamPulang;
    fire(pulang);
    pulang.blur();

    await sleep(400);

    const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a"))
      .filter(visible)
      .map(el => ({
        el,
        text: clean(el.innerText || el.value || el.textContent),
        type: el.getAttribute("type") || "",
        className: String(el.className || "")
      }));

    const simpan =
      buttons.find(b => /Simpan Detail Absensi/i.test(b.text)) ||
      buttons.find(b => /Simpan/i.test(b.text)) ||
      buttons.find(b => b.type === "submit");

    if (!simpan) {
      return {
        ok: false,
        step: "find_save_button",
        reason: "Tombol Simpan Detail Absensi tidak ditemukan",
        jamMasuk: masuk.value,
        jamPulang: pulang.value
      };
    }

    simpan.el.scrollIntoView({ block: "center", inline: "center" });
    await sleep(250);
    simpan.el.click();
    await sleep(1800);

    return {
      ok: true,
      step: "filled_and_clicked_save",
      tanggal: tanggal.value,
      jamMasuk: masuk.value,
      jamPulang: pulang.value,
      clickedText: simpan.text || simpan.type || "submit"
    };
  }, { target, jamMasuk, jamPulang });
}

async function main() {
  console.log("SMARTWORK_AGENT=FILL_DETAIL_ABSENSI_2_5_JUNI_2026");
  console.log("RULE=SAVE_ALLOWED_NO_ZOOM_NO_VIEWPORT");
  console.log("RANGE=TANGGAL_2_SAMPAI_5");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("/guru/absensi/detail")) ||
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id"));

  if (!page) throw new Error("STOP: Tab SIAGA tidak ditemukan.");

  await page.bringToFront();
  await page.waitForTimeout(700);

  const startUrl = page.url();
  console.log(`START_URL=${startUrl}`);

  if (!startUrl.includes("/guru/absensi/detail")) {
    throw new Error("STOP: Belum berada di halaman Detail Absensi Juni 2026.");
  }

  const screenshots = [];
  screenshots.push(await screenshot(page, "00-before-fill-2-5"));

  const results = [];

  for (const target of TARGET_DAYS) {
    console.log(`\n=== PROCESS ${target.date} ${target.hari} ===`);

    if (!page.url().includes("/guru/absensi/detail/8860825")) {
      console.log("WARN=URL detail id tidak sesuai, tetap lanjut berdasarkan halaman aktif.");
    }

    // Pastikan kalau masih di form create lama/sukses, kembali ke detail list dulu.
    if (page.url().includes("/create")) {
      await page.goto("https://siagapendis.kemenag.go.id/guru/absensi/detail/8860825", {
        waitUntil: "domcontentloaded",
        timeout: 45000
      }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    const jamMasuk = jamMasukRandom();
    const jamPulang = randomTimeRange(target.pulangStart, target.pulangEnd);

    const openResult = await openTambahForDate(page, target);
    console.log("OPEN_RESULT=" + JSON.stringify(openResult, null, 2));

    if (!openResult.ok) {
      results.push({ target, jamMasuk, jamPulang, openResult, saveResult: null, ok: false });
      screenshots.push(await screenshot(page, `error-open-${target.date}`));
      break;
    }

    if (openResult.skipped) {
      results.push({ target, skipped: true, openResult, ok: true });
      continue;
    }

    await page.waitForTimeout(1200);

    const saveResult = await fillAndSaveTime(page, target, jamMasuk, jamPulang);
    console.log("SAVE_RESULT=" + JSON.stringify(saveResult, null, 2));

    screenshots.push(await screenshot(page, `after-save-${target.date}`));

    results.push({
      target,
      jamMasuk,
      jamPulang,
      openResult,
      saveResult,
      ok: Boolean(saveResult.ok)
    });

    if (!saveResult.ok) {
      break;
    }

    await page.waitForTimeout(1200);

    // Kalau setelah save belum balik ke list, paksa balik ke detail list.
    if (page.url().includes("/create")) {
      await page.goto("https://siagapendis.kemenag.go.id/guru/absensi/detail/8860825", {
        waitUntil: "domcontentloaded",
        timeout: 45000
      }).catch(() => {});
      await page.waitForTimeout(1000);
    }
  }

  screenshots.push(await screenshot(page, "99-final-fill-2-5"));

  const finalState = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
    return {
      url: location.href,
      bodyPreview: clean(document.body.innerText || "").slice(0, 2400)
    };
  });

  const ok = results.length === TARGET_DAYS.length && results.every(r => r.ok);

  const report = {
    agent: "FILL_DETAIL_ABSENSI_2_5_JUNI_2026",
    rule: "SAVE_ALLOWED_NO_ZOOM_NO_VIEWPORT",
    startUrl,
    targets: TARGET_DAYS,
    results,
    finalState,
    ok,
    screenshots,
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`REPORT=${reportPath}`);

  if (!ok) {
    console.log(JSON.stringify(report, null, 2));
    throw new Error("STOP: Tidak semua tanggal 2-5 berhasil diisi/disimpan.");
  }

  console.log("SMARTWORK_FILL_DETAIL_2_5_JUNI_2026=OK");
}

main().catch(error => {
  console.error("SMARTWORK_FILL_DETAIL_2_5_JUNI_2026=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
