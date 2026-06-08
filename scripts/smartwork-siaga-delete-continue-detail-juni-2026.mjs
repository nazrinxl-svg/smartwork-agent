import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");

fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportsDir, `${stamp}-delete-continue-detail-absensi-juni-2026.json`);

const ABSENSI_ID = "8860825";
const DETAIL_URL = `https://siagapendis.kemenag.go.id/guru/absensi/detail/${ABSENSI_ID}`;

const TARGET_DATES = [
  "1","2","3","4","5","6",
  "8","9","10","11","12","13",
  "15","16","17","18","19","20",
  "22","23","24","25","26","27",
  "29","30"
];

const SKIP_DATES = ["7", "14", "21", "28"];

async function screenshot(page, name) {
  const file = path.join(shotsDir, `${stamp}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  console.log(`SCREENSHOT=${file}`);
  return file;
}

async function waitStable(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function ensureDetailList(page) {
  await waitStable(page);

  if (!page.url().includes(`/guru/absensi/detail/${ABSENSI_ID}`) || page.url().includes("/create")) {
    await page.goto(DETAIL_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    }).catch(() => {});
    await waitStable(page);
  }
}

async function getRowState(page, tanggal) {
  await ensureDetailList(page);

  return await page.evaluate(({ tanggal }) => {
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

        const links = Array.from(tr.querySelectorAll("a, button"))
          .filter(visible)
          .map((el, linkIndex) => ({
            linkIndex,
            text: clean(el.innerText || el.value || el.textContent),
            href: el.getAttribute("href") || "",
            className: String(el.className || ""),
            tag: el.tagName
          }));

        return {
          index,
          tanggal: parts[0],
          text,
          links
        };
      });

    const row = rows.find(r => r.tanggal === tanggal);

    if (!row) {
      return {
        ok: false,
        action: "not_found",
        tanggal,
        reason: `Row tanggal ${tanggal} tidak ditemukan`
      };
    }

    const filled =
      /\d{2}:\d{2}:\d{2}/.test(row.text) ||
      /Ubah/i.test(row.text);

    const hasDelete = row.links.some(x =>
      /hapus/i.test(x.text) ||
      /hapus|delete/i.test(`${x.href} ${x.className}`)
    );

    return {
      ok: true,
      tanggal,
      rowIndex: row.index,
      rowText: row.text,
      filled,
      hasDelete,
      links: row.links
    };
  }, { tanggal });
}

async function clickDeleteByLocator(page, tanggal) {
  await ensureDetailList(page);

  const rows = page.locator("tr");
  const count = await rows.count();

  let targetRow = null;
  let targetText = "";

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const text = (await row.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    const first = text.split(" ")[0];

    if (first === tanggal) {
      targetRow = row;
      targetText = text;
      break;
    }
  }

  if (!targetRow) {
    return {
      ok: false,
      step: "find_row_locator",
      reason: `Row tanggal ${tanggal} tidak ditemukan`
    };
  }

  const filled = /\d{2}:\d{2}:\d{2}/.test(targetText) || /Ubah/i.test(targetText);

  if (!filled) {
    return {
      ok: true,
      skipped: true,
      step: "already_empty",
      rowText: targetText
    };
  }

  const deleteButton = targetRow.locator('button:has-text("hapus"), button:has-text("Hapus"), a:has-text("hapus"), a:has-text("Hapus")').first();
  const deleteCount = await deleteButton.count();

  if (!deleteCount) {
    return {
      ok: false,
      step: "find_delete_locator",
      reason: `Tombol hapus tanggal ${tanggal} tidak ditemukan`,
      rowText: targetText
    };
  }

  const dialogs = [];

  page.once("dialog", async dialog => {
    dialogs.push({
      type: dialog.type(),
      message: dialog.message()
    });
    await dialog.accept();
  });

  await deleteButton.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);

  await deleteButton.click({ timeout: 10000 });

  // Penting: SIAGA reload/navigate setelah hapus. Jangan evaluate langsung.
  await waitStable(page);

  // Paksa balik ke list agar context baru bersih.
  await page.goto(DETAIL_URL, {
    waitUntil: "domcontentloaded",
    timeout: 45000
  }).catch(() => {});

  await waitStable(page);

  return {
    ok: true,
    step: "clicked_delete_locator",
    tanggal,
    rowText: targetText,
    dialogs,
    urlAfter: page.url()
  };
}

async function main() {
  console.log("SMARTWORK_AGENT=DELETE_CONTINUE_DETAIL_ABSENSI_JUNI_2026");
  console.log("RULE=CONTINUE_DELETE_SKIP_EMPTY_SKIP_MINGGU_NO_ZOOM_NO_VIEWPORT");
  console.log("SMART_RULE=WAIT_NAVIGATION_AFTER_DELETE_THEN_RETURN_TO_LIST");
  console.log(`TARGET_COUNT=${TARGET_DATES.length}`);
  console.log(`SKIP_DATES=${SKIP_DATES.join(",")}`);

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("/guru/absensi/detail")) ||
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id"));

  if (!page) throw new Error("STOP: Tab SIAGA tidak ditemukan.");

  await page.bringToFront();
  await ensureDetailList(page);

  const startUrl = page.url();
  console.log(`START_URL=${startUrl}`);

  const screenshots = [];
  const results = [];

  screenshots.push(await screenshot(page, "00-before-continue-delete"));

  for (const tanggal of TARGET_DATES) {
    console.log(`\n=== DELETE / SKIP TANGGAL ${tanggal} ===`);

    const before = await getRowState(page, tanggal);
    console.log("BEFORE=" + JSON.stringify(before, null, 2));

    if (!before.ok) {
      results.push({ tanggal, before, deleteResult: null, after: null, ok: false });
      screenshots.push(await screenshot(page, `error-before-${tanggal}`));
      break;
    }

    if (!before.filled) {
      results.push({
        tanggal,
        before,
        skipped: true,
        reason: "Sudah kosong / sudah terhapus sebelumnya",
        ok: true
      });
      continue;
    }

    if (!before.hasDelete) {
      results.push({
        tanggal,
        before,
        skipped: false,
        reason: "Terisi tapi tombol hapus tidak ditemukan",
        ok: false
      });
      screenshots.push(await screenshot(page, `error-no-delete-${tanggal}`));
      break;
    }

    const deleteResult = await clickDeleteByLocator(page, tanggal);
    console.log("DELETE_RESULT=" + JSON.stringify(deleteResult, null, 2));

    const after = await getRowState(page, tanggal);
    console.log("AFTER=" + JSON.stringify(after, null, 2));

    const okAfter = after.ok && after.filled === false;

    results.push({
      tanggal,
      before,
      deleteResult,
      after,
      ok: Boolean(deleteResult.ok && okAfter)
    });

    if (!deleteResult.ok || !okAfter) {
      screenshots.push(await screenshot(page, `error-delete-${tanggal}`));
      break;
    }

    await page.waitForTimeout(500);
  }

  screenshots.push(await screenshot(page, "99-after-continue-delete"));

  const finalState = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
    return {
      url: location.href,
      bodyPreview: clean(document.body.innerText || "").slice(0, 3600)
    };
  });

  const ok =
    results.length === TARGET_DATES.length &&
    results.every(r => r.ok);

  const report = {
    agent: "DELETE_CONTINUE_DETAIL_ABSENSI_JUNI_2026",
    rule: "CONTINUE_DELETE_SKIP_EMPTY_SKIP_MINGGU_NO_ZOOM_NO_VIEWPORT",
    smartRule: "WAIT_NAVIGATION_AFTER_DELETE_THEN_RETURN_TO_LIST",
    targetDates: TARGET_DATES,
    skipDates: SKIP_DATES,
    startUrl,
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
    throw new Error("STOP: Tidak semua target berhasil dihapus. Cek report.");
  }

  console.log("SMARTWORK_DELETE_CONTINUE_DETAIL_ABSENSI_JUNI_2026=OK");
}

main().catch(error => {
  console.error("SMARTWORK_DELETE_CONTINUE_DETAIL_ABSENSI_JUNI_2026=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
