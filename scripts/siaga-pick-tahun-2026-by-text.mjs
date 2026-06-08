import { chromium } from "playwright";
import fs from "fs";

const TARGET_YEAR = "2026";

const shotsDir = "shots";
const reportsDir = "reports";
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = `${reportsDir}/siaga-tahun-2026-${stamp}.json`;
const shotPath = `${shotsDir}/siaga-tahun-2026-${stamp}.png`;

function log(msg) {
  console.log(msg);
}

async function main() {
  log("SMARTWORK_MICRO_AGENT=Tahun 2026 by text");
  log("RULE=NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_SAVE");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0];
  const page = context.pages().find(p => !p.url().startsWith("chrome://")) || context.pages()[0];

  await page.bringToFront();
  await page.waitForTimeout(800);

  const currentUrl = page.url();
  log(`CURRENT_URL=${currentUrl}`);

  if (!currentUrl.includes("/guru/absensi/create")) {
    throw new Error("STOP: Agent hanya boleh jalan kalau sudah berada di form Tambah Absensi: /guru/absensi/create");
  }

  const result = await page.evaluate(async (TARGET_YEAR) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const visible = (el) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.visibility !== "hidden" &&
        style.display !== "none" &&
        rect.width > 0 &&
        rect.height > 0;
    };

    const norm = (text) => String(text || "").replace(/\s+/g, " ").trim();

    const all = Array.from(document.querySelectorAll("label, div, span, p, button"));
    const tahunTextNode = all.find(el => visible(el) && /^tahun$/i.test(norm(el.innerText || el.textContent)));

    if (!tahunTextNode) {
      return {
        ok: false,
        step: "find_label",
        reason: "Label Tahun tidak ditemukan"
      };
    }

    tahunTextNode.scrollIntoView({ block: "center", inline: "center" });
    await sleep(300);

    const labelRect = tahunTextNode.getBoundingClientRect();

    const candidates = Array.from(document.querySelectorAll("button, [role='combobox'], .select2-selection, input, select, div"))
      .filter(visible)
      .map(el => {
        const r = el.getBoundingClientRect();
        return {
          el,
          text: norm(el.innerText || el.value || el.textContent),
          tag: el.tagName,
          role: el.getAttribute("role") || "",
          cls: el.className || "",
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          distance: Math.abs(r.y - labelRect.y) + Math.max(0, r.x - labelRect.x)
        };
      })
      .filter(item => {
        const nearBelow = item.y >= labelRect.y - 10 && item.y <= labelRect.y + 140;
        const rightOrSameLine = item.x >= labelRect.x - 20;
        const usableSize = item.w >= 45 && item.h >= 24;
        return nearBelow && rightOrSameLine && usableSize;
      })
      .sort((a, b) => a.distance - b.distance);

    const targetBox =
      candidates.find(item => item.text.includes(TARGET_YEAR)) ||
      candidates.find(item => /pilih|tahun|select|--/i.test(item.text + " " + item.cls + " " + item.role)) ||
      candidates[0];

    if (!targetBox) {
      return {
        ok: false,
        step: "find_dropdown",
        reason: "Dropdown Tahun tidak ditemukan dekat label Tahun"
      };
    }

    targetBox.el.scrollIntoView({ block: "center", inline: "center" });
    targetBox.el.click();
    await sleep(700);

    const optionCandidates = Array.from(document.querySelectorAll("li, div, span, button, option, [role='option']"))
      .filter(visible)
      .map(el => ({
        el,
        text: norm(el.innerText || el.value || el.textContent),
        tag: el.tagName,
        role: el.getAttribute("role") || "",
      }))
      .filter(item => item.text === TARGET_YEAR || item.text.includes(TARGET_YEAR));

    if (!optionCandidates.length) {
      return {
        ok: false,
        step: "find_option",
        reason: `Option tahun ${TARGET_YEAR} tidak muncul setelah dropdown diklik`,
        dropdownText: targetBox.text
      };
    }

    optionCandidates[0].el.scrollIntoView({ block: "center", inline: "center" });
    optionCandidates[0].el.click();
    await sleep(600);

    const finalText = norm(targetBox.el.innerText || targetBox.el.value || targetBox.el.textContent);

    return {
      ok: true,
      step: "selected",
      selected: TARGET_YEAR,
      beforeDropdownText: targetBox.text,
      afterDropdownText: finalText,
      optionText: optionCandidates[0].text
    };
  }, TARGET_YEAR);

  await page.screenshot({ path: shotPath, fullPage: false });

  fs.writeFileSync(reportPath, JSON.stringify({
    agent: "MICRO-AGENT-001",
    task: "Pilih Tahun 2026 by text",
    rule: "NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_SAVE",
    url: currentUrl,
    result,
    screenshot: shotPath,
    createdAt: new Date().toISOString()
  }, null, 2));

  log(`REPORT=${reportPath}`);
  log(`SCREENSHOT=${shotPath}`);

  if (!result.ok) {
    console.log(JSON.stringify(result, null, 2));
    throw new Error(`STOP: Tahun 2026 belum berhasil. Step=${result.step}. Reason=${result.reason}`);
  }

  log("SMARTWORK_TAHUN_2026_BY_TEXT=OK");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error("SMARTWORK_TAHUN_2026_BY_TEXT=FAILED");
  console.error(err.message);
  process.exit(1);
});
