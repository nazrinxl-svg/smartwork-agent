import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const outDir = path.join(ROOT, "reports");
const shotDir = path.join(ROOT, "shots");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.join(outDir, "smartui-progress-kpi-true-diagnosis.json");
const shot = path.join(shotDir, `${stamp}-smartui-progress-kpi-true-diagnosis.png`);

const browser = await chromium.launch({
  headless: false,
  channel: "chrome"
});

const page = await browser.newPage({
  viewport: { width: 430, height: 900 },
  deviceScaleFactor: 1
});

await page.goto("http://localhost:3107/progress.html?diagnose=" + Date.now(), {
  waitUntil: "networkidle",
  timeout: 20000
});

await page.screenshot({ path: shot, fullPage: true });

const diagnosis = await page.evaluate(() => {
  const wantedLabels = ["Total", "Terisi", "Perlu cek"];

  function clean(v) {
    return String(v || "").replace(/\s+/g, " ").trim();
  }

  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom)
    };
  }

  function cssOf(el) {
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
      position: cs.position,
      flexDirection: cs.flexDirection,
      alignItems: cs.alignItems,
      justifyContent: cs.justifyContent,
      gap: cs.gap,
      gridTemplateColumns: cs.gridTemplateColumns,
      width: cs.width,
      height: cs.height,
      padding: cs.padding,
      margin: cs.margin,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      color: cs.color,
      whiteSpace: cs.whiteSpace
    };
  }

  function nodeInfo(el, depth = 0) {
    if (!el || depth > 2) return null;

    return {
      tag: el.tagName,
      id: el.id || "",
      className: typeof el.className === "string" ? el.className : "",
      text: clean(el.textContent).slice(0, 300),
      ownText: Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => clean(n.textContent))
        .filter(Boolean)
        .join(" "),
      childCount: el.children.length,
      rect: rectOf(el),
      css: cssOf(el),
      children: Array.from(el.children).slice(0, 8).map((child) => nodeInfo(child, depth + 1))
    };
  }

  function pathOf(el) {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body && parts.length < 8) {
      let p = cur.tagName.toLowerCase();
      if (cur.id) p += "#" + cur.id;
      if (typeof cur.className === "string" && cur.className.trim()) {
        p += "." + cur.className.trim().split(/\s+/).slice(0, 4).join(".");
      }
      parts.unshift(p);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  const labelMatches = [];

  for (const label of wantedLabels) {
    const exactNodes = Array.from(document.querySelectorAll("body *")).filter((el) => {
      return clean(el.textContent) === label;
    });

    const containsNodes = Array.from(document.querySelectorAll("body *")).filter((el) => {
      const t = clean(el.textContent);
      return t.includes(label) && t !== label;
    });

    const chosen = exactNodes.length ? exactNodes : containsNodes.slice(0, 10);

    labelMatches.push({
      label,
      exactCount: exactNodes.length,
      containsCount: containsNodes.length,
      nodes: chosen.slice(0, 10).map((el) => {
        const parent = el.parentElement;
        const grand = parent?.parentElement;
        const card = el.closest("div, section, article");

        const nearNumbers = [];
        const scope = grand || parent || document.body;
        Array.from(scope.querySelectorAll("*")).forEach((n) => {
          const t = clean(n.textContent);
          if (/^\d+$/.test(t)) {
            nearNumbers.push({
              text: t,
              tag: n.tagName,
              className: typeof n.className === "string" ? n.className : "",
              rect: rectOf(n),
              css: cssOf(n),
              path: pathOf(n)
            });
          }
        });

        return {
          path: pathOf(el),
          node: nodeInfo(el),
          parent: nodeInfo(parent),
          grandParent: nodeInfo(grand),
          closestDivOrSection: nodeInfo(card),
          nearNumbers: nearNumbers.slice(0, 10)
        };
      })
    });
  }

  const visibleText = clean(document.body.innerText);

  const kpiLikeElements = Array.from(document.querySelectorAll("body *"))
    .filter((el) => {
      const t = clean(el.textContent);
      return (
        /Total|Terisi|Perlu cek/.test(t) ||
        /^30$|^26$|^0$/.test(t)
      );
    })
    .map((el) => ({
      path: pathOf(el),
      tag: el.tagName,
      className: typeof el.className === "string" ? el.className : "",
      text: clean(el.textContent).slice(0, 200),
      rect: rectOf(el),
      css: cssOf(el),
      html: el.outerHTML.slice(0, 1000)
    }));

  return {
    url: location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    bodyTextSample: visibleText.slice(0, 2000),
    labelMatches,
    kpiLikeElements: kpiLikeElements.slice(0, 80)
  };
});

fs.writeFileSync(out, JSON.stringify({
  ok: true,
  mode: "SMARTUI_PROGRESS_KPI_TRUE_DIAGNOSIS_ONLY",
  generatedAt: new Date().toISOString(),
  screenshot: shot,
  diagnosis
}, null, 2));

await browser.close();

console.log(JSON.stringify({
  ok: true,
  report: out,
  screenshot: shot
}, null, 2));
