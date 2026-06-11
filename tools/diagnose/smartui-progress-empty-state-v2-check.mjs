import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportDir = path.join(ROOT, "reports");
const shotDir = path.join(ROOT, "shots");
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report = path.join(reportDir, "smartui-progress-empty-state-v2-report.json");
const shot = path.join(shotDir, `${stamp}-progress-empty-state-v2.png`);

const browser = await chromium.launch({ headless: false, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });

await page.goto("http://localhost:3107/reset-web-state.html?reset=" + Date.now(), {
  waitUntil: "networkidle",
  timeout: 20000
});

await page.waitForTimeout(1500);
await page.screenshot({ path: shot, fullPage: true });

const result = await page.evaluate(() => {
  const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();

  return {
    url: location.href,
    bodyText: clean(document.body.innerText),
    emptyFlag: document.body.dataset.smartworkEmpty,
    heroTitle: clean(document.getElementById("heroTitle")?.textContent),
    heroText: clean(document.getElementById("heroText")?.textContent),
    total: clean(document.getElementById("totalVal")?.textContent),
    filled: clean(document.getElementById("filledVal")?.textContent),
    needs: clean(document.getElementById("needsVal")?.textContent),
    percent: clean(document.querySelector(".percent")?.textContent),
    pdfName: clean(document.getElementById("pdfName")?.textContent),
    pdfHref: document.getElementById("pdfLink")?.getAttribute("href"),
    proofHref: document.getElementById("proofLink")?.getAttribute("href")
  };
});

await browser.close();

const ok =
  result.heroTitle === "Belum ada request aktif" &&
  result.total === "0" &&
  result.filled === "0" &&
  result.needs === "0" &&
  result.percent === "0%" &&
  !result.bodyText.includes("Presensi_Nazrin_Juni_2026.pdf");

fs.writeFileSync(report, JSON.stringify({
  ok,
  mode: "SMARTWORK_PROGRESS_FORCE_EMPTY_UNTIL_REQUEST_V2",
  screenshot: shot,
  result
}, null, 2));

console.log(JSON.stringify({ ok, report, screenshot: shot, result }, null, 2));
