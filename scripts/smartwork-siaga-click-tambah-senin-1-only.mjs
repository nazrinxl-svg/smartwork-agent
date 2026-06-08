import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");

fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const beforeShot = path.join(shotsDir, `${stamp}-01-before-click-tambah-senin-1.png`);
const afterShot = path.join(shotsDir, `${stamp}-02-after-click-tambah-senin-1.png`);
const reportPath = path.join(reportsDir, `${stamp}-siaga-click-tambah-senin-1.json`);

const TARGET = {
  tanggal: "1",
  hari: "Senin"
};

async function main() {
  console.log("SMARTWORK_AGENT=CLICK_TAMBAH_SENIN_TANGGAL_1_ONLY");
  console.log("RULE=NO_ZOOM_NO_VIEWPORT_NO_SAVE_NO_INPUT_JAM");

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
    throw new Error("STOP: Belum berada di halaman Detail Absensi. Agent ini tidak login/dashboard ulang.");
  }

  await page.screenshot({ path: beforeShot, fullPage: false });
  console.log(`SCREENSHOT_BEFORE=${beforeShot}`);

  const clickResult = await page.evaluate(async ({ TARGET }) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    function visible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    }

    function centerClick(el) {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;

      const opts = {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        view: window
      };

      el.dispatchEvent(new MouseEvent("mouseover", opts));
      el.dispatchEvent(new MouseEvent("mousemove", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));

      return { x, y };
    }

    const bodyText = clean(document.body.innerText || "");

    if (!/Detail Absensi/i.test(bodyText) || !/Juni 2026/i.test(bodyText) || !/Tambah/i.test(bodyText)) {
      return {
        ok: false,
        step: "page_check",
        reason: "Halaman Detail Absensi Juni 2026 belum terlihat",
        bodyPreview: bodyText.slice(0, 1200)
      };
    }

    const rows = Array.from(document.querySelectorAll("tr"))
      .filter(visible)
      .map((tr, index) => ({
        tr,
        index,
        text: clean(tr.innerText || tr.textContent)
      }));

    const targetRow = rows.find(row => {
      const parts = row.text.split(" ");
      return (
        row.text.includes(TARGET.hari) &&
        (
          row.text.startsWith(`${TARGET.tanggal} `) ||
          parts[0] === TARGET.tanggal
        )
      );
    });

    if (!targetRow) {
      return {
        ok: false,
        step: "find_row",
        reason: "Row tanggal 1 Senin tidak ditemukan",
        rows: rows.map(r => ({ index: r.index, text: r.text })).slice(0, 20)
      };
    }

    const buttons = Array.from(targetRow.tr.querySelectorAll("a, button"))
      .filter(visible)
      .map((el, index) => ({
        el,
        index,
        text: clean(el.innerText || el.value || el.textContent),
        href: el.getAttribute("href") || "",
        className: String(el.className || "")
      }));

    const tambahButton =
      buttons.find(b => /^Tambah$/i.test(b.text)) ||
      buttons.find(b => /Tambah/i.test(b.text)) ||
      buttons.find(b => /create|tambah|input/i.test(b.href));

    if (!tambahButton) {
      return {
        ok: false,
        step: "find_tambah_button",
        reason: "Tombol Tambah di row tanggal 1 Senin tidak ditemukan",
        rowText: targetRow.text,
        buttons: buttons.map(b => ({
          index: b.index,
          text: b.text,
          href: b.href,
          className: b.className
        }))
      };
    }

    tambahButton.el.scrollIntoView({ block: "center", inline: "center" });
    await sleep(300);

    const click = centerClick(tambahButton.el);
    await sleep(1200);

    return {
      ok: true,
      step: "clicked_tambah_senin_1",
      rowIndex: targetRow.index,
      rowText: targetRow.text,
      clickedText: tambahButton.text,
      href: tambahButton.href,
      click
    };
  }, { TARGET });

  await page.waitForTimeout(2000);

  const afterState = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
    const bodyText = clean(document.body.innerText || "");

    return {
      url: location.href,
      title: document.title || "",
      bodyPreview: bodyText.slice(0, 1800),
      hasFormSignal: /Jam Masuk|Jam Pulang|Simpan|Tanggal|Hadir|Presensi|Absensi/i.test(bodyText)
    };
  });

  await page.screenshot({ path: afterShot, fullPage: false });
  console.log(`SCREENSHOT_AFTER=${afterShot}`);

  const ok = clickResult.ok;

  const report = {
    agent: "CLICK_TAMBAH_SENIN_TANGGAL_1_ONLY",
    rule: "NO_ZOOM_NO_VIEWPORT_NO_SAVE_NO_INPUT_JAM",
    target: TARGET,
    startUrl,
    clickResult,
    afterState,
    ok,
    screenshots: [beforeShot, afterShot],
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`REPORT=${reportPath}`);

  if (!clickResult.ok) {
    console.log(JSON.stringify(report, null, 2));
    throw new Error("STOP: Tombol Tambah tanggal 1 Senin belum berhasil diklik.");
  }

  console.log("SMARTWORK_CLICK_TAMBAH_SENIN_1=OK");
  console.log(JSON.stringify(afterState, null, 2));
}

main().catch(error => {
  console.error("SMARTWORK_CLICK_TAMBAH_SENIN_1=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
