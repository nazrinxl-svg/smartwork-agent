import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");

fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportsDir, `${stamp}-delete-final-detail-absensi-juni-2026.json`);

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
  await page.screenshot({ path: file, fullPage: false });
  console.log(`SCREENSHOT=${file}`);
  return file;
}

async function ensureDetailList(page) {
  if (!page.url().includes(`/guru/absensi/detail/${ABSENSI_ID}`) || page.url().includes("/create")) {
    await page.goto(DETAIL_URL, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });
    await page.waitForTimeout(1000);
  }
}

async function getRowState(page, tanggal) {
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
          .map(el => ({
            text: clean(el.innerText || el.value || el.textContent),
            href: el.getAttribute("href") || "",
            className: String(el.className || ""),
            tag: el.tagName
          }));

        return {
          tr,
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

async function clickDeleteForDate(page, tanggal) {
  const dialogMessages = [];

  page.once("dialog", async dialog => {
    dialogMessages.push({
      type: dialog.type(),
      message: dialog.message()
    });
    await dialog.accept();
  });

  const result = await page.evaluate(async ({ tanggal }) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    function visible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    }

    function centerClick(el) {
      el.scrollIntoView({ block: "center", inline: "center" });

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

    const rows = Array.from(document.querySelectorAll("tr"))
      .filter(visible)
      .map((tr, index) => {
        const text = clean(tr.innerText || tr.textContent);
        const parts = text.split(" ");
        return { tr, index, tanggal: parts[0], text };
      });

    const row = rows.find(r => r.tanggal === tanggal);

    if (!row) {
      return {
        ok: false,
        step: "find_row",
        reason: `Row tanggal ${tanggal} tidak ditemukan`
      };
    }

    const filled =
      /\d{2}:\d{2}:\d{2}/.test(row.text) ||
      /Ubah/i.test(row.text);

    if (!filled) {
      return {
        ok: true,
        skipped: true,
        step: "already_empty",
        rowText: row.text
      };
    }

    const buttons = Array.from(row.tr.querySelectorAll("a, button"))
      .filter(visible)
      .map(el => ({
        el,
        text: clean(el.innerText || el.value || el.textContent),
        href: el.getAttribute("href") || "",
        className: String(el.className || ""),
        tag: el.tagName
      }));

    const del =
      buttons.find(b => /^hapus$/i.test(b.text)) ||
      buttons.find(b => /hapus/i.test(b.text)) ||
      buttons.find(b => /hapus|delete/i.test(`${b.href} ${b.className}`));

    if (!del) {
      return {
        ok: false,
        step: "find_delete",
        reason: `Tombol hapus tanggal ${tanggal} tidak ditemukan`,
        rowText: row.text,
        buttons: buttons.map(b => ({
          text: b.text,
          href: b.href,
          className: b.className,
          tag: b.tag
        }))
      };
    }

    const click = centerClick(del.el);
    await sleep(1200);

    return {
      ok: true,
      step: "clicked_delete",
      tanggal,
      rowText: row.text,
      clickedText: del.text,
      href: del.href,
      className: del.className,
      click
    };
  }, { tanggal });

  await page.waitForLoadState("domcontentloaded", { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(1200);

  return {
    ...result,
    dialogMessages,
    urlAfter: page.url()
  };
}

async function main() {
  console.log("SMARTWORK_AGENT=DELETE_FINAL_DETAIL_ABSENSI_JUNI_2026");
  console.log("RULE=DELETE_ALLOWED_TARGET_ONLY_SKIP_MINGGU_NO_ZOOM_NO_VIEWPORT");
  console.log(`TARGET_COUNT=${TARGET_DATES.length}`);
  console.log(`SKIP_DATES=${SKIP_DATES.join(",")}`);

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("/guru/absensi/detail")) ||
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id"));

  if (!page) throw new Error("STOP: Tab SIAGA tidak ditemukan.");

  await page.bringToFront();
  await page.waitForTimeout(700);

  await ensureDetailList(page);

  const startUrl = page.url();
  console.log(`START_URL=${startUrl}`);

  const screenshots = [];
  const results = [];

  screenshots.push(await screenshot(page, "00-before-delete-final"));

  for (const tanggal of TARGET_DATES) {
    console.log(`\n=== DELETE TANGGAL ${tanggal} ===`);

    await ensureDetailList(page);

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
        reason: "Sudah kosong / belum terisi",
        ok: true
      });
      continue;
    }

    if (!before.hasDelete) {
      results.push({
        tanggal,
        before,
        skipped: false,
        reason: "Terisi tapi tombol hapus tidak ada",
        ok: false
      });
      screenshots.push(await screenshot(page, `error-no-delete-${tanggal}`));
      break;
    }

    const deleteResult = await clickDeleteForDate(page, tanggal);
    console.log("DELETE_RESULT=" + JSON.stringify(deleteResult, null, 2));

    await ensureDetailList(page);

    const after = await getRowState(page, tanggal);
    console.log("AFTER=" + JSON.stringify(after, null, 2));

    const okAfter =
      after.ok &&
      after.filled === false;

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

  screenshots.push(await screenshot(page, "99-after-delete-final"));

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
    agent: "DELETE_FINAL_DETAIL_ABSENSI_JUNI_2026",
    rule: "DELETE_ALLOWED_TARGET_ONLY_SKIP_MINGGU_NO_ZOOM_NO_VIEWPORT",
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

  console.log("SMARTWORK_DELETE_FINAL_DETAIL_ABSENSI_JUNI_2026=OK");
}

main().catch(error => {
  console.error("SMARTWORK_DELETE_FINAL_DETAIL_ABSENSI_JUNI_2026=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
