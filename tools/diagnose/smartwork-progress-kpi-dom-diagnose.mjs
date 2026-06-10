import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const out = path.join(ROOT, "reports", "smartwork-progress-kpi-dom-diagnose.json");
const shot = path.join(ROOT, "shots", `${new Date().toISOString().replace(/[:.]/g, "-")}-progress-kpi-diagnose.png`);

const browser = await chromium.launch({
  headless: false,
  channel: "chrome"
});

const page = await browser.newPage({
  viewport: { width: 430, height: 900 },
  deviceScaleFactor: 1
});

await page.goto("http://localhost:3107/progress.html", {
  waitUntil: "networkidle",
  timeout: 15000
});

await page.screenshot({ path: shot, fullPage: true });

const result = await page.evaluate(() => {
  function clean(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  const labels = ["Total", "Terisi", "Perlu cek"];

  const matches = [];

  for (const label of labels) {
    const nodes = Array.from(document.querySelectorAll("body *"))
      .filter((el) => clean(el.textContent).includes(label))
      .map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          label,
          tag: el.tagName,
          className: el.className,
          id: el.id,
          text: clean(el.textContent),
          childCount: el.children.length,
          rect: {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height)
          },
          display: cs.display,
          flexDirection: cs.flexDirection,
          alignItems: cs.alignItems,
          justifyContent: cs.justifyContent,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
          parent: el.parentElement ? {
            tag: el.parentElement.tagName,
            className: el.parentElement.className,
            text: clean(el.parentElement.textContent),
            childCount: el.parentElement.children.length
          } : null,
          html: el.outerHTML.slice(0, 800)
        };
      });

    matches.push({ label, nodes: nodes.slice(0, 12) });
  }

  return {
    url: location.href,
    title: document.title,
    bodyTextSample: clean(document.body.innerText).slice(0, 2000),
    matches
  };
});

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({
  ok: true,
  screenshot: shot,
  result
}, null, 2));

await browser.close();

console.log(JSON.stringify({
  ok: true,
  report: out,
  screenshot: shot
}, null, 2));
