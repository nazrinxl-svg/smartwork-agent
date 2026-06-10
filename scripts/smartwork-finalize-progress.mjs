import fs from "fs";
import path from "path";
import { readJsonSafe, writeJsonSafe } from "../lib/smartwork-request-selector.mjs";

const ROOT = process.cwd();

function resolveMaybeRelative(p) {
  if (!p || typeof p !== "string") return null;
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

function latestFile(dir, pattern) {
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir)
    .map((name) => {
      const file = path.join(dir, name);
      const st = fs.statSync(file);
      return { name, file, mtimeMs: st.mtimeMs };
    })
    .filter((x) => pattern.test(x.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.file || null;
}

const request = readJsonSafe(path.join(ROOT, "data", "siaga-attendance-request.local.json"), {});
const account = Array.isArray(request.accounts) ? request.accounts[0] : {};

const jobId = process.env.SMARTWORK_JOB_ID || request.jobId;
if (!jobId) throw new Error("Finalizer butuh jobId.");

const jobPath = path.join(ROOT, "data", "jobs", `${jobId}.json`);
const job = readJsonSafe(jobPath, {
  jobId,
  service: "siaga",
  teacherId: request.teacherId || account.teacherId,
  teacherName: request.teacherName || account.teacherName,
  targetMonth: request.targetMonth,
  targetYear: request.targetYear
});

const verify = readJsonSafe(path.join(ROOT, "reports", "smartwork-after-save-verify-request.json"), null)
  || readJsonSafe(path.join(ROOT, "reports", "smartwork-after-save-verify-request-1-13.json"), {});

const pdf = readJsonSafe(path.join(ROOT, "reports", "siaga-job-download-presensi-pdf-report.json"), {});

const pdfCandidates = [
  resolveMaybeRelative(pdf?.file?.savedAs),
  resolveMaybeRelative(pdf?.file?.path),
  resolveMaybeRelative(typeof pdf?.file === "string" ? pdf.file : null),
  resolveMaybeRelative(pdf?.summary?.file),
  latestFile(path.join(ROOT, "reports", "downloads"), /Presensi_.*\.pdf$/i),
  latestFile(path.join(ROOT, "downloads"), /Presensi_.*\.pdf$/i)
].filter(Boolean);

const pdfFile = pdfCandidates.find((p) => fs.existsSync(p)) || null;

const proofCandidates = [
  path.join(ROOT, "reports", "proof", "smartwork-siaga-proof-report.json"),
  path.join(ROOT, "reports", "proof", "smartwork-siaga-proof-report.txt"),
  path.join(ROOT, "reports", "smartwork-siaga-proof-report.json"),
  path.join(ROOT, "reports", "smartwork-siaga-proof-report-agent.json"),
  path.join(ROOT, "reports", "smartwork-delivery-preview-report.json")
];

const proofPath = proofCandidates.find((p) => fs.existsSync(p)) || null;

const remainingNeeds =
  verify.remainingNeedsPlanInsideRequest ||
  verify.remainingNeedsPlanInsideRequestRange ||
  [];

const ok = Boolean(
  verify.ok === true &&
  Array.isArray(remainingNeeds) &&
  remainingNeeds.length === 0 &&
  pdf.ok === true &&
  pdfFile &&
  fs.existsSync(pdfFile) &&
  proofPath
);

job.status = ok ? "RESULT_READY" : "NEEDS_CHECK";
job.updatedAt = new Date().toISOString();
job.completedAt = ok ? new Date().toISOString() : job.completedAt;
job.resultReadyAt = ok ? new Date().toISOString() : job.resultReadyAt;
job.startDate = request.startDate || account.startDate || job.startDate;
job.endDate = request.endDate || account.endDate || job.endDate;
job.requestFile = job.requestFile || null;
job.result = {
  requestRange: `${job.startDate}..${job.endDate}`,
  allRequestedDatesDone: Boolean(verify.ok),
  pdfReady: Boolean(pdfFile),
  proofReady: Boolean(proofPath),
  emailReady: false,
  whatsappPreviewReady: false,
  emailSent: false,
  whatsappSent: false,
  pdfFile,
  pdfReport: "reports/siaga-job-download-presensi-pdf-report.json",
  proofReport: proofPath ? path.relative(ROOT, proofPath).replaceAll("\\", "/") : null,
  verifyReport: fs.existsSync(path.join(ROOT, "reports", "smartwork-after-save-verify-request.json"))
    ? "reports/smartwork-after-save-verify-request.json"
    : "reports/smartwork-after-save-verify-request-1-13.json"
};

writeJsonSafe(jobPath, job);

const progress = {
  ok,
  generatedAt: new Date().toISOString(),
  mode: "SMARTWORK_FINAL_PROGRESS",
  jobId: job.jobId,
  status: job.status,
  teacherId: job.teacherId,
  teacherName: job.teacherName,
  requestRange: job.result.requestRange,
  requestedDatesResult: {
    complete: Boolean(verify.ok),
    summary: verify.insideSummary || verify.summary || null,
    remainingNeedsPlanInsideRequest: remainingNeeds
  },
  artifacts: {
    pdfReady: Boolean(pdfFile),
    pdfFile,
    proofReady: Boolean(proofPath),
    proofReport: proofPath ? path.relative(ROOT, proofPath).replaceAll("\\", "/") : null
  },
  delivery: {
    emailReady: false,
    whatsappPreviewReady: false,
    emailSent: false,
    whatsappSent: false,
    mode: "APP_DOWNLOAD_ONLY", emailDisabled: true, whatsappDisabled: true, note: "Email dan WhatsApp dinonaktifkan. PDF dan bukti laporan tersedia melalui aplikasi."
  },
  sourceReports: job.result
};

writeJsonSafe(path.join(ROOT, "reports", "smartwork-final-progress-report.json"), progress);

console.log(JSON.stringify(progress, null, 2));

if (!ok) {
  throw new Error("Final progress belum ok. Cek verify/pdf/proof.");
}

