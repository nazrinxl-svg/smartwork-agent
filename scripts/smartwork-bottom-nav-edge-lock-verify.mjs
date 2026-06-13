import { chromium } from "playwright";
import fs from "node:fs";

const base = "http://127.0.0.1:4179";
const pages = ["home.html", "request.html", "progress.html", "history.html", "profile.html"];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 430, height: 820 },
  deviceScaleFactor: 1
});

const results = [];
const failures = [];

for (const p of pages) {
  await page.goto(`${base}/${p}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);

  const data = await page.evaluate(() => {
    const nav = document.querySelector(".bottom-nav");
    if (!nav) {
      return { missing: true, url: location.pathname };
    }

    const r = nav.getBoundingClientRect();
    const cs = getComputedStyle(nav);
    const links = Array.from(nav.querySelectorAll("a")).map((a) => ({
      text: (a.textContent || "").trim().replace(/\s+/g, " "),
      href: a.getAttribute("href") || ""
    }));

    return {
      missing: false,
      url: location.pathname,
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      height: Math.round(r.height),
      viewportWidth: window.innerWidth,
      bodyWidth: Math.round(document.body.getBoundingClientRect().width),
      scrollWidth: document.documentElement.scrollWidth,
      position: cs.position,
      display: cs.display,
      boxSizing: cs.boxSizing,
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      maxWidth: cs.maxWidth,
      transform: cs.transform,
      linkCount: links.length,
      links
    };
  });

  if (data.missing) {
    failures.push(`${p}: bottom-nav missing`);
  } else {
    const edgeOk =
      Math.abs(data.left - 0) <= 1 &&
      Math.abs(data.right - data.viewportWidth) <= 1 &&
      Math.abs(data.width - data.viewportWidth) <= 1 &&
      data.paddingLeft === "0px" &&
      data.paddingRight === "0px" &&
      data.linkCount >= 5;

    data.edgeOk = edgeOk;

    if (!edgeOk) {
      failures.push(`${p}: edge lock failed left=${data.left} right=${data.right} width=${data.width} viewport=${data.viewportWidth} padding=${data.paddingLeft}/${data.paddingRight} links=${data.linkCount}`);
    }
  }

  results.push(data);
}

await browser.close();

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  mode: "SMARTWORK_BOTTOM_NAV_EDGE_LOCK_VERIFY",
  safety: {
    noLoginChange: true,
    noRoutingChange: true,
    noIconChange: true,
    noManifestChange: true,
    noApiBridgeChange: true,
    noSiagaInput: true,
    noBrowserAutomationToSiaga: true,
    noRealSaveSendDelete: true
  },
  failures,
  results
};

fs.mkdirSync("reports", { recursive: true });
fs.mkdirSync("docs/checkpoints", { recursive: true });

fs.writeFileSync(
  "reports/smartwork-bottom-nav-edge-lock-verify.json",
  JSON.stringify(report, null, 2)
);

fs.writeFileSync(
  "docs/checkpoints/bottom-nav-edge-lock-final-phase5zv-f.json",
  JSON.stringify(report, null, 2)
);

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exit(1);
}
