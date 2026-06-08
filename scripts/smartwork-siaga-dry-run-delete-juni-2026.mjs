import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");

fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const shotPath = path.join(shotsDir, `${stamp}-dry-run-delete-juni-2026.png`);
const reportPath = path.join(reportsDir, `${stamp}-dry-run-delete-juni-2026.json`);

const ABSENSI_ID = "8860825";
const DETAIL_URL = `https://siagapendis.kemenag.go.id/guru/absensi/detail/${ABSENSI_ID}`;

const TARGET_DATES = new Set([
  "1","2","3","4","5","6",
  "8","9","10","11","12","13",
  "15","16","17","18","19","20",
  "22","23","24","25","26","27",
  "29","30"
]);

async function main() {
  console.log("SMARTWORK_AGENT=DRY_RUN_DELETE_DETAIL_ABSENSI_JUNI_2026");
  console.log("RULE=NO_DELETE_NO_ZOOM_NO_VIEWPORT");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("/guru/absensi/detail")) ||
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id"));

  if (!page) throw new Error("STOP: Tab SIAGA tidak ditemukan.");

  await page.bringToFront();
  await page.waitForTimeout(700);

  if (!page.url().includes(`/guru/absensi/detail/${ABSENSI_ID}`) || page.url().includes("/create")) {
    await page.goto(DETAIL_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1000);
  }

  const currentUrl = page.url();
  console.log(`CURRENT_URL=${currentUrl}`);

  const result = await page.evaluate(({ targetDates }) => {
    const targets = new Set(targetDates);
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
        const parts = text.split(" ");
        const tanggal = parts[0];

        const links = Array.from(tr.querySelectorAll("a, button"))
          .filter(visible)
          .map(el => ({
            text: clean(el.innerText || el.value || el.textContent),
            href: el.getAttribute("href") || "",
            className: String(el.className || "")
          }));

        const filled = /\d{2}:\d{2}:\d{2}/.test(text) || /Ubah/i.test(text);
        const hasDelete = links.some(x => /hapus/i.test(x.text) || /hapus|delete/i.test(x.href + " " + x.className));
        const isTarget = targets.has(tanggal);

        return {
          index,
          tanggal,
          text,
          filled,
          hasDelete,
          isTarget,
          links
        };
      });

    const deleteTargets = rows.filter(r => r.isTarget && r.filled && r.hasDelete);
    const skippedTargets = rows.filter(r => r.isTarget && (!r.filled || !r.hasDelete));

    return {
      ok: true,
      deleteCount: deleteTargets.length,
      deleteTargets: deleteTargets.map(r => ({
        index: r.index,
        tanggal: r.tanggal,
        text: r.text,
        links: r.links
      })),
      skippedTargets: skippedTargets.map(r => ({
        index: r.index,
        tanggal: r.tanggal,
        text: r.text,
        filled: r.filled,
        hasDelete: r.hasDelete
      })),
      allTargetRows: rows.filter(r => r.isTarget).map(r => ({
        tanggal: r.tanggal,
        text: r.text,
        filled: r.filled,
        hasDelete: r.hasDelete
      }))
    };
  }, { targetDates: Array.from(TARGET_DATES) });

  await page.screenshot({ path: shotPath, fullPage: false });

  const report = {
    agent: "DRY_RUN_DELETE_DETAIL_ABSENSI_JUNI_2026",
    rule: "NO_DELETE_NO_ZOOM_NO_VIEWPORT",
    url: currentUrl,
    result,
    screenshot: shotPath,
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`REPORT=${reportPath}`);
  console.log(`SCREENSHOT=${shotPath}`);
  console.log(`DELETE_TARGET_COUNT=${result.deleteCount}`);

  console.log("\n=== TARGET YANG AKAN DIHAPUS JIKA DIIZINKAN ===");
  for (const row of result.deleteTargets) {
    console.log(`Tanggal ${row.tanggal}: ${row.text}`);
  }

  console.log("\nSMARTWORK_DRY_RUN_DELETE_JUNI_2026=OK_NO_DELETE");
}

main().catch(error => {
  console.error("SMARTWORK_DRY_RUN_DELETE_JUNI_2026=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
