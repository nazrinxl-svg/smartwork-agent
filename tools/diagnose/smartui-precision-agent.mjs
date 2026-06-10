import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const doctrinePath = path.join(ROOT, "memory", "smartui-mobile-doctrine.json");
const reportDir = path.join(ROOT, "reports");
const shotDir = path.join(ROOT, "shots");

fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const doctrineRaw = fs.readFileSync(doctrinePath, "utf8").replace(/^\uFEFF/, "").trim();
const doctrine = JSON.parse(doctrineRaw);

const pages = [
  { name: "home", url: "http://localhost:3107/home.html" },
  { name: "request", url: "http://localhost:3107/request.html" },
  { name: "progress", url: "http://localhost:3107/progress.html" },
  { name: "history", url: "http://localhost:3107/history.html" },
  { name: "profile", url: "http://localhost:3107/profile.html" }
];

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportDir, "smartui-precision-agent-report.json");

function clean(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

const browser = await chromium.launch({
  headless: false,
  channel: "chrome"
});

const results = [];

for (const item of pages) {
  const page = await browser.newPage({
    viewport: { width: 430, height: 900 },
    deviceScaleFactor: 1
  });

  const shot = path.join(shotDir, `${stamp}-${item.name}-smartui-precision.png`);
  const response = await page.goto(`${item.url}?smartui_precision=${Date.now()}`, {
    waitUntil: "networkidle",
    timeout: 20000
  });

  const before = await page.evaluate(() => {
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
        width: s.width,
        height: s.height,
        padding: s.padding,
        margin: s.margin,
        gap: s.gap,
        gridTemplateColumns: s.gridTemplateColumns,
        gridTemplateRows: s.gridTemplateRows,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        lineHeight: s.lineHeight,
        backgroundColor: s.backgroundColor,
        color: s.color,
        transform: s.transform
      };
    }

    const nav = document.querySelector(".bottom-nav");
    const links = Array.from(document.querySelectorAll(".bottom-nav .nav-item"));

    return {
      nav: nav ? { rect: rect(nav), css: css(nav), html: nav.outerHTML } : null,
      links: links.map((a) => {
        const icon = a.querySelector("strong, .navIcon");
        const label = a.querySelector("span:last-child");
        return {
          text: clean(a.textContent),
          className: a.className,
          active: a.classList.contains("active"),
          rect: rect(a),
          css: css(a),
          iconTag: icon?.tagName || null,
          iconClass: icon?.className || "",
          iconRect: rect(icon),
          iconCss: css(icon),
          labelRect: rect(label),
          labelCss: css(label)
        };
      }),
      stats: Array.from(document.querySelectorAll("section.stats .stat")).map((card) => {
        const num = card.querySelector(".statNum");
        const label = card.querySelector(".statLabel");
        return {
          text: clean(card.textContent),
          rect: rect(card),
          css: css(card),
          num: num ? { text: clean(num.textContent), rect: rect(num), css: css(num) } : null,
          label: label ? { text: clean(label.textContent), rect: rect(label), css: css(label) } : null,
          labelBelowNumber: num && label ? rect(label).y > rect(num).y : null
        };
      })
    };
  });

  const active = await page.$(".bottom-nav .nav-item.active");
  if (active) {
    await active.click();
    await page.waitForTimeout(250);
  }

  const after = await page.evaluate(() => {
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

    const nav = document.querySelector(".bottom-nav");
    const links = Array.from(document.querySelectorAll(".bottom-nav .nav-item"));

    return {
      navRect: rect(nav),
      linkRects: links.map((a) => ({
        text: clean(a.textContent),
        rect: rect(a),
        iconRect: rect(a.querySelector("strong, .navIcon")),
        labelRect: rect(a.querySelector("span:last-child"))
      }))
    };
  });

  await page.screenshot({ path: shot, fullPage: true });

  results.push({
    page: item.name,
    status: response?.status() ?? null,
    screenshot: shot,
    before,
    after,
    navStableAfterClick: JSON.stringify(before.nav?.rect) === JSON.stringify(after.navRect),
    linksStableAfterClick: JSON.stringify(before.links.map((x) => x.rect)) === JSON.stringify(after.linkRects.map((x) => x.rect)),
    allIconWrappersStrong: before.links.every((x) => x.iconTag === "STRONG")
  });

  await page.close();
}

await browser.close();

function diffObject(a, b) {
  const out = [];
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of keys) {
    const av = JSON.stringify(a?.[key]);
    const bv = JSON.stringify(b?.[key]);
    if (av !== bv) out.push({ key, baseline: a?.[key], target: b?.[key] });
  }
  return out;
}

const baseline = results.find((x) => x.page === "request") || results.find((x) => x.page === "home");
const progress = results.find((x) => x.page === "progress");

const preciseDiff = baseline && progress ? {
  baselinePage: baseline.page,
  targetPage: progress.page,
  navRectDiff: diffObject(baseline.before.nav?.rect, progress.before.nav?.rect),
  navCssDiff: diffObject(baseline.before.nav?.css, progress.before.nav?.css),
  firstLinkCssDiff: diffObject(baseline.before.links[0]?.css, progress.before.links[0]?.css),
  activeLinkCssDiff: diffObject(
    baseline.before.links.find((x) => x.active)?.css,
    progress.before.links.find((x) => x.active)?.css
  ),
  activeIconCssDiff: diffObject(
    baseline.before.links.find((x) => x.active)?.iconCss,
    progress.before.links.find((x) => x.active)?.iconCss
  )
} : null;

const summary = results.map((r) => ({
  page: r.page,
  status: r.status,
  screenshot: r.screenshot,
  navRect: r.before.nav?.rect,
  active: r.before.links.find((x) => x.active)?.text,
  linkClasses: r.before.links.map((x) => x.className),
  iconTags: r.before.links.map((x) => x.iconTag),
  navStableAfterClick: r.navStableAfterClick,
  linksStableAfterClick: r.linksStableAfterClick,
  allIconWrappersStrong: r.allIconWrappersStrong,
  kpiLabelBelowNumber: r.before.stats.map((x) => ({
    text: x.text,
    labelBelowNumber: x.labelBelowNumber
  }))
}));

const report = {
  ok: true,
  mode: doctrine.version,
  doctrine,
  generatedAt: new Date().toISOString(),
  summary,
  preciseDiff,
  results
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok: true,
  report: reportPath,
  summary,
  preciseDiff
}, null, 2));
