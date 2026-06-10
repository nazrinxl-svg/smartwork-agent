import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportDir = path.join(ROOT, "reports");
const shotDir = path.join(ROOT, "shots");
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report = path.join(reportDir, "smartui-request-heading-profile-v1-report.json");
const shot = path.join(shotDir, `${stamp}-request-heading-profile-v1.png`);

const browser = await chromium.launch({ headless: false, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });

await page.goto("http://localhost:3107/request.html?headingProfile=" + Date.now(), {
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
      padding: s.padding,
      margin: s.margin,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      color: s.color,
      background: s.backgroundColor,
      borderRadius: s.borderRadius
    };
  }

  const heading = document.querySelector(".request-heading");
  const brand = document.querySelector(".request-heading .heading-brand");
  const logo = document.querySelector(".request-heading .logo");
  const title = document.querySelector(".request-heading h1");
  const subtitle = document.querySelector(".request-heading .subtitle");
  const profile = document.querySelector(".request-heading .heading-profile");
  const profileImg = document.querySelector("#requestProfilePhoto");

  return {
    heading: { text: clean(heading?.textContent), rect: rect(heading), css: css(heading), html: heading?.outerHTML },
    brand: { rect: rect(brand), css: css(brand) },
    logo: { rect: rect(logo), css: css(logo) },
    title: { text: clean(title?.textContent), rect: rect(title), css: css(title) },
    subtitle: { text: clean(subtitle?.textContent), rect: rect(subtitle), css: css(subtitle) },
    profile: { exists: !!profile, rect: rect(profile), css: css(profile), href: profile?.getAttribute("href") },
    profileImg: { exists: !!profileImg, src: profileImg?.getAttribute("src"), rect: rect(profileImg), css: css(profileImg) }
  };
});

await browser.close();

fs.writeFileSync(report, JSON.stringify({
  ok: true,
  mode: "SMARTWORK_REQUEST_HEADING_PROFILE_V1",
  screenshot: shot,
  result
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  report,
  screenshot: shot,
  result
}, null, 2));
