import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportsDir = path.join(ROOT, "reports");
const shotsDir = path.join(ROOT, "shots");
fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportsDir, "smartui-progress-layout-diagnose-report.json");
const fullShot = path.join(shotsDir, `${ts}-smartui-progress-full.png`);
const cropShot = path.join(shotsDir, `${ts}-smartui-progress-crop.png`);

const url = process.env.SMARTWORK_PROGRESS_URL || "http://localhost:3107/progress.html?smartui=" + Date.now();

function classifyIssue(issue, severity = "medium", detail = {}) {
  return { issue, severity, detail };
}

const browser = await chromium.launch({
  headless: false,
  channel: "chrome"
});

const page = await browser.newPage({
  viewport: { width: 430, height: 900 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true
});

const issues = [];
let metrics = {};
let elements = [];

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.screenshot({ path: fullShot, fullPage: true });

  metrics = await page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    const nav = document.querySelector(".bottom, nav.bottom, nav");
    const app = document.querySelector(".app, .phone, main") || body;

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

    const all = Array.from(document.querySelectorAll("body *"));
    const visible = all.filter(el => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && st.display !== "none" && st.visibility !== "hidden";
    });

    const cardLike = visible.filter(el => {
      const st = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const radius = parseFloat(st.borderRadius || "0");
      const bg = st.backgroundColor;
      const cls = String(el.className || "");
      return (
        r.width > 250 &&
        r.height > 40 &&
        (
          cls.match(/card|hero|status|quick|primary|system|summary/i) ||
          radius >= 14 ||
          bg.includes("255, 255, 255")
        )
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
        marginTop: st.marginTop,
        marginBottom: st.marginBottom,
        borderRadius: st.borderRadius,
        background: st.backgroundColor
      };
    });

    const textNodes = visible
      .map(el => {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
        return {
          tag: el.tagName,
          className: String(el.className || ""),
          text: text.slice(0, 90),
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height),
          fontSize: st.fontSize,
          fontWeight: st.fontWeight,
          lineHeight: st.lineHeight
        };
      })
      .filter(x => x.text && x.text.length < 100);

    return {
      viewport: { width: innerWidth, height: innerHeight },
      document: {
        scrollHeight: html.scrollHeight,
        bodyHeight: body.scrollHeight
      },
      app: rect(app),
      nav: rect(nav),
      cardLike,
      textNodes,
      visibleCount: visible.length,
      bodyText: body.innerText.replace(/\s+/g, " ").trim().slice(0, 3000)
    };
  });

  elements = metrics.cardLike || [];

  const app = metrics.app;
  const nav = metrics.nav;
  const viewport = metrics.viewport;
  const scrollHeight = metrics.document?.scrollHeight || 0;

  if (!metrics.bodyText.includes("Hasil pekerjaan siap") && !metrics.bodyText.includes("RESULT_READY")) {
    issues.push(classifyIssue("result_ready_content_not_visible", "high", {
      bodyTextPreview: metrics.bodyText.slice(0, 300)
    }));
  }

  if (app && app.width > 430) {
    issues.push(classifyIssue("app_width_too_wide", "high", { appWidth: app.width }));
  }

  if (nav && nav.height > 72) {
    issues.push(classifyIssue("bottom_nav_too_tall", "medium", { navHeight: nav.height }));
  }

  if (scrollHeight > 980) {
    issues.push(classifyIssue("page_too_tall_for_result_ready", "medium", {
      scrollHeight,
      targetMax: 900,
      recommendation: "Result-ready page should fit most content in one mobile screen plus small scroll."
    }));
  }

  const tooTallCards = elements.filter(e => e.height > 170);
  if (tooTallCards.length) {
    issues.push(classifyIssue("cards_too_tall", "medium", {
      count: tooTallCards.length,
      cards: tooTallCards.slice(0, 5)
    }));
  }

  const narrowMismatch = elements.filter(e => app && Math.abs(e.width - app.width) < 4);
  if (narrowMismatch.length) {
    issues.push(classifyIssue("cards_touch_app_edges", "medium", {
      count: narrowMismatch.length,
      recommendation: "Cards should keep 14-16px side breathing room."
    }));
  }

  const staleWords = [
    "Preview Siap",
    "Preview Berhasil",
    "Menunggu Konfirmasi",
    "menunggu izin eksekusi",
    "40%",
    "Jalankan workflow"
  ].filter(w => metrics.bodyText.includes(w));

  if (staleWords.length) {
    issues.push(classifyIssue("stale_progress_words_found", "high", { staleWords }));
  }

  const sectionOrder = ["Hasil pekerjaan siap", "Range", "Unduh PDF", "Ringkasan request", "File & laporan", "Sistem"];
  const missing = sectionOrder.filter(w => !metrics.bodyText.includes(w));
  if (missing.length) {
    issues.push(classifyIssue("expected_sections_missing", "medium", { missing }));
  }

  const mainClip = await page.locator("body").boundingBox();
  if (mainClip) {
    await page.screenshot({
      path: cropShot,
      clip: {
        x: 0,
        y: 0,
        width: Math.min(430, Math.round(mainClip.width)),
        height: 900
      }
    });
  }

} catch (error) {
  issues.push(classifyIssue("smartui_diagnose_runtime_error", "high", {
    error: String(error?.message || error)
  }));
} finally {
  await browser.close();
}

const recommendations = [];

if (issues.some(i => i.issue === "page_too_tall_for_result_ready")) {
  recommendations.push("Kurangi section: gabungkan Ringkasan request + Sistem, atau buat Sistem collapsible/detail kecil.");
}
if (issues.some(i => i.issue === "cards_too_tall")) {
  recommendations.push("Turunkan padding card, hero height, dan item list height. Result-ready UI harus action-first.");
}
if (issues.some(i => i.issue === "stale_progress_words_found")) {
  recommendations.push("Hapus teks state lama dari progress.html, jangan dinormalisasi via script.");
}
if (issues.some(i => i.issue === "cards_touch_app_edges")) {
  recommendations.push("Pastikan wrapper .app padding 14px dan card width tidak 100vw.");
}
if (!recommendations.length) {
  recommendations.push("Layout sudah cukup konsisten. Lanjut polish visual kecil: spacing, logo, dan microcopy.");
}

const report = {
  ok: issues.length === 0,
  mode: "SMARTUI_PROGRESS_LAYOUT_DIAGNOSE",
  generatedAt: new Date().toISOString(),
  url,
  shots: {
    full: fullShot,
    crop: cropShot
  },
  metrics: {
    viewport: metrics.viewport,
    document: metrics.document,
    app: metrics.app,
    nav: metrics.nav,
    cardCount: elements.length,
    visibleCount: metrics.visibleCount
  },
  issues,
  recommendations,
  cards: elements.slice(0, 30)
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`SMARTUI_PROGRESS_LAYOUT_DIAGNOSE=${report.ok ? "OK" : "NEEDS_FIX"}`);
console.log(`REPORT=${reportPath}`);
console.log(`SHOT_FULL=${fullShot}`);
console.log(`SHOT_CROP=${cropShot}`);
console.log(JSON.stringify({
  ok: report.ok,
  issues: report.issues,
  recommendations: report.recommendations,
  shots: report.shots
}, null, 2));
