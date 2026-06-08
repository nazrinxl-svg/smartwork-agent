import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");

fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const beforeShot = path.join(shotsDir, `${stamp}-01-before-open-input-juni-2026.png`);
const afterShot = path.join(shotsDir, `${stamp}-02-after-open-input-juni-2026.png`);
const reportPath = path.join(reportsDir, `${stamp}-siaga-open-input-juni-2026.json`);

const TARGET = {
  sekolah: "SDN 4 DWI TUNGGAL",
  bulan: "Juni",
  tahun: "2026"
};

async function main() {
  console.log("SMARTWORK_AGENT=OPEN_INPUT_ABSENSI_JUNI_2026_ONLY");
  console.log("RULE=NO_ZOOM_NO_VIEWPORT_NO_SAVE_NO_DELETE_NO_UPLOAD");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("/guru/absensi")) ||
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id"));

  if (!page) throw new Error("STOP: Tab SIAGA tidak ditemukan.");

  await page.bringToFront();
  await page.waitForTimeout(700);

  const startUrl = page.url();
  console.log(`START_URL=${startUrl}`);

  if (!startUrl.includes("/guru/absensi")) {
    throw new Error("STOP: Belum berada di halaman Absensi. Agent ini tidak login/dashboard ulang.");
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

    if (!/Absensi/i.test(bodyText) || !/Tambah/i.test(bodyText) || !/Input/i.test(bodyText)) {
      return {
        ok: false,
        step: "page_check",
        reason: "Halaman list Absensi belum terlihat",
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

    const targetRow = rows.find(row =>
      row.text.includes(TARGET.sekolah) &&
      row.text.includes(TARGET.bulan) &&
      row.text.includes(TARGET.tahun)
    );

    if (!targetRow) {
      return {
        ok: false,
        step: "find_row",
        reason: "Row SDN 4 DWI TUNGGAL / Juni / 2026 tidak ditemukan",
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

    const inputButton =
      buttons.find(b => /^Input$/i.test(b.text)) ||
      buttons.find(b => /Input/i.test(b.text)) ||
      buttons.find(b => /input/i.test(b.href));

    if (!inputButton) {
      return {
        ok: false,
        step: "find_input_button",
        reason: "Tombol Input di row target tidak ditemukan",
        rowText: targetRow.text,
        buttons: buttons.map(b => ({
          index: b.index,
          text: b.text,
          href: b.href,
          className: b.className
        }))
      };
    }

    inputButton.el.scrollIntoView({ block: "center", inline: "center" });
    await sleep(300);

    const click = centerClick(inputButton.el);
    await sleep(1200);

    return {
      ok: true,
      step: "clicked_input",
      rowIndex: targetRow.index,
      rowText: targetRow.text,
      clickedText: inputButton.text,
      href: inputButton.href,
      click
    };
  }, { TARGET });

  await page.waitForTimeout(2500);

  const afterState = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
    const bodyText = clean(document.body.innerText || "");

    return {
      url: location.href,
      title: document.title || "",
      bodyPreview: bodyText.slice(0, 1800),
      hasInputPageSignals:
        /presensi|kehadiran|hadir|sakit|izin|alpa|siswa|tanggal|Input/i.test(bodyText)
    };
  });

  await page.screenshot({ path: afterShot, fullPage: false });
  console.log(`SCREENSHOT_AFTER=${afterShot}`);

  const ok = clickResult.ok && afterState.url !== startUrl;

  const report = {
    agent: "OPEN_INPUT_ABSENSI_JUNI_2026_ONLY",
    rule: "NO_ZOOM_NO_VIEWPORT_NO_SAVE_NO_DELETE_NO_UPLOAD",
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
    throw new Error("STOP: Tombol Input Juni 2026 belum berhasil diklik.");
  }

  console.log("SMARTWORK_OPEN_INPUT_JUNI_2026=OK_CLICKED_INPUT");
  console.log(JSON.stringify(afterState, null, 2));
}

main().catch(error => {
  console.error("SMARTWORK_OPEN_INPUT_JUNI_2026=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
