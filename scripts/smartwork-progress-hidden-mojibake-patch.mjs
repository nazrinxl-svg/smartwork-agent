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

const touched = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!hasBad(line)) continue;

  const indent = line.match(/^\s*/)?.[0] || "";

  if (line.includes("return `Request ${da} Juni")) {
    lines[i] = indent + "return `Request ${da} Juni - ${db} Juni 2026 sudah diverifikasi.`;";
    touched.push({ line: i + 1, type: "verified range text" });
  } else if (line.includes("setText(\"heroText\", `${teacherName}")) {
    lines[i] = indent + "setText(\"heroText\", `${teacherName} \\u2022 ${range} selesai. PDF & bukti siap diunduh.`);";
    touched.push({ line: i + 1, type: "hero text fallback" });
  } else if (line.includes("render(\"Job \" + jobId +")) {
    lines[i] = indent + "render(\"Job \" + jobId + \" - \" + status + \" - \" + percent + \"% - \" + message);";
    touched.push({ line: i + 1, type: "queue status separators" });
  }
}

if (touched.length === 0) {
  console.log(JSON.stringify({ ok: false, reason: "No targeted hidden mojibake lines found. No file changed." }, null, 2));
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = path.join(backupDir, "progress-hidden-mojibake-before-phase5zv-m3-" + stamp + ".html");

fs.writeFileSync(backup, original, "utf8");
fs.writeFileSync(file, lines.join("\n"), "utf8");

console.log(JSON.stringify({ ok: true, file: "public/progress.html", backup, touched }, null, 2));
