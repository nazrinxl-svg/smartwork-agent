import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, "public");
const REPORT_DIR = path.join(ROOT, "reports");
const REPORT_PATH = path.join(REPORT_DIR, "smartwork-ui-guard-report.json");

const TARGETS = [
  "index.html",
  "request.html",
  "history.html"
];

const LIMITS = {
  navFinalCount: 1,
  navCenterCount: 0,
  bottomNavCount: 7,
  compactPolishCount: 0
};

function read(file) {
  return fs.readFileSync(path.join(PUBLIC_DIR, file), "utf8");
}

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

function has(text, snippet) {
  return text.includes(snippet);
}

function checkFile(file) {
  const text = read(file);
  const issues = [];

  const navFinalCount = count(text, /NAV FINAL CONSISTENT/g);
  const navCenterCount = count(text, /nav-center/g);
  const bottomNavCount = count(text, /\.bottom-nav/g);
  const compactPolishCount = count(text, /NAV COMPACT POLISH/g);

  if (navFinalCount !== LIMITS.navFinalCount) {
    issues.push({
      type: "nav-final-count",
      message: `NAV FINAL CONSISTENT harus ${LIMITS.navFinalCount}, sekarang ${navFinalCount}.`
    });
  }

  if (navCenterCount !== LIMITS.navCenterCount) {
    issues.push({
      type: "nav-center-leftover",
      message: `nav-center harus ${LIMITS.navCenterCount}, sekarang ${navCenterCount}.`
    });
  }

  if (bottomNavCount !== LIMITS.bottomNavCount) {
    issues.push({
      type: "bottom-nav-count",
      message: `.bottom-nav harus ${LIMITS.bottomNavCount}, sekarang ${bottomNavCount}.`
    });
  }

  if (compactPolishCount !== LIMITS.compactPolishCount) {
    issues.push({
      type: "bad-compact-polish",
      message: `NAV COMPACT POLISH tidak boleh ada. Sekarang ${compactPolishCount}.`
    });
  }

  if (!has(text, '<nav class="bottom-nav">')) {
    issues.push({
      type: "bottom-nav-missing",
      message: "HTML <nav class=\"bottom-nav\"> tidak ditemukan."
    });
  }

  if (has(text, "C:\\Users\\Digitalisasi")) {
    issues.push({
      type: "powershell-home-corruption",
      message: "Ditemukan class rusak C:\\Users\\Digitalisasi."
    });
  }

  if (has(text, "Kembali ke Dashboard")) {
    issues.push({
      type: "old-request-back-button",
      message: "Tombol lama Kembali ke Dashboard masih ada. Gunakan bottom nav."
    });
  }

  if (!has(text, "height: 56px !important") && !has(text, "height: 58px !important")) {
    issues.push({
      type: "bottom-nav-height",
      message: "Bottom nav height harus stabil di 56px atau 58px."
    });
  }

  if (!has(text, "box-shadow: 0 8px 22px rgba(15,23,42,.10) !important") &&
      !has(text, "box-shadow: 0 18px 38px rgba(15,23,42,.14) !important")) {
    issues.push({
      type: "bottom-nav-shadow",
      message: "Shadow bottom nav tidak sesuai standar stabil."
    });
  }

  return {
    file,
    ok: issues.length === 0,
    counts: {
      navFinalCount,
      navCenterCount,
      bottomNavCount,
      compactPolishCount
    },
    issues
  };
}

function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const results = TARGETS.map(checkFile);
  const issues = results.flatMap((r) => r.issues.map((issue) => ({ file: r.file, ...issue })));

  const report = {
    ok: issues.length === 0,
    status: issues.length === 0 ? "SAFE" : "NEEDS_CHECK",
    agent: "SmartWork UI Guard Agent",
    rule: "Jaga bottom nav dan layout mobile tetap stabil sebelum commit UI.",
    checkedAt: new Date().toISOString(),
    results,
    issues
  };

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log("SMARTWORK_UI_GUARD_AGENT=ACTIVE");
  console.log(`STATUS=${report.status}`);
  console.log(`ISSUES=${issues.length}`);
  console.log(`REPORT=${REPORT_PATH}`);

  if (issues.length) {
    console.log("\nSMARTUI WARNING: UI regression detected. DO NOT COMMIT before checking report.");
    for (const issue of issues) {
      console.log(`- [${issue.file}] ${issue.type}: ${issue.message}`);
    }
    process.exit(1);
  }

  console.log("SMARTUI SAFE: UI layout guard passed.");
}

main();

