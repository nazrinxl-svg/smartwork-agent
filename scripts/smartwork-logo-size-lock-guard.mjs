import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const repo = process.cwd();
const require = createRequire(path.join(repo, "package.json"));
const { chromium } = require("playwright");

const expected = {
  boxWidth: 42,
  boxHeight: 42,
  imgWidth: 38,
  imgHeight: 38
};

const pages = [
  {
    name:"Home",
    file:"public/home.html",
    box:".brand-logo",
    img:".brand-logo img"
  },
  {
    name:"Request",
    file:"public/request.html",
    box:".request-heading .heading-brand .logo",
    img:".request-heading .heading-brand .logo > img"
  },
  {
    name:"Progress",
    file:"public/progress.html",
    box:".brand-logo",
    img:".brand-logo img"
  },
  {
    name:"History",
    file:"public/history.html",
    box:".top-hero > .hero > .logo",
    img:".top-hero > .hero > .logo > img"
  }
];

const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({ viewport:{ width:430, height:900 }, deviceScaleFactor:1 });
const page = await context.newPage();

async function readBox(selector) {
  const loc = page.locator(selector).first();
  const count = await loc.count().catch(() => 0);
  if (!count) return null;

  return await loc.evaluate((el, selector) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      selector,
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
      cssWidth: cs.width,
      cssHeight: cs.height,
      objectFit: cs.objectFit,
      display: cs.display
    };
  }, selector);
}

const results = [];
const failures = [];

for (const p of pages) {
  await page.goto(pathToFileURL(path.join(repo, p.file)).href, {
    waitUntil:"domcontentloaded",
    timeout:15000
  });
  await page.waitForTimeout(500);

  const box = await readBox(p.box);
  const img = await readBox(p.img);

  const ok =
    box &&
    img &&
    box.width === expected.boxWidth &&
    box.height === expected.boxHeight &&
    img.width === expected.imgWidth &&
    img.height === expected.imgHeight;

  const item = {
    name:p.name,
    file:p.file,
    selectors:{ box:p.box, img:p.img },
    expected,
    actual:{ box, img },
    ok
  };

  results.push(item);

  if (!ok) {
    failures.push(item);
  }
}

await browser.close();

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  lockName: "SMARTWORK_LOGO_SIZE_LOCK_PHASE5ZV_J",
  rule: "Home, Request, Progress, History logo box must stay 42x42 and logo image must stay 38x38.",
  expected,
  results,
  failures
};

const out = path.join(repo, "docs/checkpoints/smartwork-logo-size-lock-phase5zv-j.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");

console.log("\n=== LOGO SIZE LOCK RESULT ===");
for (const r of results) {
  const b = r.actual.box || {};
  const i = r.actual.img || {};
  console.log(`${r.name.padEnd(8)} | box ${String(b.width ?? "-").padStart(3)}x${String(b.height ?? "-").padEnd(3)} top ${String(b.top ?? "-").padEnd(4)} left ${String(b.left ?? "-").padEnd(4)} | img ${String(i.width ?? "-").padStart(3)}x${String(i.height ?? "-").padEnd(3)} top ${String(i.top ?? "-").padEnd(4)} left ${String(i.left ?? "-").padEnd(4)} | ${r.ok ? "OK" : "FAIL"}`);
}

console.log(`\nReport: ${out}`);

if (failures.length) {
  console.error("\nSTOP: LOGO SIZE LOCK FAILED.");
  process.exit(1);
}

console.log("\nOK: LOGO SIZE LOCK PASSED.");
