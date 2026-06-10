import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportDir = path.join(ROOT, "reports");
const shotDir = path.join(ROOT, "shots");
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const pages = ["home", "request", "progress", "history", "profile"];
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report = path.join(reportDir, "smartui-bottom-nav-click-lock-v7-report.json");

const browser = await chromium.launch({ headless: false, channel: "chrome" });

function roundRect(r) {
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.round(r.width),
    h: Math.round(r.height),
    top: Math.round(r.top),
    bottom: Math.round(r.bottom)
  };
}

const results = [];

for (const name of pages) {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:3107/${name}.html?lock=${Date.now()}`, { waitUntil: "networkidle", timeout: 20000 });

  const before = await page.evaluate(() => {
    const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    };
    const css = (el) => {
      const s = getComputedStyle(el);
      return {
        width: s.width,
        height: s.height,
        gap: s.gap,
        padding: s.padding,
        margin: s.margin,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        transform: s.transform
      };
    };

    return {
      nav: rect(document.querySelector(".bottom-nav")),
      links: Array.from(document.querySelectorAll(".bottom-nav .nav-item")).map((a) => ({
        text: clean(a.textContent),
        className: a.className,
        rect: rect(a),
        css: css(a),
        iconRect: rect(a.querySelector("strong, .navIcon")),
        labelRect: rect(a.querySelector("span:last-child"))
      }))
    };
  });

  const active = await page.$(".bottom-nav .nav-item.active");
  if (active) {
    await active.click();
    await page.waitForTimeout(300);
  }

  const after = await page.evaluate(() => {
    const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    };
    const css = (el) => {
      const s = getComputedStyle(el);
      return {
        width: s.width,
        height: s.height,
        gap: s.gap,
        padding: s.padding,
        margin: s.margin,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        transform: s.transform
      };
    };

    return {
      nav: rect(document.querySelector(".bottom-nav")),
      links: Array.from(document.querySelectorAll(".bottom-nav .nav-item")).map((a) => ({
        text: clean(a.textContent),
        className: a.className,
        rect: rect(a),
        css: css(a),
        iconRect: rect(a.querySelector("strong, .navIcon")),
        labelRect: rect(a.querySelector("span:last-child"))
      }))
    };
  });

  const shot = path.join(shotDir, `${stamp}-${name}-bottom-nav-click-lock-v7.png`);
  await page.screenshot({ path: shot, fullPage: true });

  results.push({
    page: name,
    screenshot: shot,
    before,
    after,
    navStable: JSON.stringify(before.nav) === JSON.stringify(after.nav),
    linksStable: JSON.stringify(before.links.map(x => x.rect)) === JSON.stringify(after.links.map(x => x.rect))
  });

  await page.close();
}

await browser.close();

fs.writeFileSync(report, JSON.stringify({
  ok: true,
  mode: "SMARTWORK_BOTTOM_NAV_LOCKED_CLICK_STATE_V7",
  results
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  report,
  summary: results.map(r => ({
    page: r.page,
    navStable: r.navStable,
    linksStable: r.linksStable,
    navBefore: r.before.nav,
    navAfter: r.after.nav,
    linkWidthsBefore: r.before.links.map(x => x.rect.w),
    linkWidthsAfter: r.after.links.map(x => x.rect.w)
  }))
}, null, 2));
