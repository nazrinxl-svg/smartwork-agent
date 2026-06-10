import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportDir = path.join(ROOT, "reports");
const shotDir = path.join(ROOT, "shots");
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report = path.join(reportDir, "smartui-progress-active-timeline-times-v1-report.json");
const shot = path.join(shotDir, `${stamp}-progress-active-timeline-times-v1.png`);

const browser = await chromium.launch({ headless: false, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });

await page.goto("http://localhost:3107/progress.html?activeTime=" + Date.now(), {
  waitUntil: "networkidle",
  timeout: 20000
});

await page.waitForTimeout(1000);
await page.screenshot({ path: shot, fullPage: true });

const result = await page.evaluate(() => {
  const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();

  const times = Array.from(document.querySelectorAll("[data-flow-time]")).map((el) => ({
    key: el.dataset.flowTime,
    text: clean(el.textContent),
    title: el.getAttribute("title"),
    live: el.dataset.live || ""
  }));

  return {
    times,
    timeline: window.SmartWorkTimelineTimes || null,
    ok: times.length >= 3 && times.every((x) => /^\d{2}:\d{2}$/.test(x.text))
  };
});

await browser.close();

fs.writeFileSync(report, JSON.stringify({
  ok: result.ok,
  mode: "SMARTWORK_PROGRESS_ACTIVE_TIMELINE_TIMES_V1",
  screenshot: shot,
  result
}, null, 2));

console.log(JSON.stringify({
  ok: result.ok,
  report,
  screenshot: shot,
  result
}, null, 2));
