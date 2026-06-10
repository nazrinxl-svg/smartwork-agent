import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const outPath = path.join(ROOT, "reports", "smartwork-agent-army-latest-request-pipeline-diagnose.json");

function readJsonSafe(file) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return { __readError: String(e?.message || e) };
  }
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith(".json"))
    .map(f => {
      const full = path.join(dir, f);
      const st = fs.statSync(full);
      return { file: full, name: f, mtimeMs: st.mtimeMs, modifiedAt: st.mtime.toISOString() };
    })
    .sort((a,b) => b.mtimeMs - a.mtimeMs);
}

function dateOnly(v) {
  if (!v) return null;
  const s = String(v);
  const m = s.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function collectDates(obj, found = []) {
  if (!obj || typeof obj !== "object") return found;

  if (Array.isArray(obj)) {
    for (const x of obj) collectDates(x, found);
    return found;
  }

  const keys = Object.keys(obj);
  const maybeDate =
    dateOnly(obj.date) ||
    dateOnly(obj.tanggal) ||
    dateOnly(obj.isoDate) ||
    dateOnly(obj.targetDate) ||
    dateOnly(obj.day) ||
    null;

  const status =
    obj.status ||
    obj.planStatus ||
    obj.state ||
    obj.resultStatus ||
    obj.reason ||
    null;

  if (maybeDate || status) {
    found.push({
      date: maybeDate,
      status,
      weekday: obj.weekday || obj.dayName || obj.hari || null,
      alreadyFilled: obj.alreadyFilled ?? obj.already_filled ?? null,
      skipped: obj.skipped ?? null,
      reason: obj.reason ?? obj.skipReason ?? obj.message ?? null,
      sourceKeys: keys.slice(0, 20),
      raw: obj
    });
  }

  for (const k of keys) collectDates(obj[k], found);
  return found;
}

function uniqByDateStatus(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const key = `${r.date || "NO_DATE"}|${r.status || "NO_STATUS"}|${r.reason || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function detectLatestRequest() {
  const dirs = [
    path.join(ROOT, "intake", "requests"),
    path.join(ROOT, "data", "requests"),
    path.join(ROOT, "requests")
  ];

  const files = dirs.flatMap(listJsonFiles).sort((a,b) => b.mtimeMs - a.mtimeMs);
  const latest = files[0] || null;
  const json = latest ? readJsonSafe(latest.file) : null;
  return { latest, files: files.slice(0, 10), json };
}

function detectLatestJob() {
  const dirs = [
    path.join(ROOT, "data", "jobs"),
    path.join(ROOT, "jobs")
  ];

  const files = dirs.flatMap(listJsonFiles).sort((a,b) => b.mtimeMs - a.mtimeMs);
  const latest = files[0] || null;
  const json = latest ? readJsonSafe(latest.file) : null;
  return { latest, files: files.slice(0, 10), json };
}

function detectLatestReports() {
  const files = listJsonFiles(path.join(ROOT, "reports"));
  const interesting = files.filter(f => {
    const n = f.name.toLowerCase();
    return (
      n.includes("time") ||
      n.includes("plan") ||
      n.includes("pipeline") ||
      n.includes("preview") ||
      n.includes("save") ||
      n.includes("verify") ||
      n.includes("download") ||
      n.includes("proof") ||
      n.includes("progress")
    );
  });
  return { files: interesting.slice(0, 30) };
}

function normalizeRequest(req) {
  const a0 = Array.isArray(req?.accounts) ? req.accounts[0] : {};
  return {
    jobId: req?.jobId || req?.id || null,
    service: req?.service || a0?.service || "siaga",
    teacherId: req?.teacherId || a0?.teacherId || a0?.id || null,
    name: req?.name || req?.fullName || a0?.name || a0?.fullName || null,
    startDate: dateOnly(req?.startDate) || dateOnly(a0?.startDate) || dateOnly(req?.payload?.startDate),
    endDate: dateOnly(req?.endDate) || dateOnly(a0?.endDate) || dateOnly(req?.payload?.endDate),
    targetMonth: req?.targetMonth || a0?.targetMonth || req?.payload?.targetMonth || null,
    targetYear: req?.targetYear || a0?.targetYear || req?.payload?.targetYear || null,
    accountsCount: Array.isArray(req?.accounts) ? req.accounts.length : null,
    rawKeys: req ? Object.keys(req) : []
  };
}

const latestRequest = detectLatestRequest();
const latestJob = detectLatestJob();
const latestReports = detectLatestReports();

const reportDetails = latestReports.files.map(f => {
  const json = readJsonSafe(f.file);
  const rows = uniqByDateStatus(collectDates(json)).filter(x => x.date);
  const needsPlan = rows.filter(x => String(x.status || "").toLowerCase().includes("needs_plan"));
  const alreadyFilled = rows.filter(x => String(x.status || "").toLowerCase().includes("already") || x.alreadyFilled === true);
  const skipped = rows.filter(x => String(x.status || "").toLowerCase().includes("skip") || x.skipped === true);
  const saved = rows.filter(x => String(x.status || "").toLowerCase().includes("saved") || String(x.status || "").toLowerCase().includes("verified"));

  return {
    name: f.name,
    file: f.file,
    modifiedAt: f.modifiedAt,
    topLevelKeys: json && typeof json === "object" ? Object.keys(json).slice(0, 30) : [],
    dateRowsCount: rows.length,
    needsPlan: needsPlan.map(x => ({ date: x.date, status: x.status, reason: x.reason })),
    alreadyFilledCount: alreadyFilled.length,
    skipped: skipped.map(x => ({ date: x.date, status: x.status, reason: x.reason })),
    savedOrVerified: saved.map(x => ({ date: x.date, status: x.status, reason: x.reason })).slice(0, 20)
  };
});

const scriptFiles = fs.existsSync(path.join(ROOT, "scripts"))
  ? fs.readdirSync(path.join(ROOT, "scripts")).filter(f => f.endsWith(".mjs") || f.endsWith(".js")).sort()
  : [];

const relevantScripts = scriptFiles.filter(f => {
  const n = f.toLowerCase();
  return (
    n.includes("siaga") ||
    n.includes("job") ||
    n.includes("request") ||
    n.includes("plan") ||
    n.includes("save") ||
    n.includes("download") ||
    n.includes("proof") ||
    n.includes("progress")
  );
});

const requestNorm = normalizeRequest(latestRequest.json);

const diagnosis = {
  ok: true,
  mode: "SMARTWORK_AGENT_ARMY_DIAGNOSE_LATEST_REQUEST_PIPELINE",
  generatedAt: new Date().toISOString(),
  root: ROOT,
  focus: {
    service: "siaga",
    teacherId: "guru-001",
    teacherName: "Nazrin",
    rule: "process only dates with status needs_plan; do not guess dates"
  },
  latestRequest: {
    file: latestRequest.latest,
    normalized: requestNorm,
    raw: latestRequest.json
  },
  latestJob: {
    file: latestJob.latest,
    raw: latestJob.json
  },
  latestReports: reportDetails,
  relevantScripts,
  findings: []
};

if (!latestRequest.latest) diagnosis.findings.push("NO_LATEST_REQUEST_FOUND");
if (!requestNorm.startDate || !requestNorm.endDate) diagnosis.findings.push("REQUEST_DATE_RANGE_NOT_FOUND");
if (requestNorm.teacherId && requestNorm.teacherId !== "guru-001") diagnosis.findings.push(`LATEST_REQUEST_TEACHER_NOT_GURU_001:${requestNorm.teacherId}`);

const allNeedsPlan = [];
for (const r of reportDetails) {
  for (const d of r.needsPlan || []) {
    allNeedsPlan.push({ ...d, report: r.name });
  }
}

diagnosis.summary = {
  latestRequestFile: latestRequest.latest?.file || null,
  latestJobFile: latestJob.latest?.file || null,
  requestRange: {
    startDate: requestNorm.startDate,
    endDate: requestNorm.endDate
  },
  needsPlanDatesDetected: allNeedsPlan,
  latestInterestingReportNames: latestReports.files.slice(0, 10).map(f => f.name),
  relevantScriptCount: relevantScripts.length
};

if (allNeedsPlan.length === 0) {
  diagnosis.findings.push("NO_NEEDS_PLAN_DATE_DETECTED_IN_REPORTS");
}

fs.writeFileSync(outPath, JSON.stringify(diagnosis, null, 2), "utf8");

console.log(JSON.stringify({
  ok: diagnosis.ok,
  generatedAt: diagnosis.generatedAt,
  latestRequestFile: diagnosis.summary.latestRequestFile,
  latestJobFile: diagnosis.summary.latestJobFile,
  requestRange: diagnosis.summary.requestRange,
  needsPlanDatesDetected: diagnosis.summary.needsPlanDatesDetected,
  findings: diagnosis.findings,
  report: outPath
}, null, 2));
