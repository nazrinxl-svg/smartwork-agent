import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportDir = path.join(ROOT, "reports");
const shotDir = path.join(ROOT, "shots");
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report = path.join(reportDir, "smartui-progress-kpi-reference-lock-v9-report.json");
const shot = path.join(shotDir, `${stamp}-progress-kpi-reference-lock-v9.png`);

const browser = await chromium.launch({ headless: false, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });

await page.goto("http://localhost:3107/progress.html?kpiRef=" + Date.now(), {
  waitUntil: "networkidle",
  timeout: 20000
});

await page.screenshot({ path: shot, fullPage: true });

const result = await page.evaluate(() => {
  const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();

  function rect(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom)
    };
  }

  function css(el) {
    if (!el) return null;
    const s = getComputedStyle(el);
    return {
      display: s.display,
      gridTemplateColumns: s.gridTemplateColumns,
      gridTemplateRows: s.gridTemplateRows,
      gap: s.gap,
      width: s.width,
      height: s.height,
      padding: s.padding,
      margin: s.margin,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      whiteSpace: s.whiteSpace
    };
  }

  const stats = Array.from(document.querySelectorAll("section.stats .stat")).map((card) => {
    const icon = card.querySelector(".statIcon");
    const num = card.querySelector(".statNum");
    const label = card.querySelector(".statLabel");

    return {
      text: clean(card.textContent),
      card: { rect: rect(card), css: css(card) },
      icon: { rect: rect(icon), css: css(icon) },
      num: { text: clean(num?.textContent), rect: rect(num), css: css(num) },
      label: { text: clean(label?.textContent), rect: rect(label), css: css(label) },
      labelBelowNumber: num && label ? rect(label).y > rect(num).y : false,
      labelNotSameLine: num && label ? rect(label).top >= rect(num).bottom - 2 : false
    };
  });

  return {
    url: location.href,
    stats,
    ok: stats.length === 3 && stats.every((x) => x.labelBelowNumber)
  };
});

await browser.close();

fs.writeFileSync(report, JSON.stringify({
  ok: result.ok,
  mode: "SMARTWORK_PROGRESS_KPI_REFERENCE_LOCK_V9",
  screenshot: shot,
  result
}, null, 2));

console.log(JSON.stringify({
  ok: result.ok,
  report,
  screenshot: shot,
  stats: result.stats.map((x) => ({
    text: x.text,
    cardRect: x.card.rect,
    num: x.num,
    label: x.label,
    labelBelowNumber: x.labelBelowNumber,
    labelNotSameLine: x.labelNotSameLine
  }))
}, null, 2));
