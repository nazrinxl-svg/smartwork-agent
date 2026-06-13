import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const files = fs.readdirSync(path.join(repo, "public")).filter(f => f.endsWith(".html")).sort();
const badCodes = new Set([0x00c3, 0x00c2, 0x00e2, 0xfffd]);

function hasBad(s) {
  return Array.from(s).some(ch => badCodes.has(ch.codePointAt(0)));
}

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
  const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (hasBad(lines[i])) results.push({ file, line: i + 1, escaped: esc(lines[i].trim()).slice(0, 260) });
  }
}

console.log(JSON.stringify({ ok: results.length === 0, count: results.length, results }, null, 2));
