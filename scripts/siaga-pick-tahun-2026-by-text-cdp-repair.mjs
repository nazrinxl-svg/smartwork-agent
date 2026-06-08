import { chromium } from "playwright";
import fs from "fs";

const TARGET_YEAR = "2026";
const CDP_URL = "http://127.0.0.1:9222";

const shotsDir = "shots";
const reportsDir = "reports";
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = `${reportsDir}/siaga-tahun-2026-cdp-repair-${stamp}.json`;
const shotPath = `${shotsDir}/siaga-tahun-2026-cdp-repair-${stamp}.png`;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function main() {
  console.log("SMARTWORK_MICRO_AGENT=SIAGA_TAHUN_2026_BY_TEXT_CDP_REPAIR");
  console.log("RULE=NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_ARROW_DOWN_NO_AUTO_DATE_NO_SAVE");

  console.log("STEP=CHECK_CDP_JSON_VERSION");
  const versionRes = await fetch(`${CDP_URL}/json/version`);
  if (!versionRes.ok) {
    throw new Error(`STOP: Chrome debug port aktif tapi /json/version gagal. Status=${versionRes.status}`);
  }

  const version = await versionRes.json();
  console.log(`CDP_BROWSER=${version.Browser || "UNKNOWN"}`);
  console.log(`CDP_WEBSOCKET=${version.webSocketDebuggerUrl || "NO_WS_URL"}`);

  console.log("STEP=CONNECT_OVER_CDP_TIMEOUT_DISABLED");
  const browser = await chromium.connectOverCDP(CDP_URL, {
    timeout: 0
  });

  const contexts = browser.contexts();
  if (!contexts.length) {
    throw new Error("STOP: CDP connected tapi tidak ada browser context.");
  }

  const context = contexts[0];

  let pages = context.pages().filter(p => !p.url().startsWith("chrome://"));
  if (!pages.length) {
    throw new Error("STOP: Tidak ada tab aktif selain chrome://. Buka lagi form SIAGA Absensi yang sudah ada.");
  }

  let page =
    pages.find(p => p.url().includes("/guru/absensi/create")) ||
    pages.find(p => p.url().includes("/guru/absensi")) ||
    pages[pages.length - 1];

  await page.bringToFront();
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const currentUrl = page.url();
  console.log(`CURRENT_URL=${currentUrl}`);

  if (!currentUrl.includes("/guru/absensi/create")) {
    throw new Error("STOP: Agent hanya boleh jalan kalau sudah di form Tambah Absensi /guru/absensi/create. Tidak login/dashboard/tambah ulang.");
  }

  const result = await page.evaluate(async ({ TARGET_YEAR }) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

    const centerClick = (el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

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
    };

    const textNodes = Array.from(document.querySelectorAll("label, div, span, p, button, small, strong"))
      .filter(visible)
      .map(el => ({
        el,
        text: norm(el.innerText || el.textContent)
      }));

    const tahunLabel =
      textNodes.find(item => /^tahun$/i.test(item.text))?.el ||
      textNodes.find(item => /\btahun\b/i.test(item.text))?.el;

    if (!tahunLabel) {
      return {
        ok: false,
        step: "find_label_tahun",
        reason: "Label Tahun tidak ditemukan"
      };
    }

    tahunLabel.scrollIntoView({ block: "center", inline: "center" });
    await sleep(300);

    const labelRect = tahunLabel.getBoundingClientRect();

    const allControls = Array.from(document.querySelectorAll(
      "select, button, input, [role='combobox'], .select2-selection, .select2-selection__rendered, div, span"
    ))
      .filter(visible)
      .map(el => {
        const r = el.getBoundingClientRect();
        const text = norm(el.innerText || el.value || el.textContent);
        return {
          el,
          text,
          tag: el.tagName,
          role: el.getAttribute("role") || "",
          cls: String(el.className || ""),
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          distance: Math.abs(r.y - labelRect.y) + Math.abs(r.x - labelRect.x)
        };
      })
      .filter(item => {
        const nearY = item.y >= labelRect.y - 25 && item.y <= labelRect.y + 180;
        const usefulSize = item.w >= 45 && item.h >= 20;
        const likely =
          item.tag === "SELECT" ||
          item.role === "combobox" ||
          /select|selection|dropdown|tahun|pilih|202/i.test(`${item.text} ${item.cls} ${item.role}`);

        return nearY && usefulSize && likely;
      })
      .sort((a, b) => a.distance - b.distance);

    const tahunControl =
      allControls.find(item => item.text === TARGET_YEAR || item.text.includes(TARGET_YEAR)) ||
      allControls.find(item => /tahun|pilih|select|selection|combobox/i.test(`${item.text} ${item.cls} ${item.role}`)) ||
      allControls[0];

    if (!tahunControl) {
      return {
        ok: false,
        step: "find_tahun_control",
        reason: "Control/dropdown Tahun tidak ditemukan dekat label Tahun"
      };
    }

    tahunControl.el.scrollIntoView({ block: "center", inline: "center" });
    await sleep(250);

    if (tahunControl.tag === "SELECT") {
      const select = tahunControl.el;
      const option = Array.from(select.options || []).find(opt => {
        return norm(opt.textContent) === TARGET_YEAR || norm(opt.value) === TARGET_YEAR;
      });

      if (!option) {
        return {
          ok: false,
          step: "native_select_option_2026",
          reason: "Option 2026 tidak ditemukan di native select",
          controlText: tahunControl.text
        };
      }

      select.value = option.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));

      return {
        ok: true,
        step: "native_select_done",
        selected: TARGET_YEAR,
        optionText: norm(option.textContent),
        value: select.value
      };
    }

    centerClick(tahunControl.el);
    await sleep(900);

    const options = Array.from(document.querySelectorAll(
      "option, li, div, span, button, [role='option'], .select2-results__option, .dropdown-item"
    ))
      .filter(visible)
      .map(el => ({
        el,
        text: norm(el.innerText || el.value || el.textContent),
        tag: el.tagName,
        role: el.getAttribute("role") || "",
        cls: String(el.className || "")
      }))
      .filter(item => item.text === TARGET_YEAR);

    if (!options.length) {
      const visibleTexts = Array.from(document.querySelectorAll("li, div, span, button, option, [role='option']"))
        .filter(visible)
        .map(el => norm(el.innerText || el.value || el.textContent))
        .filter(Boolean)
        .slice(0, 100);

      return {
        ok: false,
        step: "find_option_text_2026",
        reason: "Teks option 2026 tidak ditemukan setelah dropdown Tahun dibuka",
        controlTextBefore: tahunControl.text,
        visibleTexts
      };
    }

    options[0].el.scrollIntoView({ block: "center", inline: "center" });
    await sleep(200);
    centerClick(options[0].el);
    await sleep(700);

    const afterText = norm(tahunControl.el.innerText || tahunControl.el.value || tahunControl.el.textContent);

    return {
      ok: true,
      step: "clicked_option_text_2026",
      selected: TARGET_YEAR,
      controlTextBefore: tahunControl.text,
      clickedOptionText: options[0].text,
      controlTextAfter: afterText
    };
  }, { TARGET_YEAR });

  await page.screenshot({
    path: shotPath,
    fullPage: false
  });

  fs.writeFileSync(reportPath, JSON.stringify({
    agent: "SIAGA_TAHUN_2026_BY_TEXT_CDP_REPAIR",
    rule: "NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_ARROW_DOWN_NO_AUTO_DATE_NO_SAVE",
    targetYear: TARGET_YEAR,
    url: currentUrl,
    result,
    screenshot: shotPath,
    createdAt: new Date().toISOString()
  }, null, 2));

  console.log(`REPORT=${reportPath}`);
  console.log(`SCREENSHOT=${shotPath}`);

  if (!result.ok) {
    console.log(JSON.stringify(result, null, 2));
    throw new Error(`STOP: Tahun 2026 belum berhasil. Step=${result.step}. Reason=${result.reason}`);
  }

  console.log("SMARTWORK_TAHUN_2026_FIXED_TEXT=OK_TAHUN_FIXED_TEXT_NO_SAVE");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error("SMARTWORK_TAHUN_2026_FIXED_TEXT=FAILED");
  console.error(err.message);
  process.exit(1);
});
