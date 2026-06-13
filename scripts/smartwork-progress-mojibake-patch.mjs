import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const file = path.join(repo, "public", "progress.html");
const backupDir = path.join(repo, "reports", "backups");
fs.mkdirSync(backupDir, { recursive: true });

const original = fs.readFileSync(file, "utf8");
const lines = original.split(/\r?\n/);
const badCodes = new Set([0x00c3, 0x00c2, 0x00e2, 0xfffd]);
const hasBad = s => Array.from(s).some(ch => badCodes.has(ch.codePointAt(0)));

let changed = 0;
const touched = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.includes("setText(\"heroText\"") || !line.includes("teacher +") || !hasBad(line)) continue;
  const indent = line.match(/^\s*/)?.[0] || "";
  if (line.includes("selesai. PDF & bukti siap diunduh")) {
    lines[i] = indent + "setText(\"heroText\", teacher + (range ? \" \\u2022 \" + range : \"\") + \" selesai. PDF & bukti siap diunduh.\");";
  } else {
    lines[i] = indent + "setText(\"heroText\", teacher + (range ? \" \\u2022 \" + range : \"\") + (live?.status === \"needs_check\" ? \" perlu dicek manual.\" : \" sedang diproses oleh agent.\"));";
  }
  changed++;
  touched.push({ line: i + 1, before: line.trim(), after: lines[i].trim() });
}

if (changed === 0) {
  console.log(JSON.stringify({ ok: false, changed, reason: "No targeted mojibake heroText line found. No file changed." }, null, 2));
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = path.join(backupDir, "progress-mojibake-before-phase5zv-m1-" + stamp + ".html");
fs.writeFileSync(backup, original, "utf8");
fs.writeFileSync(file, lines.join("\n"), "utf8");

console.log(JSON.stringify({ ok: true, file: "public/progress.html", changed, backup, touched }, null, 2));
