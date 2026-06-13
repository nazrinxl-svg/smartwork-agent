import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const base = "http://127.0.0.1:4179";
const pages = ["home.html", "request.html", "progress.html", "history.html", "profile.html"];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 430, height: 820 },
  deviceScaleFactor: 1
});

const results = [];
const findings = [];

for (const p of pages) {
  await page.goto(`${base}/${p}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  const shot = path.join("shots", "heading-consistency", `${p.replace(".html", "")}-heading.png`);
  await page.screenshot({ path: shot, fullPage: false });

  const data = await page.evaluate(() => {
    function info(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        className: el.className || "",
        text: (el.textContent || "").trim().replace(/\s+/g, " "),
        top: Math.round(r.top),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height),
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        marginTop: cs.marginTop,
        marginBottom: cs.marginBottom,
        paddingTop: cs.paddingTop,
        paddingBottom: cs.paddingBottom,
        display: cs.display
      };
    }

    const headingSelectors = [
      "h1",
      ".page-title",
      ".title",
      ".hero-title",
      ".screen-title",
      ".section-title",
      "header h1",
      "main h1",
      "main h2"
    ];

    const headings = [];
    const seen = new Set();

    for (const selector of headingSelectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (seen.has(el)) continue;
        seen.add(el);
        const item = info(el);
        if (item && item.text) headings.push({ selector, ...item });
      }
    }

    const headerCandidates = [];
    for (const selector of ["header", ".topbar", ".app-header", ".page-header", ".hero", ".app"]) {
      for (const el of document.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect();
        if (r.width > 250 && r.height > 20 && r.top < 220) {
          headerCandidates.push({ selector, ...info(el) });
        }
      }
    }

    return {
      url: location.pathname,
      documentTitle: document.title,
      bodyWidth: Math.round(document.body.getBoundingClientRect().width),
      headings,
      headerCandidates
    };
  });

  results.push({ ...data, screenshot: shot });
}

await browser.close();

const primary = results.map((r) => {
  const h1 = r.headings.find((h) => h.tag === "H1") || r.headings[0] || null;
  return {
    url: r.url,
    title: h1?.text || "",
    top: h1?.top ?? null,
    left: h1?.left ?? null,
    width: h1?.width ?? null,
    height: h1?.height ?? null,
    fontSize: h1?.fontSize || "",
    fontWeight: h1?.fontWeight || "",
    lineHeight: h1?.lineHeight || "",
    marginBottom: h1?.marginBottom || "",
    screenshot: r.screenshot
  };
});

const fontSizes = [...new Set(primary.map((x) => x.fontSize).filter(Boolean))];
const fontWeights = [...new Set(primary.map((x) => x.fontWeight).filter(Boolean))];
const lefts = primary.map((x) => x.left).filter((x) => x !== null);
const tops = primary.map((x) => x.top).filter((x) => x !== null);

if (fontSizes.length > 1) findings.push(`Primary heading font-size tidak konsisten: ${fontSizes.join(", ")}`);
if (fontWeights.length > 1) findings.push(`Primary heading font-weight tidak konsisten: ${fontWeights.join(", ")}`);

if (lefts.length) {
  const minLeft = Math.min(...lefts);
  const maxLeft = Math.max(...lefts);
  if (maxLeft - minLeft > 6) findings.push(`Primary heading left offset beda >6px: min=${minLeft}, max=${maxLeft}`);
}

if (tops.length) {
  const minTop = Math.min(...tops);
  const maxTop = Math.max(...tops);
  if (maxTop - minTop > 28) findings.push(`Primary heading top position beda jauh: min=${minTop}, max=${maxTop}`);
}

for (const row of primary) {
  if (!row.title) findings.push(`${row.url}: primary heading tidak terdeteksi`);
  if (row.title && row.title.length > 34) findings.push(`${row.url}: judul heading panjang/rawan berat: "${row.title}"`);
}

const report = {
  ok: true,
  generatedAt: new Date().toISOString(),
  mode: "SMARTWORK_HEADING_CONSISTENCY_DIAGNOSIS_ONLY",
  safety: {
    noPatch: true,
    noLoginChange: true,
    noBottomNavChange: true,
    noRoutingChange: true,
    noIconChange: true,
    noManifestChange: true,
    noApiBridgeChange: true,
    noSiagaInput: true,
    noRealSaveSendDelete: true
  },
  summary: {
    pageCount: pages.length,
    primary,
    findings
  },
  results
};

fs.writeFileSync(
  "reports/smartwork-heading-consistency-diagnosis.json",
  JSON.stringify(report, null, 2)
);

console.log(JSON.stringify(report.summary, null, 2));
console.log("\nREPORT: reports/smartwork-heading-consistency-diagnosis.json");
console.log("SHOTS: shots/heading-consistency");
