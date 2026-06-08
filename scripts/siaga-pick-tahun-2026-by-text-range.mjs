import { chromium } from "playwright";
import fs from "fs";

const CDP_URL = "http://127.0.0.1:9222";
const TARGET_YEAR = "2026";

const reportsDir = "reports";
const shotsDir = "shots";
fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = `${reportsDir}/siaga-tahun-2026-text-range-${stamp}.json`;
const beforeShotPath = `${shotsDir}/siaga-tahun-2026-text-range-before-${stamp}.png`;
const afterShotPath = `${shotsDir}/siaga-tahun-2026-text-range-after-${stamp}.png`;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function main() {
  console.log("SMARTWORK_MICRO_AGENT=SIAGA_TAHUN_2026_BY_TEXT_RANGE");
  console.log("RULE=NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_ARROW_DOWN_NO_AUTO_DATE_NO_SAVE");

  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 0 });
  const pages = browser.contexts()
    .flatMap(ctx => ctx.pages())
    .filter(p => !p.url().startsWith("chrome://"));

  const page =
    pages.find(p => p.url().includes("/guru/absensi/create")) ||
    pages.find(p => p.url().includes("siagapendis.kemenag.go.id"));

  if (!page) {
    throw new Error("STOP: Tab SIAGA tidak ditemukan.");
  }

  await page.bringToFront();
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);

  const currentUrl = page.url();
  console.log(`CURRENT_URL=${currentUrl}`);

  if (!currentUrl.includes("/guru/absensi/create")) {
    throw new Error("STOP: Agent hanya boleh jalan kalau sudah di form Tambah Absensi /guru/absensi/create.");
  }

  await page.screenshot({ path: beforeShotPath, fullPage: false });

  const target = await page.evaluate(({ TARGET_YEAR }) => {
    const norm = (text) => String(text || "").replace(/\s+/g, " ").trim();

    const visible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.width > 0 &&
        rect.height > 0;
    };

    const tahunBlocks = Array.from(document.querySelectorAll("label, div, span, p, button, select"))
      .filter(visible)
      .map(el => {
        const rect = el.getBoundingClientRect();
        const text = norm(el.innerText || el.value || el.textContent);
        return {
          el,
          text,
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height,
          area: rect.width * rect.height
        };
      })
      .filter(item =>
        /Tahun/i.test(item.text) &&
        item.text.includes("2022") &&
        item.text.includes("2023") &&
        item.text.includes("2024") &&
        item.text.includes("2025") &&
        item.text.includes("2026")
      )
      .sort((a, b) => a.area - b.area);

    const tahunBlock = tahunBlocks[0];

    if (!tahunBlock) {
      return {
        ok: false,
        step: "find_tahun_block",
        reason: "Blok Tahun berisi 2022-2026 tidak ditemukan"
      };
    }

    tahunBlock.el.scrollIntoView({ block: "center", inline: "center" });

    const walker = document.createTreeWalker(
      tahunBlock.el,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = node.nodeValue || "";
          if (text.includes(TARGET_YEAR)) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    const matches = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.nodeValue || "";
      let start = text.indexOf(TARGET_YEAR);

      while (start !== -1) {
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + TARGET_YEAR.length);

        const rects = Array.from(range.getClientRects())
          .filter(r => r.width > 0 && r.height > 0);

        for (const rect of rects) {
          matches.push({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            rect: {
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            },
            nodeText: norm(text),
            blockText: tahunBlock.text
          });
        }

        start = text.indexOf(TARGET_YEAR, start + TARGET_YEAR.length);
      }
    }

    if (!matches.length) {
      return {
        ok: false,
        step: "find_text_range_2026",
        reason: "Teks 2026 ada di blok, tapi range posisi teks tidak bisa dihitung",
        blockText: tahunBlock.text
      };
    }

    const blockRect = tahunBlock.el.getBoundingClientRect();

    const validMatches = matches
      .filter(m =>
        m.x >= blockRect.left &&
        m.x <= blockRect.right &&
        m.y >= blockRect.top &&
        m.y <= blockRect.bottom
      )
      .sort((a, b) => b.x - a.x);

    const chosen = validMatches[0] || matches[0];

    return {
      ok: true,
      step: "text_range_found",
      clickX: chosen.x,
      clickY: chosen.y,
      targetYear: TARGET_YEAR,
      blockText: chosen.blockText,
      nodeText: chosen.nodeText,
      rect: chosen.rect
    };
  }, { TARGET_YEAR });

  if (!target.ok) {
    await page.screenshot({ path: afterShotPath, fullPage: false });

    fs.writeFileSync(reportPath, JSON.stringify({
      agent: "SIAGA_TAHUN_2026_BY_TEXT_RANGE",
      rule: "NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_ARROW_DOWN_NO_AUTO_DATE_NO_SAVE",
      url: currentUrl,
      result: target,
      beforeScreenshot: beforeShotPath,
      afterScreenshot: afterShotPath,
      createdAt: new Date().toISOString()
    }, null, 2));

    console.log(`REPORT=${reportPath}`);
    console.log(`SCREENSHOT_BEFORE=${beforeShotPath}`);
    console.log(`SCREENSHOT_AFTER=${afterShotPath}`);
    console.log(JSON.stringify(target, null, 2));
    throw new Error(`STOP: Tahun 2026 belum berhasil. Step=${target.step}. Reason=${target.reason}`);
  }

  console.log(`TEXT_RANGE_2026_X=${target.clickX}`);
  console.log(`TEXT_RANGE_2026_Y=${target.clickY}`);
  console.log(`TAHUN_BLOCK=${target.blockText}`);

  await page.mouse.move(target.clickX, target.clickY);
  await page.waitForTimeout(200);
  await page.mouse.down();
  await page.mouse.up();

  await page.waitForTimeout(1000);

  const verify = await page.evaluate(({ TARGET_YEAR }) => {
    const norm = (text) => String(text || "").replace(/\s+/g, " ").trim();

    const visible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.width > 0 &&
        rect.height > 0;
    };

    const texts = Array.from(document.querySelectorAll("label, div, span, p, button, select, option"))
      .filter(visible)
      .map(el => norm(el.innerText || el.value || el.textContent))
      .filter(Boolean);

    const tahunTexts = texts.filter(t => /Tahun/i.test(t) || t.includes(TARGET_YEAR));

    return {
      ok: true,
      selected: TARGET_YEAR,
      tahunTexts: tahunTexts.slice(0, 30)
    };
  }, { TARGET_YEAR });

  await page.screenshot({ path: afterShotPath, fullPage: false });

  const result = {
    ok: true,
    step: "clicked_2026_text_range",
    selected: TARGET_YEAR,
    clickTarget: target,
    verify,
    screenshotBefore: beforeShotPath,
    screenshotAfter: afterShotPath
  };

  fs.writeFileSync(reportPath, JSON.stringify({
    agent: "SIAGA_TAHUN_2026_BY_TEXT_RANGE",
    rule: "NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_ARROW_DOWN_NO_AUTO_DATE_NO_SAVE",
    url: currentUrl,
    result,
    createdAt: new Date().toISOString()
  }, null, 2));

  console.log(`REPORT=${reportPath}`);
  console.log(`SCREENSHOT_BEFORE=${beforeShotPath}`);
  console.log(`SCREENSHOT_AFTER=${afterShotPath}`);
  console.log("SMARTWORK_TAHUN_2026_TEXT_RANGE=OK_TAHUN_2026_CLICKED_NO_SAVE");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error("SMARTWORK_TAHUN_2026_TEXT_RANGE=FAILED");
  console.error(err.message);
  process.exit(1);
});
