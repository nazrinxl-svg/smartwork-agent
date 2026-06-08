import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");

fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportsDir, `${stamp}-siaga-fill-week1-juni-2026-rabu-libur.json`);

const FALLBACK_ABSENSI_ID = "8860825";

const TARGET_DAYS = [
  { tanggal: "1", date: "2026-06-01", hari: "Senin",  pulangStart: "14:15", pulangEnd: "14:30" },
  { tanggal: "2", date: "2026-06-02", hari: "Selasa", pulangStart: "14:15", pulangEnd: "14:30" },
  { tanggal: "3", date: "2026-06-03", hari: "Rabu",   skip: true, reason: "Libur" },
  { tanggal: "4", date: "2026-06-04", hari: "Kamis",  pulangStart: "14:15", pulangEnd: "14:30" },
  { tanggal: "5", date: "2026-06-05", hari: "Jum'at", pulangStart: "11:30", pulangEnd: "11:35" },
  { tanggal: "6", date: "2026-06-06", hari: "Sabtu",  pulangStart: "15:15", pulangEnd: "15:30" }
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
  return randomTimeRange("06:50", "06:59");
}

function getAbsensiIdFromUrl(url) {
  const match = String(url).match(/\/guru\/absensi\/detail\/(\d+)/);
  return match ? match[1] : FALLBACK_ABSENSI_ID;
}

function dateFromUrl(url) {
  const match = String(url).match(/\/(\d{4}-\d{2}-\d{2})\/create/);
  return match ? match[1] : null;
}

async function screenshot(page, name) {
  const file = path.join(shotsDir, `${stamp}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  console.log(`SCREENSHOT=${file}`);
  return file;
}

async function waitStable(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function goList(page, detailUrl) {
  if (!page.url().includes(detailUrl) || page.url().includes("/create")) {
    await page.goto(detailUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    }).catch(() => {});
    await waitStable(page);
  }
}

async function getTambahHref(page, target) {
  return await page.evaluate(({ target }) => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    function visible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    }

    const rows = Array.from(document.querySelectorAll("tr"))
      .filter(visible)
      .map((tr, index) => {
        const text = clean(tr.innerText || tr.textContent);
        return { tr, index, text, tanggal: text.split(" ")[0] };
      });

    const row = rows.find(r => r.tanggal === target.tanggal && r.text.includes(target.hari));

    if (!row) {
      return {
        ok: false,
        step: "find_row",
        reason: `Row tanggal ${target.tanggal} ${target.hari} tidak ditemukan`,
        rows: rows.map(r => ({ index: r.index, text: r.text })).slice(0, 20)
      };
    }

    const alreadyFilled = /\d{2}:\d{2}:\d{2}/.test(row.text) || /Ubah/i.test(row.text);

    if (alreadyFilled) {
      return {
        ok: true,
        skipped: true,
        step: "already_filled",
        rowText: row.text
      };
    }

    const links = Array.from(row.tr.querySelectorAll("a, button"))
      .filter(visible)
      .map(el => ({
        text: clean(el.innerText || el.value || el.textContent),
        href: el.getAttribute("href") || "",
        className: String(el.className || "")
      }));

    const tambah =
      links.find(x => /^Tambah$/i.test(x.text)) ||
      links.find(x => /Tambah/i.test(x.text)) ||
      links.find(x => /create/i.test(x.href));

    if (!tambah) {
      return {
        ok: false,
        step: "find_tambah",
        reason: `Tombol Tambah tanggal ${target.tanggal} tidak ditemukan`,
        rowText: row.text,
        links
      };
    }

    return {
      ok: true,
      skipped: false,
      step: "found_tambah_href",
      rowText: row.text,
      href: tambah.href ? new URL(tambah.href, location.origin).href : null,
      text: tambah.text
    };
  }, { target });
}

async function fillTime(page, target, jamMasuk, jamPulang) {
  return await page.evaluate(({ target, jamMasuk, jamPulang }) => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

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

    return {
      ok: true,
      tanggal: tanggal.value,
      jamMasuk: masuk.value,
      jamPulang: pulang.value,
      bodyPreview: clean(document.body.innerText || "").slice(0, 800)
    };
  }, { target, jamMasuk, jamPulang });
}

async function clickSave(page) {
  const saveButton = page.locator('button:has-text("Simpan Detail Absensi")').first();
  const count = await saveButton.count();

  if (!count) {
    return { ok: false, reason: "Tombol Simpan Detail Absensi tidak ditemukan" };
  }

  await saveButton.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);

  await saveButton.click({ timeout: 10000 });
  await waitStable(page);

  return {
    ok: true,
    clickedText: "Simpan Detail Absensi",
    urlAfterClick: page.url()
  };
}

async function main() {
  console.log("SMARTWORK_AGENT=FILL_WEEK1_JUNI_2026_RABU_LIBUR");
  console.log("RULE=SAVE_ALLOWED_SKIP_RABU_LIBUR_NO_ZOOM_NO_VIEWPORT");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("/guru/absensi/detail")) ||
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id"));

  if (!page) throw new Error("STOP: Tab SIAGA tidak ditemukan.");

  await page.bringToFront();
  await waitStable(page);

  const startUrl = page.url();
  const absensiId = getAbsensiIdFromUrl(startUrl);
  const detailUrl = `https://siagapendis.kemenag.go.id/guru/absensi/detail/${absensiId}`;

  console.log(`START_URL=${startUrl}`);
  console.log(`ABSENSI_ID=${absensiId}`);

  if (!startUrl.includes("/guru/absensi/detail")) {
    throw new Error("STOP: Belum berada di halaman Detail Absensi.");
  }

  const screenshots = [];
  const results = [];

  screenshots.push(await screenshot(page, "00-before-week1-rabu-libur"));

  for (const target of TARGET_DAYS) {
    console.log(`\n=== PROCESS ${target.date} ${target.hari} ===`);

    if (target.skip) {
      console.log(`SKIP_LIBUR=${target.date} ${target.hari} ${target.reason}`);
      results.push({
        target,
        skipped: true,
        reason: target.reason,
        ok: true
      });
      continue;
    }

    const currentCreateDate = dateFromUrl(page.url());

    if (currentCreateDate && currentCreateDate !== target.date) {
      await goList(page, detailUrl);
    }

    if (!dateFromUrl(page.url())) {
      await goList(page, detailUrl);

      const hrefResult = await getTambahHref(page, target);
      console.log("HREF_RESULT=" + JSON.stringify(hrefResult, null, 2));

      if (!hrefResult.ok) {
        results.push({ target, hrefResult, ok: false });
        screenshots.push(await screenshot(page, `error-href-${target.date}`));
        break;
      }

      if (hrefResult.skipped) {
        results.push({
          target,
          skipped: true,
          reason: "Sudah terisi, dilewati",
          hrefResult,
          ok: true
        });
        continue;
      }

      if (!hrefResult.href) {
        results.push({ target, hrefResult, ok: false, reason: "href kosong" });
        break;
      }

      await page.goto(hrefResult.href, {
        waitUntil: "domcontentloaded",
        timeout: 45000
      });
      await waitStable(page);
    }

    const jamMasuk = jamMasukRandom();
    const jamPulang = randomTimeRange(target.pulangStart, target.pulangEnd);

    console.log(`JAM_MASUK=${jamMasuk}`);
    console.log(`JAM_PULANG=${jamPulang}`);

    const fillResult = await fillTime(page, target, jamMasuk, jamPulang);
    console.log("FILL_RESULT=" + JSON.stringify(fillResult, null, 2));

    screenshots.push(await screenshot(page, `before-save-${target.date}`));

    if (!fillResult.ok) {
      results.push({ target, jamMasuk, jamPulang, fillResult, ok: false });
      break;
    }

    const saveResult = await clickSave(page);
    console.log("SAVE_RESULT=" + JSON.stringify(saveResult, null, 2));

    screenshots.push(await screenshot(page, `after-save-${target.date}`));

    results.push({
      target,
      jamMasuk,
      jamPulang,
      fillResult,
      saveResult,
      ok: Boolean(saveResult.ok)
    });

    if (!saveResult.ok) break;

    await goList(page, detailUrl);
  }

  screenshots.push(await screenshot(page, "99-final-week1-rabu-libur"));

  const finalState = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
    return {
      url: location.href,
      bodyPreview: clean(document.body.innerText || "").slice(0, 2600)
    };
  });

  const ok = results.length === TARGET_DAYS.length && results.every(r => r.ok);

  const report = {
    agent: "FILL_WEEK1_JUNI_2026_RABU_LIBUR",
    rule: "SAVE_ALLOWED_SKIP_RABU_LIBUR_NO_ZOOM_NO_VIEWPORT",
    startUrl,
    absensiId,
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
    throw new Error("STOP: Tidak semua target minggu pertama berhasil diproses.");
  }

  console.log("SMARTWORK_FILL_WEEK1_JUNI_2026_RABU_LIBUR=OK");
}

main().catch(error => {
  console.error("SMARTWORK_FILL_WEEK1_JUNI_2026_RABU_LIBUR=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
