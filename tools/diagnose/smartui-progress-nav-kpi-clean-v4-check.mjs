import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportDir = path.join(ROOT, "reports");
const shotDir = path.join(ROOT, "shots");
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const shot = path.join(shotDir, `${stamp}-progress-nav-kpi-clean-v4.png`);
const report = path.join(reportDir, "smartui-progress-nav-kpi-clean-v4-report.json");

const browser = await chromium.launch({ headless: false, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });

await page.goto("http://localhost:3107/progress.html?nocache=" + Date.now(), {
  waitUntil: "networkidle",
  timeout: 20000
});

await page.screenshot({ path: shot, fullPage: true });

const result = await page.evaluate(() => {
  const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const css = (el) => {
    const s = getComputedStyle(el);
    return {
      display: s.display,
      gridTemplateColumns: s.gridTemplateColumns,
      gridTemplateRows: s.gridTemplateRows,
      fontWeight: s.fontWeight,
      margin: s.margin
    };
  };

  const navLinks = Array.from(document.querySelectorAll(".bottom-nav a")).map((a) => ({
    text: clean(a.textContent),
    className: a.className,
    active: a.classList.contains("active")
  }));

  const stats = Array.from(document.querySelectorAll("section.stats .stat")).map((card) => {
    const num = card.querySelector(".statNum");
    const label = card.querySelector(".statLabel");
    return {
      text: clean(card.textContent),
      cardClass: card.className,
      cardCss: css(card),
      num: num ? { text: clean(num.textContent), rect: rect(num), css: css(num) } : null,
      label: label ? { text: clean(label.textContent), rect: rect(label), css: css(label) } : null,
      labelBelowNumber: num && label ? rect(label).y > rect(num).y : false
    };
  });

  return {
    url: location.href,
    navLinks,
    stats
  };
});

fs.writeFileSync(report, JSON.stringify({
  ok: true,
  mode: "SMARTWORK_PROGRESS_NAV_KPI_CLEAN_V4",
  screenshot: shot,
  result
}, null, 2));

await browser.close();

console.log(JSON.stringify({
  ok: true,
  report,
  screenshot: shot,
  navLinks: result.navLinks,
  stats: result.stats
}, null, 2));
