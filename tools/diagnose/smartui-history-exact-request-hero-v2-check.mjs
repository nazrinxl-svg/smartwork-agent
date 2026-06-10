import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportDir = path.join(ROOT, "reports");
const shotDir = path.join(ROOT, "shots");
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report = path.join(reportDir, "smartui-history-exact-request-hero-v2-report.json");
const shots = {
  request: path.join(shotDir, `${stamp}-request-hero-baseline.png`),
  history: path.join(shotDir, `${stamp}-history-exact-request-hero-v2.png`)
};

const browser = await chromium.launch({ headless: false, channel: "chrome" });

async function inspect(pageName) {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:3107/${pageName}.html?hero=${Date.now()}`, {
    waitUntil: "networkidle",
    timeout: 20000
  });

  await page.screenshot({ path: shots[pageName], fullPage: true });

  const data = await page.evaluate(() => {
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

    const hero = document.querySelector(".hero");
    const logo = hero?.querySelector(".logo");
    const title = hero?.querySelector("h1");
    const subtitle = hero?.querySelector(".subtitle");

    return {
      hero: { text: clean(hero?.textContent), rect: rect(hero), css: css(hero), html: hero?.outerHTML },
      logo: { rect: rect(logo), css: css(logo) },
      title: { text: clean(title?.textContent), rect: rect(title), css: css(title) },
      subtitle: { text: clean(subtitle?.textContent), rect: rect(subtitle), css: css(subtitle) },
      oldTopbarExists: !!document.querySelector(".top-hero .topbar"),
      oldHistoryLogoExists: !!document.querySelector(".history-brand-logo")
    };
  });

  await page.close();
  return data;
}

const request = await inspect("request");
const history = await inspect("history");
await browser.close();

function diff(a, b) {
  const out = [];
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) {
    const av = JSON.stringify(a?.[key]);
    const bv = JSON.stringify(b?.[key]);
    if (av !== bv) out.push({ key, request: a?.[key], history: b?.[key] });
  }
  return out;
}

const result = {
  ok: true,
  mode: "SMARTWORK_HISTORY_EXACT_REQUEST_HERO_V2",
  screenshots: shots,
  request,
  history,
  diff: {
    heroRect: diff(request.hero.rect, history.hero.rect),
    logoRect: diff(request.logo.rect, history.logo.rect),
    titleCss: diff(request.title.css, history.title.css),
    subtitleCss: diff(request.subtitle.css, history.subtitle.css)
  }
};

fs.writeFileSync(report, JSON.stringify(result, null, 2));

console.log(JSON.stringify({
  ok: true,
  report,
  screenshots: shots,
  request: {
    hero: request.hero,
    title: request.title,
    subtitle: request.subtitle
  },
  history: {
    hero: history.hero,
    title: history.title,
    subtitle: history.subtitle,
    oldTopbarExists: history.oldTopbarExists,
    oldHistoryLogoExists: history.oldHistoryLogoExists
  },
  diff: result.diff
}, null, 2));
