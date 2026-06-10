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
const reportPath = path.join(reportDir, "smartui-nav-precision-diagnosis.json");

function round(n) {
  return Math.round(Number(n) * 100) / 100;
}

const browser = await chromium.launch({ headless: false, channel: "chrome" });
const results = [];

for (const name of pages) {
  const page = await browser.newPage({
    viewport: { width: 430, height: 900 },
    deviceScaleFactor: 1
  });

  const url = `http://localhost:3107/${name}.html?precision=${Date.now()}`;
  const shot = path.join(shotDir, `${stamp}-${name}-nav-precision.png`);

  const response = await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
  await page.screenshot({ path: shot, fullPage: true });

  const dom = await page.evaluate(() => {
    const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();

    function rect(el) {
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
      const s = getComputedStyle(el);
      return {
        display: s.display,
        position: s.position,
        left: s.left,
        right: s.right,
        bottom: s.bottom,
        transform: s.transform,
        width: s.width,
        height: s.height,
        minHeight: s.minHeight,
        padding: s.padding,
        margin: s.margin,
        gap: s.gap,
        gridTemplateColumns: s.gridTemplateColumns,
        justifyContent: s.justifyContent,
        justifyItems: s.justifyItems,
        alignItems: s.alignItems,
        placeItems: s.placeItems,
        backgroundColor: s.backgroundColor,
        borderTop: s.borderTop,
        borderRadius: s.borderRadius,
        boxShadow: s.boxShadow,
        color: s.color,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        zIndex: s.zIndex
      };
    }

    function childInfo(el) {
      return {
        tag: el.tagName,
        className: typeof el.className === "string" ? el.className : "",
        text: clean(el.textContent),
        rect: rect(el),
        css: css(el),
        html: el.outerHTML.slice(0, 500)
      };
    }

    const nav = document.querySelector(".bottom-nav");
    const links = Array.from(document.querySelectorAll(".bottom-nav a"));

    return {
      title: document.title,
      url: location.href,
      nav: nav ? {
        className: nav.className,
        text: clean(nav.textContent),
        rect: rect(nav),
        css: css(nav),
        html: nav.outerHTML
      } : null,
      links: links.map((a) => {
        const iconWrap = a.querySelector("strong, .navIcon");
        const svg = a.querySelector("svg");
        const label = a.querySelector("span:last-child");

        return {
          text: clean(a.textContent),
          href: a.getAttribute("href"),
          className: a.className,
          isActive: a.classList.contains("active"),
          link: childInfo(a),
          iconWrap: iconWrap ? childInfo(iconWrap) : null,
          svg: svg ? childInfo(svg) : null,
          label: label ? childInfo(label) : null,
          children: Array.from(a.children).map(childInfo)
        };
      }),
      matchedCssRules: (() => {
        const out = [];
        const targets = [
          ".bottom-nav",
          ".bottom-nav .nav-item",
          ".bottom-nav .nav-item.active",
          ".bottom-nav .nav-item strong",
          ".bottom-nav .nav-item .navIcon",
          ".bottom-nav .nav-item.active strong",
          ".bottom-nav .nav-item.active .navIcon",
          ".bottom-nav .nav",
          ".bottom-nav .nav.active",
          ".navIcon",
          ".nav",
          ".nav-item"
        ];

        for (const sheet of Array.from(document.styleSheets)) {
          let rules = [];
          try {
            rules = Array.from(sheet.cssRules || []);
          } catch {
            continue;
          }

          for (const rule of rules) {
            if (!rule.selectorText) continue;
            for (const target of targets) {
              if (rule.selectorText.includes(target.replace(".bottom-nav ", "")) || rule.selectorText.includes(target)) {
                out.push({
                  selector: rule.selectorText,
                  cssText: rule.cssText
                });
                break;
              }
            }
          }
        }

        return out;
      })()
    };
  });

  results.push({
    page: name,
    status: response?.status() ?? null,
    screenshot: shot,
    dom
  });

  await page.close();
}

await browser.close();

const baseline = results.find((r) => r.page === "history") || results.find((r) => r.page === "home");
const progress = results.find((r) => r.page === "progress");

function pickNav(r) {
  return {
    page: r.page,
    status: r.status,
    screenshot: r.screenshot,
    navClass: r.dom.nav?.className,
    navRect: r.dom.nav?.rect,
    navCss: r.dom.nav?.css,
    linkClasses: r.dom.links.map((x) => x.className),
    active: r.dom.links.find((x) => x.isActive)?.text,
    iconWrapTags: r.dom.links.map((x) => ({
      text: x.text,
      tag: x.iconWrap?.tag,
      className: x.iconWrap?.className,
      rect: x.iconWrap?.rect,
      css: x.iconWrap?.css
    }))
  };
}

function diff(a, b) {
  const diffs = [];
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const k of keys) {
    const av = JSON.stringify(a?.[k]);
    const bv = JSON.stringify(b?.[k]);
    if (av !== bv) diffs.push({ key: k, baseline: a?.[k], progress: b?.[k] });
  }
  return diffs;
}

const summary = results.map(pickNav);
const preciseDiff = baseline && progress ? {
  baselinePage: baseline.page,
  progressPage: progress.page,
  navCssDiff: diff(baseline.dom.nav?.css, progress.dom.nav?.css),
  navRectDiff: diff(baseline.dom.nav?.rect, progress.dom.nav?.rect),
  firstLinkCssDiff: diff(baseline.dom.links[0]?.link?.css, progress.dom.links[0]?.link?.css),
  activeLinkCssDiff: diff(
    baseline.dom.links.find((x) => x.isActive)?.link?.css,
    progress.dom.links.find((x) => x.isActive)?.link?.css
  ),
  iconWrapDiff: diff(
    baseline.dom.links.find((x) => x.isActive)?.iconWrap?.css,
    progress.dom.links.find((x) => x.isActive)?.iconWrap?.css
  ),
  labelDiff: diff(
    baseline.dom.links.find((x) => x.isActive)?.label?.css,
    progress.dom.links.find((x) => x.isActive)?.label?.css
  )
} : null;

fs.writeFileSync(reportPath, JSON.stringify({
  ok: true,
  mode: "SMARTUI_NAV_PRECISION_DIAGNOSIS_ONLY",
  generatedAt: new Date().toISOString(),
  summary,
  preciseDiff,
  results
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  report: reportPath,
  summary,
  preciseDiff
}, null, 2));
