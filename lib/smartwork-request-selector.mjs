import fs from "fs";
import path from "path";

export function readJsonSafe(file, fallback = null) {
  try {
    if (!file || !fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJsonSafe(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
}

export function dateOnly(v) {
  if (!v) return null;
  const m = String(v).match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

export function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => {
      const file = path.join(dir, name);
      const st = fs.statSync(file);
      return {
        name,
        file,
        modifiedAt: st.mtime.toISOString(),
        mtimeMs: st.mtimeMs
      };
    });
}

export function normalizeSmartworkRequest(req) {
  const a0 = Array.isArray(req?.accounts) ? req.accounts[0] : {};

  const startDate =
    dateOnly(req?.startDate) ||
    dateOnly(a0?.startDate) ||
    dateOnly(req?.payload?.startDate);

  const endDate =
    dateOnly(req?.endDate) ||
    dateOnly(a0?.endDate) ||
    dateOnly(req?.payload?.endDate);

  return {
    jobId: req?.jobId || req?.id || null,
    requesterName: req?.requesterName || req?.name || null,
    service: req?.service || a0?.service || null,
    mode: req?.mode || null,
    requestType: req?.requestType || null,
    teacherId: req?.teacherId || a0?.teacherId || a0?.id || null,
    teacherName: req?.teacherName || req?.requesterName || a0?.teacherName || a0?.name || null,
    schoolName: a0?.schoolName || null,
    startDate,
    endDate,
    targetMonth: req?.targetMonth || a0?.targetMonth || null,
    targetYear: String(req?.targetYear || a0?.targetYear || ""),
    detailUrl: req?.detailUrl || a0?.detailUrl || null,
    createdAt: req?.createdAt || null,
    source: req?.source || null,
    accountsCount: Array.isArray(req?.accounts) ? req.accounts.length : 0,
    account: a0
  };
}

export function scoreSmartworkRequest(norm, opts = {}) {
  let score = 0;

  if (opts.jobId && norm.jobId === opts.jobId) score += 1000;
  if (opts.teacherId && norm.teacherId === opts.teacherId) score += 300;
  if (opts.teacherName && String(norm.teacherName || "").toLowerCase().includes(String(opts.teacherName).toLowerCase())) score += 100;
  if (opts.service && norm.service === opts.service) score += 80;
  if (opts.startDate && norm.startDate === opts.startDate) score += 80;
  if (opts.endDate && norm.endDate === opts.endDate) score += 150;
  if (norm.source === "smartwork-user-request-form") score += 40;
  if (norm.startDate && norm.endDate) score += 30;
  if (norm.detailUrl) score += 20;

  const created = Date.parse(norm.createdAt || 0) || 0;

  return { score, created };
}

export function selectSmartworkRequest(root, opts = {}) {
  const requestDirs = [
    path.join(root, "intake", "requests"),
    path.join(root, "data", "requests"),
    path.join(root, "requests")
  ];

  const files = requestDirs.flatMap(listJsonFiles);

  const candidates = files.map((meta) => {
    const raw = readJsonSafe(meta.file, {});
    const normalized = normalizeSmartworkRequest(raw);
    const scored = scoreSmartworkRequest(normalized, opts);
    return {
      ...meta,
      raw,
      normalized,
      score: scored.score,
      createdScore: scored.created
    };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.createdScore !== a.createdScore) return b.createdScore - a.createdScore;
    return b.mtimeMs - a.mtimeMs;
  });

  return {
    selected: candidates[0] || null,
    candidates
  };
}

export function buildLocalSiagaRequest(selected) {
  if (!selected?.raw) throw new Error("Tidak ada selected.raw request.");

  const req = selected.raw;
  const norm = selected.normalized;
  const account = norm.account || {};

  if (!norm.teacherId) throw new Error("Request tidak punya teacherId.");
  if (!norm.startDate || !norm.endDate) throw new Error("Request tidak punya startDate/endDate.");
  if (!norm.detailUrl) throw new Error("Request tidak punya detailUrl.");

  return {
    ...req,
    jobId: norm.jobId,
    requesterName: norm.requesterName,
    service: norm.service || "siaga",
    targetMonth: norm.targetMonth,
    targetYear: norm.targetYear,
    startDate: norm.startDate,
    endDate: norm.endDate,
    teacherId: norm.teacherId,
    teacherName: norm.teacherName,
    detailUrl: norm.detailUrl,
    holidays: req?.schedule?.holidayDates || account?.skipDates || [],
    leaveDays: req?.schedule?.leaveDates || account?.leaveDates || [],
    accounts: [
      {
        ...account,
        teacherId: norm.teacherId,
        teacherName: norm.teacherName,
        schoolName: norm.schoolName || account?.schoolName,
        startDate: norm.startDate,
        endDate: norm.endDate,
        detailUrl: norm.detailUrl
      }
    ]
  };
}

export function upsertSmartworkJob(root, selected) {
  const norm = selected.normalized;

  if (!norm.jobId) throw new Error("Request tidak punya jobId.");

  const jobPath = path.join(root, "data", "jobs", `${norm.jobId}.json`);
  const existing = readJsonSafe(jobPath, {});

  const job = {
    ...existing,
    jobId: norm.jobId,
    service: norm.service || "siaga",
    teacherId: norm.teacherId,
    teacherName: norm.teacherName,
    targetMonth: norm.targetMonth,
    targetYear: norm.targetYear,
    startDate: norm.startDate,
    endDate: norm.endDate,
    status: existing.status || "RUNNING",
    autoStart: true,
    autoStartSource: existing.autoStartSource || "request_submit",
    requestFile: selected.file,
    detailUrl: norm.detailUrl,
    updatedAt: new Date().toISOString(),
    createdAt: existing.createdAt || new Date().toISOString(),
    runner: {
      ...(existing.runner || {}),
      mode: "REQUEST_BASED_E2E",
      source: path.relative(root, selected.file).replaceAll("\\", "/")
    }
  };

  writeJsonSafe(jobPath, job);

  return { jobPath, job };
}
