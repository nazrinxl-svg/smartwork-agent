import path from "path";
import {
  selectSmartworkRequest,
  buildLocalSiagaRequest,
  upsertSmartworkJob,
  writeJsonSafe,
  redactSmartworkRequestForReport,
  normalizeSmartworkRequest
} from "../lib/smartwork-request-selector.mjs";

const ROOT = process.cwd();

const opts = {
  jobId: process.env.SMARTWORK_JOB_ID || "",
  teacherId: process.env.TARGET_TEACHER_ID || process.env.SMARTWORK_TEACHER_ID || "guru-001",
  teacherName: process.env.SMARTWORK_TEACHER_NAME || "",
  service: process.env.SMARTWORK_SERVICE || "siaga",
  startDate: process.env.SMARTWORK_START_DATE || "",
  endDate: process.env.SMARTWORK_END_DATE || ""
};

const API_JOBS_URL = process.env.SMARTWORK_JOBS_API_URL || "https://api.smartwork-agent.id/api/smartwork/jobs";
const preferApi = process.env.SMARTWORK_SYNC_SOURCE !== "local";

function isoStamp(value) {
  const d = value ? new Date(value) : new Date();
  const ok = Number.isFinite(d.getTime()) ? d : new Date();
  return ok.toISOString().replace(/[:.]/g, "-");
}

function dateOnly(value) {
  const m = String(value || "").match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
}

function monthNameFromDate(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-\d{2}$/);
  const map = {
    "01": "Januari",
    "02": "Februari",
    "03": "Maret",
    "04": "April",
    "05": "Mei",
    "06": "Juni",
    "07": "Juli",
    "08": "Agustus",
    "09": "September",
    "10": "Oktober",
    "11": "November",
    "12": "Desember"
  };
  return m ? map[m[2]] || "" : "";
}

function yearFromDate(value) {
  const m = String(value || "").match(/^(\d{4})-\d{2}-\d{2}$/);
  return m ? m[1] : "";
}

function firstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

async function fetchProductionJobs() {
  const res = await fetch(API_JOBS_URL, {
    method: "GET",
    headers: { accept: "application/json" }
  });

  if (!res.ok) {
    throw new Error(`API jobs fetch gagal: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return Array.isArray(json.items) ? json.items : [];
}

function jobDateRange(job) {
  const range = job?.requestRange && typeof job.requestRange === "object" ? job.requestRange : {};
  const startDate = dateOnly(firstText(job?.startDate, range.startDate, job?.request?.startDate));
  const endDate = dateOnly(firstText(job?.endDate, range.endDate, job?.request?.endDate, startDate));
  return { startDate, endDate };
}

function jobTeacherId(job) {
  return firstText(job?.teacherId, job?.accountRef, job?.credentialRef, job?.request?.teacherId);
}

function isApiJobUsable(job, opts) {
  const { startDate, endDate } = jobDateRange(job);
  const teacherId = jobTeacherId(job);

  if (!job?.id && !job?.jobId) return false;
  if ((opts.service || "siaga") && firstText(job?.module, job?.service, "siaga") !== (opts.service || "siaga")) return false;
  if (opts.teacherId && teacherId && teacherId !== opts.teacherId) return false;
  if (!startDate || !endDate) return false;
  if (opts.startDate && startDate !== opts.startDate) return false;
  if (opts.endDate && endDate !== opts.endDate) return false;

  return true;
}

function sortApiJobs(a, b) {
  const ad = Date.parse(a?.updatedAt || a?.createdAt || 0) || 0;
  const bd = Date.parse(b?.updatedAt || b?.createdAt || 0) || 0;
  return bd - ad;
}

function borrowLocalIdentity(localSelection) {
  const selected = localSelection?.selected || null;
  const norm = selected?.normalized || {};
  const account = norm.account || {};

  return {
    teacherId: firstText(norm.teacherId, account.teacherId, opts.teacherId),
    teacherName: firstText(norm.teacherName, account.teacherName, opts.teacherName),
    schoolName: firstText(norm.schoolName, account.schoolName),
    detailUrl: firstText(norm.detailUrl, account.detailUrl),
    account
  };
}

function buildSelectedFromApiJob(apiJob, localSelection) {
  const borrow = borrowLocalIdentity(localSelection);
  const { startDate, endDate } = jobDateRange(apiJob);
  const jobId = firstText(apiJob.id, apiJob.jobId);
  const teacherId = firstText(jobTeacherId(apiJob), borrow.teacherId, opts.teacherId);
  const teacherName = firstText(apiJob?.teacherName, apiJob?.requester?.name, borrow.teacherName);
  const schoolName = firstText(apiJob?.schoolName, borrow.schoolName);
  const detailUrl = firstText(apiJob?.detailUrl, apiJob?.request?.detailUrl, borrow.detailUrl, process.env.SMARTWORK_DETAIL_URL);
  const targetMonth = firstText(apiJob?.targetMonth, monthNameFromDate(startDate));
  const targetYear = firstText(apiJob?.targetYear, yearFromDate(startDate));

  if (!detailUrl) {
    throw new Error("API job valid, tapi detailUrl kosong. Tidak aman untuk lanjut preview/SIAGA.");
  }

  const raw = {
    jobId,
    requesterName: firstText(apiJob?.requester?.name, teacherName),
    service: firstText(apiJob?.module, apiJob?.service, opts.service, "siaga"),
    mode: firstText(apiJob?.mode, "dry-run"),
    requestType: firstText(apiJob?.request?.requestType, "bulk-monthly"),
    teacherId,
    teacherName,
    schoolName,
    startDate,
    endDate,
    targetMonth,
    targetYear,
    detailUrl,
    createdAt: apiJob?.createdAt || new Date().toISOString(),
    source: firstText(apiJob?.source, "smartwork-production-api-job"),
    productionJob: {
      id: jobId,
      status: apiJob?.status || "",
      path: apiJob?.path || "",
      mode: apiJob?.mode || "",
      safety: apiJob?.safety || {}
    },
    accounts: [
      {
        ...(borrow.account || {}),
        teacherId,
        teacherName,
        schoolName,
        startDate,
        endDate,
        targetMonth,
        targetYear,
        detailUrl
      }
    ]
  };

  const importName = `${isoStamp(apiJob?.createdAt)}-${jobId}-api-import.json`;
  const importPath = path.join(ROOT, "intake", "requests", importName);
  writeJsonSafe(importPath, raw);

  const normalized = normalizeSmartworkRequest(raw);

  return {
    file: importPath,
    name: importName,
    raw,
    normalized,
    invalidReasons: [],
    isValidForRun: true,
    score: 999999,
    createdScore: Date.parse(raw.createdAt || 0) || Date.now(),
    modifiedAt: new Date().toISOString(),
    mtimeMs: Date.now(),
    source: "production-api"
  };
}

async function selectRequest() {
  const localSelection = selectSmartworkRequest(ROOT, opts);

  if (!preferApi) {
    return {
      selected: localSelection.selected,
      selection: localSelection,
      selectedSource: "local-only",
      api: {
        attempted: false,
        url: API_JOBS_URL,
        usableCount: 0
      }
    };
  }

  try {
    const jobs = await fetchProductionJobs();
    const usable = jobs.filter((job) => isApiJobUsable(job, opts)).sort(sortApiJobs);

    if (usable.length) {
      const selected = buildSelectedFromApiJob(usable[0], localSelection);
      return {
        selected,
        selection: {
          selected,
          candidates: [
            selected,
            ...(localSelection.candidates || [])
          ]
        },
        selectedSource: "production-api",
        api: {
          attempted: true,
          url: API_JOBS_URL,
          totalCount: jobs.length,
          usableCount: usable.length,
          selectedJobId: selected.normalized.jobId
        }
      };
    }

    return {
      selected: localSelection.selected,
      selection: localSelection,
      selectedSource: "local-fallback-no-api-usable-job",
      api: {
        attempted: true,
        url: API_JOBS_URL,
        totalCount: jobs.length,
        usableCount: 0
      }
    };
  } catch (error) {
    return {
      selected: localSelection.selected,
      selection: localSelection,
      selectedSource: "local-fallback-api-error",
      api: {
        attempted: true,
        url: API_JOBS_URL,
        error: String(error?.message || error)
      }
    };
  }
}

const { selected, selection, selectedSource, api } = await selectRequest();

if (!selected) {
  throw new Error("Tidak ada request SmartWork yang ditemukan.");
}

const localRequest = buildLocalSiagaRequest(selected);
const localRequestPath = path.join(ROOT, "data", "siaga-attendance-request.local.json");
writeJsonSafe(localRequestPath, localRequest);

const { jobPath, job } = upsertSmartworkJob(ROOT, selected);

const report = {
  ok: true,
  mode: "SMARTWORK_SYNC_LATEST_REQUEST_TO_LOCAL_AND_JOB",
  generatedAt: new Date().toISOString(),
  selectionRule: "production-api-first, local-fallback, content-based",
  selectedSource,
  api,
  selectedRequest: {
    file: selected.file,
    name: selected.name,
    score: selected.score,
    normalized: redactSmartworkRequestForReport(selected.normalized)
  },
  localRequestPath,
  jobPath,
  job,
  topCandidates: selection.candidates.slice(0, 10).map((x) => ({
    file: x.file,
    name: x.name,
    score: x.score,
    modifiedAt: x.modifiedAt,
    normalized: redactSmartworkRequestForReport(x.normalized)
  })),
  safety: {
    noSiagaLogin: true,
    noBrowserOpen: true,
    noInput: true,
    noSave: true,
    noDelete: true,
    syncOnly: true
  }
};

writeJsonSafe(path.join(ROOT, "reports", "smartwork-sync-latest-request-report.json"), report);

console.log(JSON.stringify({
  ok: true,
  selectedSource,
  api,
  selectedRequest: selected.file,
  jobId: selected.normalized.jobId,
  teacherId: selected.normalized.teacherId,
  range: `${selected.normalized.startDate}..${selected.normalized.endDate}`,
  detailUrlReady: Boolean(selected.normalized.detailUrl),
  jobPath,
  localRequestPath,
  safety: report.safety
}, null, 2));
