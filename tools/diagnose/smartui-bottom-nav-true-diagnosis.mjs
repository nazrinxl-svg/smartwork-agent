import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportDir = path.join(ROOT, "reports");
const shotDir = path.join(ROOT, "shots");
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const pages = [
  { name: "home", url: "http://localhost:3107/home.html" },
  { name: "request", url: "http://localhost:3107/request.html" },
  { name: "progress", url: "http://localhost:3107/progress.html" },
  { name: "history", url: "http://localhost:3107/history.html" },
  { name: "profile", url: "http://localhost:3107/profile.html" }
];

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report = path.join(reportDir, "smartui-bottom-nav-true-diagnosis.json");

const browser = await chromium.launch({
  headless: false,
  channel: "chrome"
});

const results = [];

for (const pageInfo of pages) {
  const page = await browser.newPage({
    viewport: { width: 430, height: 900 },
    deviceScaleFactor: 1
  });

  const shot = path.join(shotDir, `${stamp}-${pageInfo.name}-bottom-nav-diagnosis.png`);

  let status = null;
  let error = null;

  try {
    const response = await page.goto(pageInfo.url + "?diagnose=" + Date.now(), {
      waitUntil: "networkidle",
      timeout: 20000
    });
    status = response?.status() ?? null;
    await page.screenshot({ path: shot, fullPage: true });
  } catch (e) {
    error = String(e?.message || e);
  }

  const dom = await page.evaluate(() => {
    function clean(v) {
      return String(v || "").replace(/\s+/g, " ").trim();
    }

    function rect(el) {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
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
        width: s.width,
        height: s.height,
        padding: s.padding,
        margin: s.margin,
        gap: s.gap,
        gridTemplateColumns: s.gridTemplateColumns,
        justifyContent: s.justifyContent,
        alignItems: s.alignItems,
        background: s.backgroundColor,
        borderTop: s.borderTop,
        boxShadow: s.boxShadow,
        fontSize: s.fontSize,
        fontWeight: s.fontWeight,
        color: s.color,
        zIndex: s.zIndex
      };
    }

    const navCandidates = Array.from(document.querySelectorAll("nav, footer, .bottomNav, .bottom-nav, [class*='bottom'], [class*='nav']"))
      .filter((el) => {
        const text = clean(el.textContent);
        return /Home|Request|Progress|Riwayat|Profil|History/.test(text);
      })
      .map((el) => ({
        tag: el.tagName,
        id: el.id || "",
        className: typeof el.className === "string" ? el.className : "",
        text: clean(el.textContent),
        rect: rect(el),
        css: css(el),
        html: el.outerHTML.slice(0, 1500)
      }));

    const links = Array.from(document.querySelectorAll("a, button, [role='button']"))
      .filter((el) => /Home|Request|Progress|Riwayat|Profil|History/.test(clean(el.textContent)))
      .map((el) => ({
        tag: el.tagName,
        href: el.getAttribute("href"),
        className: typeof el.className === "string" ? el.className : "",
        text: clean(el.textContent),
        active: /active|selected|current/i.test(String(el.className || "")) || el.getAttribute("aria-current"),
        rect: rect(el),
        css: css(el),
        html: el.outerHTML.slice(0, 1000)
      }));

    const stylesheets = Array.from(document.querySelectorAll("link[rel='stylesheet']")).map((el) => el.getAttribute("href"));

    return {
      title: document.title,
      bodyClass: document.body.className,
      stylesheets,
      navCandidates,
      links,
      bodyTextSample: clean(document.body.innerText).slice(0, 1200)
    };
  });

  results.push({
    page: pageInfo.name,
    url: pageInfo.url,
    status,
    error,
    screenshot: shot,
    dom
  });

  await page.close();
}

await browser.close();

const summary = results.map((r) => ({
  page: r.page,
  status: r.status,
  screenshot: r.screenshot,
  stylesheetCount: r.dom.stylesheets.length,
  stylesheets: r.dom.stylesheets,
  navCount: r.dom.navCandidates.length,
  linkCount: r.dom.links.length,
  navTexts: r.dom.navCandidates.map((n) => n.text),
  linkTexts: r.dom.links.map((n) => n.text),
  activeLinks: r.dom.links.filter((n) => n.active).map((n) => n.text),
  navClasses: r.dom.navCandidates.map((n) => n.className),
  linkClasses: r.dom.links.map((n) => n.className)
}));

fs.writeFileSync(report, JSON.stringify({
  ok: true,
  mode: "SMARTUI_BOTTOM_NAV_TRUE_DIAGNOSIS_ONLY",
  generatedAt: new Date().toISOString(),
  summary,
  results
}, null, 2));

console.log(JSON.stringify({
  ok: true,
  report,
  summary
}, null, 2));
