import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "reports", "smartwork-phase5zc-vps-bridge-static-diagnose-report.json");

const skipDirs = new Set([
  ".git",
  "node_modules",
  "reports",
  "shots",
  "browser-profile",
  "dist",
  "coverage",
  ".next",
  ".vercel"
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) walk(full, out);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
      out.push(full);
    }
  }

  return out;
}

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function lineSnippets(lines, needle, radius = 8) {
  const out = [];
  const lowerNeedle = needle.toLowerCase();

  lines.forEach((line, index) => {
    if (line.toLowerCase().includes(lowerNeedle)) {
      const start = Math.max(0, index - radius);
      const end = Math.min(lines.length - 1, index + radius);
      out.push({
        needle,
        lineNumber: index + 1,
        snippet: lines.slice(start, end + 1).map((text, i) => ({
          line: start + i + 1,
          text
        }))
      });
    }
  });

  return out;
}

function analyze(file) {
  const html = fs.readFileSync(file, "utf8");
  const lines = html.split(/\r?\n/);

  const needles = [
    "SmartWorkVpsApi",
    "window.SmartWorkVpsApi",
    "submit",
    "submitJob",
    "createJob",
    "enqueue",
    "health",
    "base",
    "103.152.242.193",
    "3107",
    "/api/smartwork/jobs",
    "/api/smartwork/jobs/health",
    "fetch("
  ];

  const propertyRefs = [
    ...html.matchAll(/SmartWorkVpsApi\.([A-Za-z0-9_$]+)/g),
    ...html.matchAll(/window\.SmartWorkVpsApi\.([A-Za-z0-9_$]+)/g)
  ].map((m) => m[1]);

  const assignments = [...html.matchAll(/window\.SmartWorkVpsApi\s*=\s*([\s\S]{0,2600}?)(?:;\s*\n|<\/script>|$)/g)]
    .map((m) => ({
      index: m.index,
      preview: m[0]
    }));

  const likelyFunctionNames = [
    "submit",
    "submitJob",
    "createJob",
    "create",
    "enqueue",
    "enqueueJob",
    "request",
    "send",
    "post",
    "health",
    "getHealth",
    "base",
    "baseUrl",
    "getBase"
  ];

  const likelyFunctionEvidence = likelyFunctionNames.map((name) => ({
    name,
    hasDotRef: html.includes(`SmartWorkVpsApi.${name}`) || html.includes(`window.SmartWorkVpsApi.${name}`),
    hasObjectKey: new RegExp(`\\b${name}\\s*:`).test(html),
    hasFunctionDeclaration: new RegExp(`function\\s+${name}\\s*\\(`).test(html),
    hasConstFunction: new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`).test(html),
    hasAsyncObjectMethod: new RegExp(`\\basync\\s+${name}\\s*\\(`).test(html)
  }));

  const score =
    (path.basename(file).toLowerCase() === "request.html" ? 50 : 0) +
    ((html.match(/SmartWorkVpsApi/g) || []).length * 20) +
    ((html.match(/\/api\/smartwork\/jobs/g) || []).length * 10) +
    ((html.match(/\bsubmit\b/g) || []).length * 5) +
    (html.includes("smartwork_request") ? 5 : 0) +
    (html.includes("Simpan Request") ? 5 : 0);

  return {
    file: rel(file),
    absolutePath: file,
    score,
    htmlBytes: Buffer.byteLength(html),
    isRequestHtml: path.basename(file).toLowerCase() === "request.html",
    smartWorkVpsApiMentionCount: (html.match(/SmartWorkVpsApi/g) || []).length,
    submitMentionCount: (html.match(/\bsubmit\b/g) || []).length,
    jobsSubmitEndpointMentionCount: (html.match(/\/api\/smartwork\/jobs(?!\/health)/g) || []).length,
    healthEndpointMentionCount: (html.match(/\/api\/smartwork\/jobs\/health/g) || []).length,
    hasSmartworkRequestStorage: html.includes("smartwork_request"),
    hasSimpanRequestText: html.includes("Simpan Request"),
    propertyRefs: [...new Set(propertyRefs)],
    likelyFunctionEvidence,
    smartWorkApiAssignments: assignments,
    snippets: needles.flatMap((needle) => lineSnippets(lines, needle, 8))
  };
}

const htmlFiles = walk(root);
const analyses = htmlFiles.map(analyze);
const candidates = analyses
  .filter((x) => x.isRequestHtml || x.smartWorkVpsApiMentionCount > 0 || x.jobsSubmitEndpointMentionCount > 0 || x.hasSmartworkRequestStorage || x.hasSimpanRequestText)
  .sort((a, b) => b.score - a.score);

const best = candidates[0] || null;

const report = {
  ok: Boolean(best),
  htmlFileCount: htmlFiles.length,
  candidateCount: candidates.length,
  bestFile: best?.file || null,
  bestAbsolutePath: best?.absolutePath || null,
  candidates: candidates.map((x) => ({
    file: x.file,
    score: x.score,
    isRequestHtml: x.isRequestHtml,
    smartWorkVpsApiMentionCount: x.smartWorkVpsApiMentionCount,
    submitMentionCount: x.submitMentionCount,
    jobsSubmitEndpointMentionCount: x.jobsSubmitEndpointMentionCount,
    healthEndpointMentionCount: x.healthEndpointMentionCount,
    propertyRefs: x.propertyRefs
  })),
  best
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok: report.ok,
  htmlFileCount: report.htmlFileCount,
  candidateCount: report.candidateCount,
  bestFile: report.bestFile,
  candidates: report.candidates.slice(0, 10),
  bestSubmitEvidence: best?.likelyFunctionEvidence?.find((x) => x.name === "submit") || null,
  bestSubmitJobEvidence: best?.likelyFunctionEvidence?.find((x) => x.name === "submitJob") || null,
  bestCreateJobEvidence: best?.likelyFunctionEvidence?.find((x) => x.name === "createJob") || null,
  reportPath
}, null, 2));

if (!best) {
  process.exitCode = 2;
}
