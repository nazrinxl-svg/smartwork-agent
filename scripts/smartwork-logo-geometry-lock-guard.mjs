import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const repo = process.cwd();
const require = createRequire(path.join(repo, "package.json"));
const { chromium } = require("playwright");

const expected = {
  boxLeft: 14,
  boxTop: 14,
  boxWidth: 42,
  boxHeight: 42,
  imgLeft: 16,
  imgTop: 16,
  imgWidth: 38,
  imgHeight: 38,
  insetX: 2,
  insetY: 2
};

const pages = [
  ["Home", "public/home.html", ".brand-logo", ".brand-logo img"],
  ["Request", "public/request.html", ".request-heading .heading-brand .logo", ".request-heading .heading-brand .logo > img"],
  ["Progress", "public/progress.html", ".brand-logo", ".brand-logo img"],
  ["History", "public/history.html", ".top-hero > .hero > .logo", ".top-hero > .hero > .logo > img"]
];

const browser = await chromium.launch({ headless:true });
const context = await browser.newContext({ viewport:{ width:430, height:900 }, deviceScaleFactor:1 });
const page = await context.newPage();

async function read(selector) {
  const loc = page.locator(selector).first();
  const count = await loc.count().catch(() => 0);
  if (!count) return null;

  return await loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left),
      top: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height)
    };
  });
}

const results = [];
const failures = [];

for (const [name, file, boxSel, imgSel] of pages) {
  await page.goto(pathToFileURL(path.join(repo, file)).href, {
    waitUntil:"domcontentloaded",
    timeout:15000
  });
  await page.waitForTimeout(500);

  const box = await read(boxSel);
  const img = await read(imgSel);

  const insetX = img && box ? img.left - box.left : null;
  const insetY = img && box ? img.top - box.top : null;

  const ok =
    box &&
    img &&
    box.left === expected.boxLeft &&
    box.top === expected.boxTop &&
    box.width === expected.boxWidth &&
    box.height === expected.boxHeight &&
    img.left === expected.imgLeft &&
    img.top === expected.imgTop &&
    img.width === expected.imgWidth &&
    img.height === expected.imgHeight &&
    insetX === expected.insetX &&
    insetY === expected.insetY;

  const item = {
    name,
    file,
    selectors:{ box:boxSel, img:imgSel },
    expected,
    actual:{ box, img, insetX, insetY },
    ok
  };

  results.push(item);
  if (!ok) failures.push(item);
}

await browser.close();

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  lockName: "SMARTWORK_LOGO_GEOMETRY_LOCK_PHASE5ZV_L3",
  rule: "Home, Request, Progress, History logo box must be L14/T14/42x42 and image must be L16/T16/38x38 with inset 2/2.",
  expected,
  results,
  failures
};

const out = path.join(repo, "docs/checkpoints/smartwork-logo-geometry-lock-phase5zv-l3.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");

console.log("\n=== LOGO GEOMETRY LOCK RESULT ===");
for (const r of results) {
  const b = r.actual.box || {};
  const i = r.actual.img || {};
  console.log(`${r.name.padEnd(8)} | box ${String(b.width ?? "-").padStart(3)}x${String(b.height ?? "-").padEnd(3)} L${String(b.left ?? "-").padEnd(3)} T${String(b.top ?? "-").padEnd(3)} | img ${String(i.width ?? "-").padStart(3)}x${String(i.height ?? "-").padEnd(3)} L${String(i.left ?? "-").padEnd(3)} T${String(i.top ?? "-").padEnd(3)} | inset X${String(r.actual.insetX ?? "-").padEnd(2)} Y${String(r.actual.insetY ?? "-").padEnd(2)} | ${r.ok ? "OK" : "FAIL"}`);
}

console.log(`\nReport: ${out}`);

if (failures.length) {
  console.error("\nSTOP: LOGO GEOMETRY LOCK FAILED.");
  process.exit(1);
}

console.log("\nOK: LOGO GEOMETRY LOCK PASSED.");
