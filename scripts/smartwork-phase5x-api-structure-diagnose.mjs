import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const file = path.join(repo, "app", "smartwork-production-queue-api.mjs");
const reportPath = path.join(repo, "docs", "checkpoints", "smartwork-phase5x-api-structure-diagnose-report.json");

const text = fs.readFileSync(file, "utf8");
const lines = text.split(/\r?\n/);

function lineNoOf(substr) {
  const idx = text.indexOf(substr);
  if (idx < 0) return null;
  return text.slice(0, idx).split(/\r?\n/).length;
}

function windowAround(substr, radius = 35) {
  const line = lineNoOf(substr);
  if (!line) return null;
  const start = Math.max(1, line - radius);
  const end = Math.min(lines.length, line + radius);
  return {
    needle: substr,
    line,
    start,
    end,
    text: lines.slice(start - 1, end).map((value, i) => `${String(start + i).padStart(4, " ")}: ${value}`).join("\n")
  };
}

const patterns = [
  "export function",
  "export async function",
  "function ",
  "register",
  "server.on",
  "req.url",
  "request.url",
  "pathname",
  "/api/smartwork/jobs/health",
  "/api/smartwork/jobs",
  "POST",
  "GET"
];

const hits = patterns.map((p) => ({
  pattern: p,
  line: lineNoOf(p),
  window: windowAround(p, 12)?.text || null
}));

const routeWindows = [
  windowAround("/api/smartwork/jobs/health", 45),
  windowAround("/api/smartwork/jobs", 65),
  windowAround("install", 45),
  windowAround("req.url", 45),
  windowAround("pathname", 45)
].filter(Boolean);

const report = {
  ok: true,
  phase: "5X",
  mode: "API_STRUCTURE_DIAGNOSE_ONLY_NO_PATCH",
  file: "app/smartwork-production-queue-api.mjs",
  totalLines: lines.length,
  hasCorsHeader: text.includes("Access-Control-Allow-Origin"),
  hasOptions: /\bOPTIONS\b|method\s*===\s*["']OPTIONS["']/.test(text),
  hits,
  routeWindows,
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    noPatch: true
  },
  createdAt: new Date().toISOString()
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok: report.ok,
  file: report.file,
  totalLines: report.totalLines,
  hasCorsHeader: report.hasCorsHeader,
  hasOptions: report.hasOptions,
  keyLines: hits.filter((h) => h.line).map((h) => ({ pattern: h.pattern, line: h.line })),
  reportPath: "docs/checkpoints/smartwork-phase5x-api-structure-diagnose-report.json"
}, null, 2));

console.log("\n=== ROUTE WINDOWS ===");
for (const w of routeWindows) {
  console.log(`\n--- ${w.needle} @ line ${w.line} ---`);
  console.log(w.text);
}
