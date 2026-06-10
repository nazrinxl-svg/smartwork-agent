import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportsDir = path.join(ROOT, "reports");
const shotsDir = path.join(ROOT, "shots");
fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportsDir, "smartui-mobile-layout-diagnose-report.json");

const pages = [
  { name: "home", url: "http://localhost:3107/home.html" },
  { name: "progress", url: "http://localhost:3107/progress.html" },
  { name: "profile", url: "http://localhost:3107/profile.html" }
];

function issue(type, severity, detail = {}) {
  return { type, severity, detail };
}

const browser = await chromium.launch({ headless: false, channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: 430, height: 900 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true
});

const results = [];

for (const target of pages) {
  const pageIssues = [];
  const shot = path.join(shotsDir, `${ts}-smartui-mobile-${target.name}.png`);

  try {
    await page.goto(`${target.url}?smartui=${Date.now()}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.screenshot({ path: shot, fullPage: true });

    const metrics = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      const app = document.querySelector(".app,.phone,main") || body;
      const nav = document.querySelector(".bottom,nav.bottom,nav");

      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
          bottom: Math.round(r.bottom),
          right: Math.round(r.right)
        };
      };

      const visible = Array.from(document.querySelectorAll("body *")).filter(el => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 1 && r.height > 1 && st.display !== "none" && st.visibility !== "hidden";
      });

      const cards = visible.filter(el => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        const cls = String(el.className || "");
        const radius = parseFloat(st.borderRadius || "0");
        const bg = st.backgroundColor || "";
        return r.width >= 120 && r.height >= 38 && (
          cls.match(/card|hero|panel|agent|profile|menu|summary|status|quick|work/i) ||
          radius >= 14 ||
          bg.includes("255, 255, 255")
        );
      }).map(el => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return {
          tag: el.tagName,
          className: String(el.className || ""),
          text: (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
          fontSize: st.fontSize,
          borderRadius: st.borderRadius,
          background: st.backgroundColor
        };
      });

      const brokenImages = Array.from(document.images)
        .filter(img => !img.complete || img.naturalWidth === 0)
        .map(img => ({
          src: img.getAttribute("src"),
          alt: img.getAttribute("alt"),
          x: Math.round(img.getBoundingClientRect().x),
          y: Math.round(img.getBoundingClientRect().y)
        }));

      const bodyText = body.innerText.replace(/\s+/g, " ").trim();

      return {
        viewport: { width: innerWidth, height: innerHeight },
        document: { scrollHeight: html.scrollHeight, bodyHeight: body.scrollHeight },
        app: rect(app),
        nav: rect(nav),
        cardCount: cards.length,
        visibleCount: visible.length,
        cards,
        brokenImages,
        bodyText: bodyText.slice(0, 4000)
      };
    });

    if (metrics.document.scrollHeight > 950) {
      pageIssues.push(issue("too_tall_for_mobile_app", "medium", {
        scrollHeight: metrics.document.scrollHeight,
        targetMax: 900
      }));
    }

    const tallCards = metrics.cards.filter(c => c.height > 170);
    if (tallCards.length) {
      pageIssues.push(issue("too_many_tall_cards", "medium", {
        count: tallCards.length,
        cards: tallCards.slice(0, 6)
      }));
    }

    if (metrics.cardCount > 12) {
      pageIssues.push(issue("too_many_visible_cards", "medium", {
        cardCount: metrics.cardCount,
        targetMax: 8
      }));
    }

    if (metrics.brokenImages.length) {
      pageIssues.push(issue("broken_images_found", "high", {
        brokenImages: metrics.brokenImages
      }));
    }

    if (target.name === "home") {
      const agentMentions = (metrics.bodyText.match(/Agent/g) || []).length;
      if (agentMentions > 7) {
        pageIssues.push(issue("home_too_many_agent_cards", "medium", {
          agentMentions,
          recommendation: "Show 4 primary agents only; move rest behind Lihat Semua."
        }));
      }
    }

    if (target.name === "profile") {
      if (metrics.cardCount > 6) {
        pageIssues.push(issue("profile_too_many_cards", "medium", {
          cardCount: metrics.cardCount,
          recommendation: "Collapse legal/security links into compact menu."
        }));
      }
      if (metrics.bodyText.includes("Foto Profil")) {
        pageIssues.push(issue("profile_broken_photo_text_visible", "high", {
          recommendation: "Replace broken image with initials/avatar fallback."
        }));
      }
    }

    results.push({
      ...target,
      ok: pageIssues.length === 0,
      shot,
      issues: pageIssues,
      metrics: {
        viewport: metrics.viewport,
        document: metrics.document,
        app: metrics.app,
        nav: metrics.nav,
        cardCount: metrics.cardCount,
        visibleCount: metrics.visibleCount,
        brokenImages: metrics.brokenImages
      },
      topCards: metrics.cards.slice(0, 20)
    });
  } catch (error) {
    results.push({
      ...target,
      ok: false,
      shot,
      issues: [issue("diagnose_runtime_error", "high", { error: String(error?.message || error) })]
    });
  }
}

await browser.close();

const allIssues = results.flatMap(r => r.issues.map(i => ({ page: r.name, ...i })));

const report = {
  ok: allIssues.length === 0,
  mode: "SMARTUI_MOBILE_LAYOUT_DIAGNOSE",
  generatedAt: new Date().toISOString(),
  summary: {
    pagesChecked: results.length,
    issueCount: allIssues.length
  },
  issues: allIssues,
  recommendations: [
    "Use one shared mobile layout language: max 430px, 12-14px padding, compact card radius 16-18px.",
    "Home should show only 4 primary agents; extra agents behind Lihat Semua.",
    "Progress RESULT_READY should be action-first: main download button, 4 small stats, one proof row, one system line.",
    "Profile should use avatar fallback, one account card, one compact settings/menu list.",
    "Avoid showing many white cards at once; use compact list rows instead."
  ],
  results
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`SMARTUI_MOBILE_LAYOUT_DIAGNOSE=${report.ok ? "OK" : "NEEDS_FIX"}`);
console.log(`REPORT=${reportPath}`);
console.log(JSON.stringify({
  ok: report.ok,
  summary: report.summary,
  issues: report.issues,
  shots: results.map(r => ({ page: r.name, shot: r.shot }))
}, null, 2));
