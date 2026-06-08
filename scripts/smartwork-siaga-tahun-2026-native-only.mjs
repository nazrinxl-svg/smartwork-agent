import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const shotBefore = path.join(shotsDir, `${stamp}-01-before-tahun-2026-native.png`);
const shotAfter = path.join(shotsDir, `${stamp}-02-after-tahun-2026-native-no-save.png`);
const reportPath = path.join(reportsDir, `${stamp}-siaga-tahun-2026-native-only.json`);

async function shot(context, page, file) {
  await page.bringToFront().catch(() => {});
  await page.setViewportSize({ width: 1366, height: 768 }).catch(() => {});
  await new Promise(r => setTimeout(r, 300));

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
  console.log("SMARTWORK_MICRO_AGENT=TAHUN_2026_NATIVE_ONLY");
  console.log("RULE=NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_ARROWDOWN_NO_SAVE");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("/guru/absensi/create")) ||
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id"));

  if (!page) throw new Error("STOP: Tab SIAGA tidak ditemukan.");

  await page.bringToFront();
  await page.waitForTimeout(700);

  const currentUrl = page.url();
  console.log(`CURRENT_URL=${currentUrl}`);

  if (!currentUrl.includes("/guru/absensi/create")) {
    throw new Error("STOP: Belum di form Tambah Absensi. Agent ini tidak login/dashboard/tambah ulang.");
  }

  await shot(context, page, shotBefore);

  const result = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    const visible = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    };

    const selects = Array.from(document.querySelectorAll("select")).filter(visible);

    const tahunSelect =
      selects.find(s => /tahun/i.test(`${s.name || ""} ${s.id || ""}`)) ||
      selects.find(s => Array.from(s.options || []).some(o => clean(o.textContent) === "2026"));

    if (!tahunSelect) {
      return {
        ok: false,
        reason: "Dropdown Tahun tidak ditemukan",
        selects: selects.map((s, index) => ({
          index,
          name: s.name || "",
          id: s.id || "",
          selectedText: clean(s.options[s.selectedIndex]?.textContent || ""),
          options: Array.from(s.options || []).map(o => clean(o.textContent))
        }))
      };
    }

    const option = Array.from(tahunSelect.options || []).find(o => {
      return clean(o.textContent) === "2026" || clean(o.value) === "2026";
    });

    if (!option) {
      return {
        ok: false,
        reason: "Option 2026 tidak ditemukan di dropdown Tahun",
        name: tahunSelect.name || "",
        id: tahunSelect.id || "",
        options: Array.from(tahunSelect.options || []).map(o => ({
          value: o.value,
          text: clean(o.textContent)
        }))
      };
    }

    tahunSelect.focus();
    tahunSelect.value = option.value;
    tahunSelect.selectedIndex = Array.from(tahunSelect.options).indexOf(option);

    tahunSelect.dispatchEvent(new Event("input", { bubbles: true }));
    tahunSelect.dispatchEvent(new Event("change", { bubbles: true }));

    return {
      ok: true,
      name: tahunSelect.name || "",
      id: tahunSelect.id || "",
      value: tahunSelect.value,
      selectedText: clean(tahunSelect.options[tahunSelect.selectedIndex]?.textContent || ""),
      selectedIndex: tahunSelect.selectedIndex
    };
  });

  await page.waitForTimeout(800);
  await shot(context, page, shotAfter);

  const verify = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    return Array.from(document.querySelectorAll("select")).map((s, index) => ({
      index,
      name: s.name || "",
      id: s.id || "",
      value: s.value || "",
      selectedText: clean(s.options[s.selectedIndex]?.textContent || "")
    }));
  });

  const ok = result.ok && verify.some(s => /tahun/i.test(`${s.name} ${s.id}`) && s.selectedText === "2026");

  const report = {
    agent: "TAHUN_2026_NATIVE_ONLY",
    rule: "NO_LOGIN_NO_DASHBOARD_NO_TAMBAH_NO_ARROWDOWN_NO_SAVE",
    url: currentUrl,
    result,
    verify,
    ok,
    screenshots: [shotBefore, shotAfter],
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`REPORT=${reportPath}`);

  if (!ok) {
    console.log(JSON.stringify(report, null, 2));
    throw new Error("STOP: Tahun 2026 belum terverifikasi. Simpan tidak diklik.");
  }

  console.log("SMARTWORK_TAHUN_2026_NATIVE=OK_TAHUN_2026_NO_SAVE");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error("SMARTWORK_TAHUN_2026_NATIVE=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
