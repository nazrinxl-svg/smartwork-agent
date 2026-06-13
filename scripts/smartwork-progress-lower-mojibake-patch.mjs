import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const file = path.join(repo, "public", "progress.html");
const backupDir = path.join(repo, "reports", "backups");
fs.mkdirSync(backupDir, { recursive: true });

const original = fs.readFileSync(file, "utf8");
let html = original;
const changes = [];

function replaceLiteral(from, to, label) {
  const count = html.split(from).length - 1;
  if (count > 0) {
    html = html.split(from).join(to);
    changes.push({ label, count });
  }
}

replaceLiteral("dilukukan", "dilakukan", "typo dilukukan");
replaceLiteral("requestaktif", "request aktif", "typo requestaktif");
replaceLiteral("App dwnload only", "App download only", "typo app download");
replaceLiteral("App dwonload only", "App download only", "typo app download 2");
replaceLiteral("App donwload only", "App download only", "typo app download 3");

const shortBadTextNode = />((?=[^<]{0,32}<)[^<]*[\u00c3\u00c2\u00e2\ufffd][^<]*)</gu;
html = html.replace(shortBadTextNode, (match, inner) => {
  const compact = inner.replace(/\s+/g, " ").trim();
  if (compact.length > 18) return match;
  changes.push({ label: "short mojibake icon text node", before: compact, after: "check icon" });
  return ">&#10003;<";
});

if (html === original) {
  console.log(JSON.stringify({ ok: false, changed: 0, reason: "No lower mojibake/typo target found. No file changed." }, null, 2));
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = path.join(backupDir, "progress-lower-mojibake-before-phase5zv-m2-" + stamp + ".html");
fs.writeFileSync(backup, original, "utf8");
fs.writeFileSync(file, html, "utf8");

console.log(JSON.stringify({ ok: true, file: "public/progress.html", backup, changes }, null, 2));
