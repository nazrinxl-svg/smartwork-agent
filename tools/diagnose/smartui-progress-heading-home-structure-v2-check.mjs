import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportDir = path.join(ROOT, "reports");
const shotDir = path.join(ROOT, "shots");
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report = path.join(reportDir, "smartui-progress-heading-home-structure-v2-report.json");
const shot = path.join(shotDir, `${stamp}-progress-heading-home-structure-v2.png`);

const browser = await chromium.launch({ headless: false, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });

await page.goto("http://localhost:3107/progress.html?headingv2=" + Date.now(), {
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
      alignItems: s.alignItems,
      justifyContent: s.justifyContent,
      gap: s.gap,
      width: s.width,
      height: s.height,
      margin: s.margin,
      padding: s.padding,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      color: s.color,
      background: s.backgroundColor,
      borderRadius: s.borderRadius
    };
  }

  const topbar = document.querySelector(".topbar");
  const brandLogo = document.querySelector(".topbar .brand-logo");
  const title = document.querySelector(".topbar h1");
  const sub = document.querySelector(".topbar .top-subtitle");
  const icons = document.querySelector(".topbar .top-icons");
  const notify = document.querySelector(".topbar .notify-btn");
  const profile = document.querySelector(".topbar .profile-avatar");

  return {
    topbarText: clean(topbar?.textContent),
    topbar: { tag: topbar?.tagName, rect: rect(topbar), css: css(topbar), html: topbar?.outerHTML },
    brandLogo: { rect: rect(brandLogo), css: css(brandLogo) },
    title: { text: clean(title?.textContent), rect: rect(title), css: css(title) },
    subtitle: { text: clean(sub?.textContent), rect: rect(sub), css: css(sub) },
    icons: { rect: rect(icons), css: css(icons) },
    notify: { rect: rect(notify), css: css(notify) },
    profile: { rect: rect(profile), css: css(profile) },
    hasOldSwLogo: !!document.querySelector(".swLogo"),
    hasOldHeaderTag: !!document.querySelector("header.topbar")
  };
});

await browser.close();

fs.writeFileSync(report, JSON.stringify({
  ok: true,
  mode: "SMARTWORK_PROGRESS_HEADING_HOME_STRUCTURE_V2",
  screenshot: shot,
  result
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  report,
  screenshot: shot,
  result
}, null, 2));
