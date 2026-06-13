import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const reportPath = path.join(repo, "docs", "checkpoints", "smartwork-mojibake-text-lock-phase5zv-m3.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

const files = ["index.html", "home.html", "request.html", "progress.html", "history.html", "profile.html"];
const badCodes = new Set([0x00c3, 0x00c2, 0x00e2, 0xfffd]);
const hasBad = s => Array.from(s).some(ch => badCodes.has(ch.codePointAt(0)));

function esc(s) {
  return Array.from(s).map(ch => {
    const cp = ch.codePointAt(0);
    if (cp < 32 || cp > 126) return "\\u{" + cp.toString(16).padStart(4, "0") + "}";
    return ch;
  }).join("");
}

const results = [];
for (const file of files) {
  const full = path.join(repo, "public", file);
  if (!fs.existsSync(full)) continue;
  const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (hasBad(lines[i])) results.push({ file, line: i + 1, escaped: esc(lines[i].trim()).slice(0, 260) });
  }
}

const report = { ok: results.length === 0, generatedAt: new Date().toISOString(), lockType: "UI_TEXT_ONLY_NOT_UX", scope: files, count: results.length, results };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
console.log("Report: " + reportPath);
if (!report.ok) process.exit(1);
console.log("OK: UI TEXT MOJIBAKE LOCK PASSED.");
