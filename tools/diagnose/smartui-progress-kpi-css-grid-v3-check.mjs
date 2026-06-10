import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const shotDir = path.join(ROOT, "shots");
const reportDir = path.join(ROOT, "reports");
fs.mkdirSync(shotDir, { recursive: true });
fs.mkdirSync(reportDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const shot = path.join(shotDir, `${stamp}-progress-kpi-css-grid-v3.png`);
const report = path.join(reportDir, "smartui-progress-kpi-css-grid-v3-report.json");

const browser = await chromium.launch({ headless: false, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });

await page.goto("http://localhost:3107/progress.html?nocache=" + Date.now(), {
  waitUntil: "networkidle",
  timeout: 20000
});

await page.screenshot({ path: shot, fullPage: true });

const result = await page.evaluate(() => {
  function clean(v) {
    return String(v || "").replace(/\s+/g, " ").trim();
  }

  function rect(el) {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height)
    };
  }

  function css(el) {
    const s = getComputedStyle(el);
    return {
      display: s.display,
      gridTemplateColumns: s.gridTemplateColumns,
      gridTemplateRows: s.gridTemplateRows,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      margin: s.margin
    };
  }

  return Array.from(document.querySelectorAll("section.stats .stat")).map((card) => {
    const num = card.querySelector(".statNum");
    const label = card.querySelector(".statLabel");
    const icon = card.querySelector(".statIcon");

    return {
      cardText: clean(card.textContent),
      card: { rect: rect(card), css: css(card) },
      icon: icon ? { rect: rect(icon), css: css(icon) } : null,
      num: num ? { text: clean(num.textContent), rect: rect(num), css: css(num) } : null,
      label: label ? { text: clean(label.textContent), rect: rect(label), css: css(label) } : null,
      labelBelowNumber: num && label ? rect(label).y > rect(num).y : false
    };
  });
});

fs.writeFileSync(report, JSON.stringify({
  ok: true,
  mode: "SMARTWORK_PROGRESS_KPI_TRUE_GRID_V3",
  screenshot: shot,
  result
}, null, 2));

await browser.close();

console.log(JSON.stringify({ ok: true, report, screenshot: shot, result }, null, 2));
