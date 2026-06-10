import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportDir = path.join(ROOT, "reports");
const shotDir = path.join(ROOT, "shots");
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report = path.join(reportDir, "smartui-progress-nav-exact-request-v8-report.json");
const shot = path.join(shotDir, `${stamp}-progress-nav-exact-request-v8.png`);

const browser = await chromium.launch({ headless: false, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });

await page.goto("http://localhost:3107/progress.html?exactnav=" + Date.now(), {
  waitUntil: "networkidle",
  timeout: 20000
});

const before = await page.evaluate(() => {
  const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
  };
  const css = (el) => {
    const s = getComputedStyle(el);
    return {
      display:s.display,
      width:s.width,
      height:s.height,
      gap:s.gap,
      padding:s.padding,
      fontSize:s.fontSize,
      fontWeight:s.fontWeight,
      lineHeight:s.lineHeight,
      background:s.backgroundColor,
      transform:s.transform
    };
  };

  return {
    nav: { rect: rect(document.querySelector(".bottom-nav")), css: css(document.querySelector(".bottom-nav")) },
    links: Array.from(document.querySelectorAll(".bottom-nav .nav-item")).map(a => ({
      text: clean(a.textContent),
      className: a.className,
      rect: rect(a),
      css: css(a),
      iconTag: a.querySelector("strong, .navIcon")?.tagName,
      iconClass: a.querySelector("strong, .navIcon")?.className || "",
      iconRect: rect(a.querySelector("strong, .navIcon")),
      labelRect: rect(a.querySelector("span:last-child"))
    }))
  };
});

await page.click(".bottom-nav .nav-item.active");
await page.waitForTimeout(250);

const after = await page.evaluate(() => {
  const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
  };
  const css = (el) => {
    const s = getComputedStyle(el);
    return {
      display:s.display,
      width:s.width,
      height:s.height,
      gap:s.gap,
      padding:s.padding,
      fontSize:s.fontSize,
      fontWeight:s.fontWeight,
      lineHeight:s.lineHeight,
      background:s.backgroundColor,
      transform:s.transform
    };
  };

  return {
    nav: { rect: rect(document.querySelector(".bottom-nav")), css: css(document.querySelector(".bottom-nav")) },
    links: Array.from(document.querySelectorAll(".bottom-nav .nav-item")).map(a => ({
      text: clean(a.textContent),
      className: a.className,
      rect: rect(a),
      css: css(a),
      iconTag: a.querySelector("strong, .navIcon")?.tagName,
      iconClass: a.querySelector("strong, .navIcon")?.className || "",
      iconRect: rect(a.querySelector("strong, .navIcon")),
      labelRect: rect(a.querySelector("span:last-child"))
    }))
  };
});

await page.screenshot({ path: shot, fullPage: true });
await browser.close();

const result = {
  ok: true,
  mode: "SMARTWORK_PROGRESS_NAV_EXACT_REQUEST_V8",
  screenshot: shot,
  before,
  after,
  navStable: JSON.stringify(before.nav.rect) === JSON.stringify(after.nav.rect),
  linkRectsStable: JSON.stringify(before.links.map(x => x.rect)) === JSON.stringify(after.links.map(x => x.rect)),
  allIconsStrong: before.links.every(x => x.iconTag === "STRONG"),
  linkHeights: before.links.map(x => ({ text:x.text, h:x.rect.h, iconTag:x.iconTag, iconH:x.iconRect.h }))
};

fs.writeFileSync(report, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
