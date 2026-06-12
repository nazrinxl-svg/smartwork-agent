import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const targets = [
  "app/smartwork-production-queue-api.mjs",
  "app/smartwork-control-server.mjs",
  "server.mjs",
  "app/server.mjs"
];

const reportPath = path.join(repo, "docs", "checkpoints", "smartwork-phase5x-exact-cors-diagnose-report.json");

function exists(rel) {
  return fs.existsSync(path.join(repo, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(repo, rel), "utf8");
}

function around(text, needle, radius = 900) {
  const i = text.indexOf(needle);
  if (i < 0) return null;
  return text.slice(Math.max(0, i - radius), Math.min(text.length, i + needle.length + radius));
}

const files = targets
  .filter(exists)
  .map((rel) => {
    const text = read(rel);
    return {
      file: rel,
      size: text.length,
      hasHealthRoute: text.includes("/api/smartwork/jobs/health"),
      hasJobsRoute: text.includes("/api/smartwork/jobs"),
      hasOptions: /\bOPTIONS\b|method\s*===\s*["']OPTIONS["']/.test(text),
      hasCorsHeader: text.includes("Access-Control-Allow-Origin"),
      hasCreateServer: text.includes("createServer("),
      hasReqRes: /req\s*,\s*res|request\s*,\s*response/.test(text),
      hasInstallFunction: /install.*SmartWork|smartwork.*api|queue.*api/i.test(text),
      snippets: {
        health: around(text, "/api/smartwork/jobs/health"),
        jobs: around(text, "/api/smartwork/jobs")
      }
    };
  });

const selected =
  files.find((f) => f.file === "app/smartwork-production-queue-api.mjs" && f.hasJobsRoute) ||
  files.find((f) => f.hasJobsRoute) ||
  null;

const report = {
  ok: Boolean(selected),
  phase: "5X",
  mode: "EXACT_CORS_DIAGNOSE_ONLY_NO_PATCH",
  selectedApiFile: selected?.file || null,
  files,
  decision: selected
    ? "Patch only selectedApiFile. Do not patch broad scripts."
    : "No API route file found. Stop and inspect manually.",
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    noFileChangedByThisScriptExceptReport: true
  },
  createdAt: new Date().toISOString()
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok: report.ok,
  selectedApiFile: report.selectedApiFile,
  files: files.map((f) => ({
    file: f.file,
    hasHealthRoute: f.hasHealthRoute,
    hasJobsRoute: f.hasJobsRoute,
    hasOptions: f.hasOptions,
    hasCorsHeader: f.hasCorsHeader,
    hasCreateServer: f.hasCreateServer,
    hasReqRes: f.hasReqRes,
    hasInstallFunction: f.hasInstallFunction
  })),
  reportPath: "docs/checkpoints/smartwork-phase5x-exact-cors-diagnose-report.json"
}, null, 2));

if (!report.ok) process.exit(2);
