import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportsDir, `${stamp}-siaga-click-open-school-option.json`);
const beforeShot = path.join(shotsDir, `${stamp}-01-before-click-open-school-option.png`);
const afterShot = path.join(shotsDir, `${stamp}-02-after-click-open-school-option-no-save.png`);

async function shot(context, page, file) {
  await page.bringToFront().catch(() => {});
  await page.setViewportSize({ width: 1366, height: 768 }).catch(() => {});
  await page.waitForTimeout(250);

  const session = await context.newCDPSession(page);
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false
  });

  fs.writeFileSync(file, Buffer.from(result.data, "base64"));
  console.log(`SCREENSHOT=${file}`);
}

async function main() {
  console.log("SMARTWORK_MICRO_AGENT=CLICK_OPEN_SCHOOL_OPTION_ONLY");
  console.log("RULE=NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_CHANGE_BULAN_NO_CHANGE_TAHUN_NO_SAVE");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("/guru/absensi/create")) ||
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id"));

  if (!page) throw new Error("STOP: Tab SIAGA tidak ditemukan.");

  await page.bringToFront();
  await page.waitForTimeout(500);

  const currentUrl = page.url();
  console.log(`CURRENT_URL=${currentUrl}`);

  if (!currentUrl.includes("/guru/absensi/create")) {
    throw new Error("STOP: Belum di form Tambah Absensi.");
  }

  await shot(context, page, beforeShot);

  const result = await page.evaluate(async () => {
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

    const candidates = Array.from(document.querySelectorAll("li, div, span, a, button, [role='option'], .select2-results__option"))
      .filter(visible)
      .map(el => {
        const r = el.getBoundingClientRect();
        return {
          el,
          text: clean(el.innerText || el.textContent),
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          area: r.width * r.height,
          cls: String(el.className || ""),
          role: el.getAttribute("role") || ""
        };
      })
      .filter(item => /SDN 4 DWI TUNGGAL/i.test(item.text))
      .sort((a, b) => a.area - b.area);

    if (!candidates.length) {
      return {
        ok: false,
        reason: "Option SDN 4 DWI TUNGGAL tidak terlihat/terbuka",
        visibleTextPreview: clean(document.body.innerText || "").slice(0, 1500)
      };
    }

    const target = candidates[0];
    target.el.scrollIntoView({ block: "center", inline: "center" });
    await sleep(200);

    const click = centerClick(target.el);
    await sleep(800);

    return {
      ok: true,
      clickedText: target.text,
      click,
      box: {
        x: target.x,
        y: target.y,
        w: target.w,
        h: target.h
      }
    };
  });

  await page.waitForTimeout(800);
  await shot(context, page, afterShot);

  const verify = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    const body = clean(document.body.innerText || "");

    const selects = Array.from(document.querySelectorAll("select")).map((s, index) => ({
      index,
      name: s.name || "",
      id: s.id || "",
      value: s.value || "",
      selectedText: clean(s.options[s.selectedIndex]?.textContent || "")
    }));

    return {
      bodyPreview: body.slice(0, 1600),
      selects
    };
  });

  const ok =
    result.ok &&
    /SDN 4 DWI TUNGGAL/i.test(verify.bodyPreview) &&
    /Juni/i.test(verify.bodyPreview) &&
    /2026/i.test(verify.bodyPreview);

  const report = {
    agent: "CLICK_OPEN_SCHOOL_OPTION_ONLY",
    rule: "NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_CHANGE_BULAN_NO_CHANGE_TAHUN_NO_SAVE",
    url: currentUrl,
    result,
    verify,
    ok,
    screenshots: [beforeShot, afterShot],
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`REPORT=${reportPath}`);

  if (!ok) {
    console.log(JSON.stringify(report, null, 2));
    throw new Error("STOP: Sekolah belum terverifikasi. Simpan tidak diklik.");
  }

  console.log("SMARTWORK_SEKOLAH_OPEN_OPTION=OK_SDN_4_DWI_TUNGGAL_NO_SAVE");
}

main().catch(error => {
  console.error("SMARTWORK_SEKOLAH_OPEN_OPTION=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
