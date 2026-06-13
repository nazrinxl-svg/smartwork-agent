import { chromium } from "playwright";

const base = "http://127.0.0.1:4179";
const pages = ["history.html", "profile.html"];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 430, height: 820 },
  deviceScaleFactor: 1
});

for (const p of pages) {
  await page.goto(`${base}/${p}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    function info(el, selector) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        selector,
        tag: el.tagName,
        className: el.className || "",
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100),
        top: Math.round(r.top),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height),
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight
      };
    }

    const selectors = [
      "header",
      ".topbar",
      ".hero",
      ".request-heading",
      ".app-header",
      ".page-header",
      "h1",
      "main h1",
      "main h2"
    ];

    const rows = [];
    const seen = new Set();

    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (seen.has(el)) continue;
        seen.add(el);

        const r = el.getBoundingClientRect();
        if (r.top <= 220 && r.width >= 80 && r.height >= 10) {
          rows.push(info(el, selector));
        }
      }
    }

    return {
      url: location.pathname,
      rows
    };
  });

  console.log("\nPAGE", result.url);
  for (const row of result.rows) {
    console.log(JSON.stringify(row));
  }
}

await browser.close();
