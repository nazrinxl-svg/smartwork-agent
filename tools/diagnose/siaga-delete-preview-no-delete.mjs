import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const reportsDir = path.join(ROOT, "reports");
const shotsDir = path.join(ROOT, "shots");
fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.join(reportsDir, "siaga-delete-preview-no-delete-report.json");
const shot = path.join(shotsDir, `${stamp}-siaga-delete-preview-no-delete.png`);

const TARGET = {
  teacherId: "guru-001",
  teacherName: "Nazrin",
  month: "Juni",
  year: "2026",
  startDate: "2026-06-01",
  endDate: "2026-06-30",
  mode: "PREVIEW_ONLY_NO_DELETE"
};

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  } catch {
    return fallback;
  }
}

const artifacts = readJson("reports/smartwork-app-artifacts-report.json", {});
const progress = readJson("reports/smartwork-final-progress-report.json", {});
const timePlan = readJson("reports/siaga-job-time-plan-preview-report.json", {});
const verify = readJson("reports/smartwork-after-save-verify-request.json", {});

const guard = {
  artifactTeacher: artifacts?.request?.teacherName || null,
  artifactRange: artifacts?.request?.requestRange || null,
  progressTeacher: progress?.teacherName || null,
  progressRange: progress?.requestRange || null,
  progressSummary: progress?.requestedDatesResult?.summary || null,
  okToPreview:
    artifacts?.request?.teacherName === TARGET.teacherName &&
    String(artifacts?.request?.requestRange || "").includes("2026-06-01") &&
    String(artifacts?.request?.requestRange || "").includes("2026-06-30") &&
    progress?.teacherName === TARGET.teacherName &&
    progress?.requestRange === "2026-06-01..2026-06-30"
};

if (!guard.okToPreview) {
  fs.writeFileSync(out, JSON.stringify({
    ok: false,
    mode: "SIAGA_DELETE_PREVIEW_GUARD_STOP",
    target: TARGET,
    guard,
    reason: "Report target tidak cocok dengan Nazrin Juni 2026 full month. Stop sebelum buka/hapus."
  }, null, 2));
  console.log(fs.readFileSync(out, "utf8"));
  process.exit(2);
}

const context = await chromium.launchPersistentContext(
  path.join(ROOT, "browser-profile", "guru-001-siaga"),
  {
    headless: false,
    viewport: null,
    channel: "chrome"
  }
);

const page = context.pages()[0] || await context.newPage();

async function safeGoto(url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
}

async function collectPageState(label) {
  return await page.evaluate((label) => {
    const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();

    const links = Array.from(document.querySelectorAll("a")).map((a) => ({
      text: clean(a.textContent),
      href: a.href || a.getAttribute("href") || "",
      title: a.getAttribute("title") || "",
      className: a.className || ""
    })).filter((x) => x.text || x.href);

    const buttons = Array.from(document.querySelectorAll("button, input[type=button], input[type=submit]")).map((b) => ({
      text: clean(b.textContent || b.value),
      type: b.getAttribute("type") || "",
      title: b.getAttribute("title") || "",
      className: b.className || ""
    }));

    const rows = Array.from(document.querySelectorAll("tr")).map((tr, index) => ({
      index,
      text: clean(tr.textContent),
      links: Array.from(tr.querySelectorAll("a")).map((a) => ({
        text: clean(a.textContent),
        href: a.href || a.getAttribute("href") || "",
        title: a.getAttribute("title") || "",
        className: a.className || ""
      })),
      buttons: Array.from(tr.querySelectorAll("button, input[type=button], input[type=submit]")).map((b) => ({
        text: clean(b.textContent || b.value),
        type: b.getAttribute("type") || "",
        title: b.getAttribute("title") || "",
        className: b.className || ""
      }))
    })).filter((r) => r.text);

    return {
      label,
      url: location.href,
      title: document.title,
      bodyText: clean(document.body.innerText).slice(0, 4000),
      rows: rows.slice(0, 80),
      links: links.slice(0, 120),
      buttons: buttons.slice(0, 80)
    };
  }, label);
}

const states = [];

await safeGoto("https://siagapendis.kemenag.go.id/guru/absensi");
states.push(await collectPageState("absensi-list"));

let current = states[states.length - 1];

const detailCandidates = current.links.filter((l) => {
  const all = `${l.text} ${l.href} ${l.title} ${l.className}`.toLowerCase();
  return (
    all.includes("detail") ||
    all.includes("lihat") ||
    all.includes("absensi/detail") ||
    all.includes("show") ||
    all.includes("edit")
  );
});

const juneRows = current.rows.filter((r) => {
  const t = r.text.toLowerCase();
  return t.includes("juni") || t.includes("2026") || t.includes("nazrin");
});

let chosenDetailUrl = null;

for (const row of juneRows) {
  const rowLink = row.links.find((l) => {
    const all = `${l.text} ${l.href} ${l.title} ${l.className}`.toLowerCase();
    return all.includes("detail") || all.includes("lihat") || all.includes("absensi/detail") || all.includes("edit");
  });
  if (rowLink?.href) {
    chosenDetailUrl = rowLink.href;
    break;
  }
}

if (!chosenDetailUrl && detailCandidates[0]?.href) {
  chosenDetailUrl = detailCandidates[0].href;
}

if (chosenDetailUrl) {
  await safeGoto(chosenDetailUrl);
  states.push(await collectPageState("absensi-detail-preview"));
}

await page.screenshot({ path: shot, fullPage: true });

const detailState = states[states.length - 1];

const deleteSignals = {
  candidateDeleteLinks: detailState.links.filter((l) => {
    const all = `${l.text} ${l.href} ${l.title} ${l.className}`.toLowerCase();
    return all.includes("hapus") || all.includes("delete") || all.includes("destroy");
  }),
  candidateDeleteButtons: detailState.buttons.filter((b) => {
    const all = `${b.text} ${b.title} ${b.className}`.toLowerCase();
    return all.includes("hapus") || all.includes("delete");
  }),
  filledDateRows: detailState.rows.filter((r) => {
    const t = r.text;
    return /2026|Juni|Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|\b\d{2}:\d{2}\b/.test(t);
  }).slice(0, 60)
};

const result = {
  ok: true,
  mode: "SIAGA_DELETE_PREVIEW_ONLY_NO_DELETE",
  target: TARGET,
  guard,
  didDelete: false,
  didClickDelete: false,
  chosenDetailUrl,
  screenshot: shot,
  deleteSignals,
  states
};

fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({
  ok: true,
  mode: result.mode,
  target: result.target,
  chosenDetailUrl,
  screenshot: shot,
  deleteLinkCount: deleteSignals.candidateDeleteLinks.length,
  deleteButtonCount: deleteSignals.candidateDeleteButtons.length,
  filledDateRowCount: deleteSignals.filledDateRows.length,
  report: out
}, null, 2));

await context.close();
