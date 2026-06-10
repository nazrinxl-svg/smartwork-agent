import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "smartwork-real-request-selector-diagnose.json");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return { __error: String(e?.message || e) };
  }
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(name => {
      const file = path.join(dir, name);
      const st = fs.statSync(file);
      return { file, name, modifiedAt: st.mtime.toISOString(), mtimeMs: st.mtimeMs };
    });
}

function dateOnly(v) {
  if (!v) return null;
  const m = String(v).match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function scoreRequest(req) {
  const a0 = Array.isArray(req.accounts) ? req.accounts[0] : {};
  const startDate = dateOnly(req.startDate) || dateOnly(a0.startDate) || dateOnly(req?.payload?.startDate);
  const endDate = dateOnly(req.endDate) || dateOnly(a0.endDate) || dateOnly(req?.payload?.endDate);
  const teacherId = req.teacherId || a0.teacherId || a0.id || null;
  const teacherName = req.requesterName || req.name || a0.teacherName || a0.name || null;
  const createdAt = req.createdAt || null;

  let score = 0;
  if (teacherId === "guru-001") score += 100;
  if (String(teacherName || "").toLowerCase().includes("nazrin")) score += 50;
  if (startDate === "2026-06-01") score += 30;
  if (endDate === "2026-06-13") score += 200;
  if (req.service === "siaga") score += 20;
  if (req.source === "smartwork-user-request-form") score += 10;

  return {
    score,
    jobId: req.jobId || req.id || null,
    requesterName: req.requesterName || null,
    teacherId,
    teacherName,
    service: req.service || null,
    mode: req.mode || null,
    requestType: req.requestType || null,
    startDate,
    endDate,
    targetMonth: req.targetMonth || a0.targetMonth || null,
    targetYear: req.targetYear || a0.targetYear || null,
    createdAt,
    source: req.source || null,
    accountsCount: Array.isArray(req.accounts) ? req.accounts.length : null
  };
}

const requestDirs = [
  path.join(ROOT, "intake", "requests"),
  path.join(ROOT, "data", "requests"),
  path.join(ROOT, "requests")
];

const requestFiles = requestDirs.flatMap(listJson);

const requests = requestFiles.map(f => {
  const json = readJson(f.file);
  const norm = scoreRequest(json);
  return { ...f, normalized: norm, raw: json };
}).sort((a,b) => {
  if (b.normalized.score !== a.normalized.score) return b.normalized.score - a.normalized.score;
  const bc = Date.parse(b.normalized.createdAt || 0) || 0;
  const ac = Date.parse(a.normalized.createdAt || 0) || 0;
  if (bc !== ac) return bc - ac;
  return b.mtimeMs - a.mtimeMs;
});

const selected = requests[0] || null;

const jobFiles = listJson(path.join(ROOT, "data", "jobs")).map(f => {
  const json = readJson(f.file);
  return {
    ...f,
    jobId: json.jobId || null,
    status: json.status || null,
    teacherId: json.teacherId || null,
    targetMonth: json.targetMonth || null,
    targetYear: json.targetYear || null,
    raw: json
  };
});

const matchingJob = selected
  ? jobFiles.find(j => j.jobId === selected.normalized.jobId) || null
  : null;

const report = {
  ok: Boolean(selected),
  mode: "SMARTWORK_REAL_REQUEST_SELECTOR_DIAGNOSE",
  generatedAt: new Date().toISOString(),
  rule: "Select request by content: guru-001/Nazrin + 2026-06-01..2026-06-13, not by modified time.",
  selected: selected ? {
    file: selected.file,
    name: selected.name,
    modifiedAt: selected.modifiedAt,
    normalized: selected.normalized,
    raw: selected.raw
  } : null,
  matchingJob: matchingJob ? {
    file: matchingJob.file,
    name: matchingJob.name,
    modifiedAt: matchingJob.modifiedAt,
    jobId: matchingJob.jobId,
    status: matchingJob.status,
    teacherId: matchingJob.teacherId,
    targetMonth: matchingJob.targetMonth,
    targetYear: matchingJob.targetYear,
    raw: matchingJob.raw
  } : null,
  topCandidates: requests.slice(0, 15).map(r => ({
    file: r.file,
    name: r.name,
    modifiedAt: r.modifiedAt,
    normalized: r.normalized
  })),
  findings: []
};

if (!selected) report.findings.push("NO_REQUEST_FOUND");
if (selected && selected.normalized.endDate !== "2026-06-13") {
  report.findings.push(`SELECTED_REQUEST_NOT_1_TO_13:endDate=${selected.normalized.endDate}`);
}
if (selected && !matchingJob) {
  report.findings.push(`NO_MATCHING_JOB_FOR_SELECTED_REQUEST:${selected.normalized.jobId}`);
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify({
  ok: report.ok,
  selectedRequest: report.selected?.file || null,
  selectedRange: {
    startDate: report.selected?.normalized?.startDate || null,
    endDate: report.selected?.normalized?.endDate || null
  },
  selectedJobId: report.selected?.normalized?.jobId || null,
  matchingJob: report.matchingJob?.file || null,
  matchingJobStatus: report.matchingJob?.status || null,
  findings: report.findings,
  report: OUT
}, null, 2));
