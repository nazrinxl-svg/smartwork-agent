import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const PORT = 3107;
const BASE = `http://localhost:${PORT}`;

const pages = [
  { name: "home", file: "public/home.html", url: `${BASE}/home.html` },
  { name: "request", file: "public/request.html", url: `${BASE}/request.html` },
  { name: "progress", file: "public/progress.html", url: `${BASE}/progress.html` },
  { name: "history", file: "public/history.html", url: `${BASE}/history.html` },
  { name: "profile", file: "public/profile.html", url: `${BASE}/profile.html` },
];

const out = path.join(ROOT, "reports", "smartwork-bottom-nav-true-diagnosis.json");

function readFileSafe(file){
  try {
    return fs.readFileSync(path.join(ROOT, file), "utf8");
  } catch {
    return "";
  }
}

function extractRules(html){
  const patterns = [
    /\.bottom-nav\s*\{[\s\S]*?\}/g,
    /\.bottom\s*\{[\s\S]*?\}/g,
    /\.nav\s*\{[\s\S]*?\}/g,
    /\.navIcon\s*\{[\s\S]*?\}/g,
    /\.nav\.active\s*\{[\s\S]*?\}/g,
    /\.nav\.active\s+\.navIcon\s*\{[\s\S]*?\}/g,
    /\.bottom\s+\.nav\s*\{[\s\S]*?\}/g,
    /\.bottom\s+\.navIcon\s*\{[\s\S]*?\}/g,
    /\.bottom\s+\.nav\.active\s*\{[\s\S]*?\}/g,
    /\.bottom\s+\.nav\.active\s+\.navIcon\s*\{[\s\S]*?\}/g,
  ];

  const rules = [];
  for (const pattern of patterns) {
    const matches = html.match(pattern) || [];
    for (const m of matches) rules.push(m);
  }
  return rules;
}

function sourceDiagnosis(file){
  const html = readFileSafe(file);
  return {
    file,
    length: html.length,
    hasBottomNavClass: html.includes("bottom-nav"),
    hasBottomClass: html.includes('class="bottom"') || html.includes("class='bottom'"),
    hasNavClass: html.includes('class="nav') || html.includes("class='nav"),
    hasFinalConsistencyOverride: html.includes("SmartUI Progress Final Consistency Override"),
    hasBottomNavMatchOverride: html.includes("SmartUI Progress Bottom Nav Match Override"),
    bottomNavCount: (html.match(/bottom-nav/g) || []).length,
    bottomClassCount: (html.match(/class="bottom"/g) || []).length,
    navActiveCount: (html.match(/nav active/g) || []).length,
    extractedCssRules: extractRules(html),
    navHtml: ((html.match(/<nav[\s\S]*?<\/nav>/i) || [null])[0] || "").slice(0, 1600),
  };
}

function roundRect(r){
  if (!r) return null;
  return {
    left: Math.round(r.left),
    top: Math.round(r.top),
    right: Math.round(r.right),
    bottom: Math.round(r.bottom),
    width: Math.round(r.width),
    height: Math.round(r.height),
    x: Math.round(r.x),
    y: Math.round(r.y),
  };
}

const browser = await chromium.launch({
  headless: true,
  channel: "chrome",
});

const results = [];

for (const p of pages) {
  const page = await browser.newPage({
    viewport: { width: 430, height: 900 },
    deviceScaleFactor: 1,
    isMobile: true,
  });

  await page.goto(p.url, { waitUntil: "networkidle" }).catch(async () => {
    await page.goto(p.url, { waitUntil: "domcontentloaded" });
  });

  const runtime = await page.evaluate(() => {
    const nav =
      document.querySelector(".bottom-nav") ||
      document.querySelector("nav.bottom") ||
      document.querySelector(".bottom");

    const active =
      nav?.querySelector(".active") ||
      document.querySelector(".active");

    const activeIcon =
      active?.querySelector(".navIcon") ||
      active?.querySelector("span") ||
      null;

    const firstItem =
      nav?.querySelector("a, button, .nav") || null;

    function pack(el){
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();

      return {
        tag: el.tagName,
        className: String(el.className || ""),
        rect: {
          left: Math.round(r.left),
          top: Math.round(r.top),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
          width: Math.round(r.width),
          height: Math.round(r.height),
        },
        computed: {
          position: cs.position,
          left: cs.left,
          bottom: cs.bottom,
          width: cs.width,
          height: cs.height,
          minHeight: cs.minHeight,
          padding: cs.padding,
          margin: cs.margin,
          borderTop: cs.borderTop,
          borderRadius: cs.borderRadius,
          boxShadow: cs.boxShadow,
          backgroundColor: cs.backgroundColor,
          display: cs.display,
          gridTemplateColumns: cs.gridTemplateColumns,
          gap: cs.gap,
          flexDirection: cs.flexDirection,
          alignItems: cs.alignItems,
          justifyContent: cs.justifyContent,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          color: cs.color,
          zIndex: cs.zIndex,
        },
        outerHTML: el.outerHTML.slice(0, 900),
      };
    }

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      selectorsFound: {
        bottomNav: !!document.querySelector(".bottom-nav"),
        navBottom: !!document.querySelector("nav.bottom"),
        bottom: !!document.querySelector(".bottom"),
      },
      nav: pack(nav),
      active: pack(active),
      activeIcon: pack(activeIcon),
      firstItem: pack(firstItem),
    };
  });

  results.push({
    page: p.name,
    file: p.file,
    url: p.url,
    source: sourceDiagnosis(p.file),
    runtime,
  });

  await page.close();
}

await browser.close();

const home = results.find(r => r.page === "home");
const request = results.find(r => r.page === "request");
const progress = results.find(r => r.page === "progress");
const profile = results.find(r => r.page === "profile");

function diffAgainstProgress(other){
  return {
    comparedWith: other.page,
    selectorDifferent: JSON.stringify(progress.runtime.selectorsFound) !== JSON.stringify(other.runtime.selectorsFound),
    navClassProgress: progress.runtime.nav?.className || null,
    navClassOther: other.runtime.nav?.className || null,
    navWidthProgress: progress.runtime.nav?.rect?.width || null,
    navWidthOther: other.runtime.nav?.rect?.width || null,
    navHeightProgress: progress.runtime.nav?.rect?.height || null,
    navHeightOther: other.runtime.nav?.rect?.height || null,
    navPaddingProgress: progress.runtime.nav?.computed?.padding || null,
    navPaddingOther: other.runtime.nav?.computed?.padding || null,
    navBorderRadiusProgress: progress.runtime.nav?.computed?.borderRadius || null,
    navBorderRadiusOther: other.runtime.nav?.computed?.borderRadius || null,
    navBoxShadowProgress: progress.runtime.nav?.computed?.boxShadow || null,
    navBoxShadowOther: other.runtime.nav?.computed?.boxShadow || null,
    activeIconSizeProgress: progress.runtime.activeIcon?.rect || null,
    activeIconSizeOther: other.runtime.activeIcon?.rect || null,
    activeIconPaddingProgress: progress.runtime.activeIcon?.computed?.padding || null,
    activeIconPaddingOther: other.runtime.activeIcon?.computed?.padding || null,
  };
}

const summary = {
  ok: true,
  mode: "SMARTWORK_BOTTOM_NAV_TRUE_DIAGNOSIS_NO_PATCH",
  generatedAt: new Date().toISOString(),
  conclusionCandidates: [
    "Baca bagian diff.progressVsHome/request/profile di report. Jangan patch sebelum angka dan selector beda terlihat.",
  ],
  progressVsHome: diffAgainstProgress(home),
  progressVsRequest: diffAgainstProgress(request),
  progressVsProfile: diffAgainstProgress(profile),
  results,
};

fs.writeFileSync(out, JSON.stringify(summary, null, 2));

console.log("\n=== PROGRESS VS HOME ===");
console.log(JSON.stringify(summary.progressVsHome, null, 2));

console.log("\n=== PROGRESS VS REQUEST ===");
console.log(JSON.stringify(summary.progressVsRequest, null, 2));

console.log("\n=== PROGRESS VS PROFILE ===");
console.log(JSON.stringify(summary.progressVsProfile, null, 2));

console.log("\n=== PROGRESS SOURCE FLAGS ===");
console.log(JSON.stringify(progress.source, null, 2));

console.log(`\nREPORT=${out}`);
