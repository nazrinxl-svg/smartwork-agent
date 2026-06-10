import path from "path";
import {
  selectSmartworkRequest,
  buildLocalSiagaRequest,
  upsertSmartworkJob,
  writeJsonSafe
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

const selection = selectSmartworkRequest(ROOT, opts);
const selected = selection.selected;

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
  selectionRule: "content-based, not modifiedAt-only",
  selectedRequest: {
    file: selected.file,
    name: selected.name,
    score: selected.score,
    normalized: selected.normalized
  },
  localRequestPath,
  jobPath,
  job,
  topCandidates: selection.candidates.slice(0, 10).map((x) => ({
    file: x.file,
    name: x.name,
    score: x.score,
    modifiedAt: x.modifiedAt,
    normalized: x.normalized
  }))
};

writeJsonSafe(path.join(ROOT, "reports", "smartwork-sync-latest-request-report.json"), report);

console.log(JSON.stringify({
  ok: true,
  selectedRequest: selected.file,
  jobId: selected.normalized.jobId,
  teacherId: selected.normalized.teacherId,
  range: `${selected.normalized.startDate}..${selected.normalized.endDate}`,
  jobPath,
  localRequestPath
}, null, 2));
