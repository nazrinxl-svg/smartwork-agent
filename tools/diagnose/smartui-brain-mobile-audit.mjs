import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportsDir = path.join(ROOT, "reports");
const shotsDir = path.join(ROOT, "shots");
const memoryDir = path.join(ROOT, "memory");
fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(memoryDir, { recursive: true });

const doctrinePath = path.join(memoryDir, "smartui-mobile-doctrine.json");
function readJsonNoBom(filePath) {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
  return JSON.parse(raw);
}

const doctrine = readJsonNoBom(doctrinePath);

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportsDir, "smartui-brain-mobile-report.json");
const patchPlanPath = path.join(reportsDir, "smartui-brain-patch-plan.json");

const pages = [
  { name: "home", file: "public/home.html", url: "http://localhost:3107/home.html", mode: "launcher-compact" },
  { name: "request", file: "public/request.html", url: "http://localhost:3107/request.html", mode: "form-compact" },
  { name: "progress", file: "public/progress.html", url: "http://localhost:3107/progress.html", mode: "result-ready-action-first" },
  { name: "history", file: "public/history.html", url: "http://localhost:3107/history.html", mode: "list-compact" },
  { name: "profile", file: "public/profile.html", url: "http://localhost:3107/profile.html", mode: "settings-compact" }
].filter(p => fs.existsSync(path.join(ROOT, p.file)));

function sevWeight(sev) {
  return sev === "high" ? 24 : sev === "medium" ? 12 : 5;
}

function addIssue(list, type, severity, detail = {}) {
  list.push({ type, severity, detail });
}

function scoreFromIssues(issues) {
  const penalty = issues.reduce((sum, i) => sum + sevWeight(i.severity), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

function uniq(arr) {
  return [...new Set(arr)];
}

const browser = await chromium.launch({ headless: false, channel: "chrome" });
const page = await browser.newPage({
  viewport: { width: doctrine.viewport.targetWidth, height: doctrine.viewport.targetHeight },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true
});

const results = [];

for (const target of pages) {
  const issues = [];
  const shot = path.join(shotsDir, `${ts}-smartui-brain-${target.name}.png`);

  try {
    await page.goto(`${target.url}?smartuiBrain=${Date.now()}`, {
      waitUntil: "networkidle",
      timeout: 30000
    });

    await page.screenshot({ path: shot, fullPage: true });

    const metrics = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const app = document.querySelector(".app,.phone,main,.shell,.page") || body;
      const nav = document.querySelector(".bottom,.bottom-nav,nav.bottom,nav");

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
        return r.width >= 110 && r.height >= 38 && (
          cls.match(/card|hero|panel|agent|profile|menu|summary|status|quick|work|activity|notify|metric|item/i) ||
          radius >= 14 ||
          bg.includes("255, 255, 255")
        );
      }).map(el => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return {
          tag: el.tagName,
          className: String(el.className || ""),
          text: (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140),
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
          fontSize: st.fontSize,
          fontWeight: st.fontWeight,
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

      const aboveFoldText = visible
        .filter(el => el.getBoundingClientRect().top < innerHeight - 80)
        .map(el => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" ")
        .slice(0, 2500);

      return {
        viewport: { width: innerWidth, height: innerHeight },
        document: { scrollHeight: html.scrollHeight, bodyHeight: body.scrollHeight },
        app: rect(app),
        nav: rect(nav),
        cardCount: cards.length,
        visibleCount: visible.length,
        cards,
        brokenImages,
        bodyText: bodyText.slice(0, 5000),
        aboveFoldText
      };
    });

    const maxScroll = target.name === "progress"
      ? doctrine.viewport.maxResultReadyScrollHeight
      : doctrine.viewport.maxNormalScrollHeight;

    if (metrics.document.scrollHeight > maxScroll) {
      addIssue(issues, "page_too_tall", "medium", {
        scrollHeight: metrics.document.scrollHeight,
        targetMax: maxScroll,
        overBy: metrics.document.scrollHeight - maxScroll
      });
    }

    const tallCards = metrics.cards.filter(c => c.height > doctrine.layoutRules.maxCardHeight);
    if (tallCards.length) {
      addIssue(issues, "tall_cards", "medium", {
        count: tallCards.length,
        maxAllowedHeight: doctrine.layoutRules.maxCardHeight,
        cards: tallCards.slice(0, 8)
      });
    }

    if (metrics.cardCount > doctrine.layoutRules.maxCardsPerPage) {
      addIssue(issues, "too_many_cards", "medium", {
        cardCount: metrics.cardCount,
        targetMax: doctrine.layoutRules.maxCardsPerPage
      });
    }

    if (metrics.brokenImages.length) {
      addIssue(issues, "broken_images", "high", {
        brokenImages: metrics.brokenImages
      });
    }

    const staleWords = [
      "Preview Siap",
      "Preview Berhasil",
      "Menunggu Konfirmasi",
      "menunggu izin eksekusi",
      "40%",
      "Jalankan workflow",
      "Foto Profil"
    ].filter(w => metrics.bodyText.includes(w));

    if (staleWords.length) {
      addIssue(issues, "stale_or_broken_text", "high", { staleWords });
    }

    if (target.name === "home") {
      const agentMentions = (metrics.bodyText.match(/Agent/g) || []).length;
      if (agentMentions > doctrine.homeScreen.maxVisibleAgents + 3) {
        addIssue(issues, "home_too_many_agents", "medium", {
          agentMentions,
          targetVisibleAgents: doctrine.homeScreen.maxVisibleAgents
        });
      }
      if (metrics.bodyText.includes("Notifikasi Agent") && metrics.bodyText.includes("Approval dibutuhkan")) {
        addIssue(issues, "home_notification_panel_too_prominent", "medium", {
          reason: "Notification panel takes attention from primary action."
        });
      }
    }

    if (target.name === "progress") {
      const required = ["Unduh PDF", "Bukti", "Email", "WhatsApp"];
      const missing = required.filter(w => !metrics.bodyText.includes(w));
      if (missing.length) {
        addIssue(issues, "progress_required_actions_missing", "medium", { missing });
      }
    }

    if (target.name === "profile") {
      const settingsCount = ["Tentang", "Privasi", "Syarat", "Keamanan", "Hubungi"]
        .filter(w => metrics.bodyText.includes(w)).length;
      if (settingsCount >= 5 && metrics.document.scrollHeight > 850) {
        addIssue(issues, "profile_menu_too_open", "medium", {
          settingsCount,
          recommendation: "Keep profile as compact identity + app info + 3 menu rows max."
        });
      }
    }

    const score = scoreFromIssues(issues);

    const patchHints = [];

    if (issues.some(i => i.type === "home_too_many_agents")) {
      patchHints.push("Home: show SIAGA/e-Kinerja/SIMPKB/ARKAS only; hide Dapodik/EMIS/e-Kinerja duplicate/Custom behind Lihat Semua.");
    }
    if (issues.some(i => i.type === "home_notification_panel_too_prominent")) {
      patchHints.push("Home: collapse notification panel into small bell count or remove from above fold.");
    }
    if (issues.some(i => i.type === "broken_images")) {
      patchHints.push("Replace broken image paths with inline SVG/avatar fallback or use existing asset path.");
    }
    if (issues.some(i => i.type === "profile_menu_too_open" || i.type === "tall_cards")) {
      patchHints.push("Profile: rebuild as compact settings screen: avatar row, version/security mini row, 3 menu rows.");
    }
    if (issues.some(i => i.type === "page_too_tall" || i.type === "too_many_cards")) {
      patchHints.push("Reduce visible cards, merge system/status rows, use list rows instead of card grids.");
    }

    results.push({
      ...target,
      ok: issues.length === 0,
      score,
      shot,
      issues,
      metrics: {
        viewport: metrics.viewport,
        document: metrics.document,
        app: metrics.app,
        nav: metrics.nav,
        cardCount: metrics.cardCount,
        visibleCount: metrics.visibleCount,
        brokenImages: metrics.brokenImages
      },
      patchHints: uniq(patchHints),
      topCards: metrics.cards.slice(0, 20)
    });

  } catch (error) {
    results.push({
      ...target,
      ok: false,
      score: 0,
      shot,
      issues: [{ type: "runtime_error", severity: "high", detail: { error: String(error?.message || error) } }],
      patchHints: ["Fix page load/runtime error before visual polish."]
    });
  }
}

await browser.close();

const allIssues = results.flatMap(r => r.issues.map(i => ({ page: r.name, ...i })));
const averageScore = Math.round(results.reduce((s, r) => s + r.score, 0) / Math.max(1, results.length));

const priorityOrder = ["high", "medium", "low"];
const priorityPatchQueue = allIssues
  .sort((a, b) => priorityOrder.indexOf(a.severity) - priorityOrder.indexOf(b.severity))
  .map(i => ({
    page: i.page,
    issue: i.type,
    severity: i.severity,
    action: i.type === "broken_images"
      ? "Fix image fallback/assets first."
      : i.type.includes("too_many") || i.type.includes("tall") || i.type.includes("page_too_tall")
        ? "Reduce visible UI density and card count."
        : i.type.includes("stale")
          ? "Remove stale text directly from HTML."
          : "Review and patch page-specific layout."
  }));

const report = {
  ok: allIssues.length === 0,
  mode: "SMARTUI_BRAIN_MOBILE_APP_AUDIT",
  generatedAt: new Date().toISOString(),
  doctrine: doctrine.name,
  score: {
    average: averageScore,
    byPage: Object.fromEntries(results.map(r => [r.name, r.score]))
  },
  summary: {
    pagesChecked: results.length,
    issueCount: allIssues.length,
    high: allIssues.filter(i => i.severity === "high").length,
    medium: allIssues.filter(i => i.severity === "medium").length,
    low: allIssues.filter(i => i.severity === "low").length
  },
  issues: allIssues,
  priorityPatchQueue,
  globalRecommendations: [
    "Patch by priority: broken images/stale text first, then density/page height, then polish.",
    "Use action-first mobile screens: one main action, one compact status, one supporting list.",
    "Do not use DOM-rewriting normalizers; patch source HTML/CSS directly.",
    "Every UI patch must be followed by SmartUI Brain re-audit and screenshot."
  ],
  results
};

const patchPlan = {
  mode: "SMARTUI_BRAIN_PATCH_PLAN",
  generatedAt: report.generatedAt,
  averageScore,
  readyToCommit: report.ok && averageScore >= 90,
  priorityPatchQueue,
  pagePlans: Object.fromEntries(results.map(r => [r.name, {
    score: r.score,
    ok: r.ok,
    patchHints: r.patchHints,
    shot: r.shot,
    issueTypes: r.issues.map(i => i.type)
  }]))
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
fs.writeFileSync(patchPlanPath, JSON.stringify(patchPlan, null, 2));

console.log(`SMARTUI_BRAIN_SCORE=${averageScore}`);
console.log(`SMARTUI_BRAIN_STATUS=${report.ok ? "PASS" : "NEEDS_PATCH"}`);
console.log(`REPORT=${reportPath}`);
console.log(`PATCH_PLAN=${patchPlanPath}`);
console.log(JSON.stringify({
  score: report.score,
  summary: report.summary,
  priorityPatchQueue: report.priorityPatchQueue.slice(0, 10),
  shots: results.map(r => ({ page: r.name, score: r.score, shot: r.shot }))
}, null, 2));
