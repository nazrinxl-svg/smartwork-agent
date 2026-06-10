import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportDir = path.join(ROOT, "reports");
const shotDir = path.join(ROOT, "shots");
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report = path.join(reportDir, "smartui-heading-real-structure-diagnosis.json");

const browser = await chromium.launch({ headless: false, channel: "chrome" });

async function inspect(pageName) {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });
  const url = `http://localhost:3107/${pageName}.html?heading_real=${Date.now()}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });

  const shot = path.join(shotDir, `${stamp}-${pageName}-heading-real-structure.png`);
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
        position: s.position,
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

    function info(el) {
      if (!el) return null;
      return {
        tag: el.tagName,
        id: el.id || "",
        className: typeof el.className === "string" ? el.className : "",
        text: clean(el.textContent).slice(0, 300),
        rect: rect(el),
        css: css(el),
        html: el.outerHTML.slice(0, 1200)
      };
    }

    const candidates = Array.from(document.querySelectorAll("body *"))
      .filter((el) => {
        const text = clean(el.textContent);
        const cls = typeof el.className === "string" ? el.className : "";
        const r = el.getBoundingClientRect();
        return (
          r.top < 130 &&
          r.width > 20 &&
          r.height > 10 &&
          (
            /SmartWork|Agent|Progress/.test(text) ||
            /topbar|brand|logo|avatar|bell|profile|header/i.test(cls)
          )
        );
      })
      .map(info);

    const topVisual = Array.from(document.querySelectorAll("body *"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.top < 130 && r.width > 20 && r.height > 10;
      })
      .map(info)
      .slice(0, 80);

    return {
      url: location.href,
      title: document.title,
      bodyClass: document.body.className,
      bodyTextTop: clean(document.body.innerText).slice(0, 800),
      candidates,
      topVisual
    };
  });

  await page.close();
  return { page: pageName, screenshot: shot, result };
}

const home = await inspect("home");
const progress = await inspect("progress");

await browser.close();

fs.writeFileSync(report, JSON.stringify({
  ok: true,
  mode: "SMARTUI_HEADING_REAL_STRUCTURE_DIAGNOSIS_ONLY",
  generatedAt: new Date().toISOString(),
  home,
  progress
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  report,
  homeScreenshot: home.screenshot,
  progressScreenshot: progress.screenshot,
  homeCandidates: home.result.candidates.map(x => ({
    tag: x.tag,
    className: x.className,
    text: x.text,
    rect: x.rect
  })),
  progressCandidates: progress.result.candidates.map(x => ({
    tag: x.tag,
    className: x.className,
    text: x.text,
    rect: x.rect
  }))
}, null, 2));
