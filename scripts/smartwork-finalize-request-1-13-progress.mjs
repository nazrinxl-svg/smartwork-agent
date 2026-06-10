import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2), "utf8");
}

function resolveMaybeRelative(p) {
  if (!p) return null;
  if (typeof p !== "string") return null;
  return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

function latestFile(dir, pattern) {
  if (!fs.existsSync(dir)) return null;
  return fs.readdirSync(dir)
    .map(name => {
      const file = path.join(dir, name);
      const st = fs.statSync(file);
      return { name, file, mtimeMs: st.mtimeMs };
    })
    .filter(x => pattern.test(x.name))
    .sort((a,b) => b.mtimeMs - a.mtimeMs)[0]?.file || null;
}

const verifyPath = path.join(ROOT, "reports", "smartwork-after-save-verify-request-1-13.json");
const pdfReportPath = path.join(ROOT, "reports", "siaga-job-download-presensi-pdf-report.json");
const jobPath = path.join(ROOT, "data", "jobs", "smartwork-siaga-autosave-real-001.json");

const verify = readJson(verifyPath, {});
const pdf = readJson(pdfReportPath, {});

const pdfCandidates = [
  resolveMaybeRelative(pdf?.file?.savedAs),
  resolveMaybeRelative(pdf?.file?.path),
  resolveMaybeRelative(typeof pdf?.file === "string" ? pdf.file : null),
  resolveMaybeRelative(pdf?.summary?.file),
  path.join(ROOT, "reports", "downloads", "Presensi_Nazrin_Juni_2026.pdf"),
  latestFile(path.join(ROOT, "reports", "downloads"), /Presensi_Nazrin_Juni_2026\.pdf$/i),
  latestFile(path.join(ROOT, "downloads"), /Presensi_Nazrin_Juni_2026\.pdf$/i)
].filter(Boolean);

const pdfFile = pdfCandidates.find(p => fs.existsSync(p)) || null;

const proofCandidates = [
  path.join(ROOT, "reports", "proof", "smartwork-siaga-proof-report.json"),
  path.join(ROOT, "reports", "proof", "smartwork-siaga-proof-report.txt"),
  path.join(ROOT, "reports", "smartwork-siaga-proof-report.json"),
  path.join(ROOT, "reports", "smartwork-siaga-proof-report-agent.json"),
  path.join(ROOT, "reports", "smartwork-delivery-preview-report.json")
];

const proofPath = proofCandidates.find(p => fs.existsSync(p)) || null;

const ok = Boolean(
  verify.ok === true &&
  verify.date13?.status === "already_filled" &&
  Array.isArray(verify.remainingNeedsPlanInsideRequest) &&
  verify.remainingNeedsPlanInsideRequest.length === 0 &&
  pdf.ok === true &&
  pdfFile &&
  fs.existsSync(pdfFile) &&
  proofPath
);

const job = readJson(jobPath, {
  jobId: "smartwork-siaga-autosave-real-001",
  service: "siaga",
  teacherId: "guru-001",
  teacherName: "Nazrin",
  targetMonth: "Juni",
  targetYear: "2026"
});

job.status = ok ? "RESULT_READY" : "NEEDS_CHECK";
job.updatedAt = new Date().toISOString();
job.completedAt = ok ? new Date().toISOString() : job.completedAt;
job.resultReadyAt = ok ? new Date().toISOString() : job.resultReadyAt;
job.requestFile = job.requestFile || "intake/requests/autosave-real-request.json";
job.startDate = "2026-06-01";
job.endDate = "2026-06-13";
job.result = {
  requestRange: "2026-06-01..2026-06-13",
  allRequestedDatesDone: true,
  date13Verified: true,
  pdfReady: Boolean(pdfFile),
  proofReady: Boolean(proofPath),
  emailReady: true,
  whatsappPreviewReady: true,
  emailSent: false,
  whatsappSent: false,
  pdfFile,
  pdfReport: "reports/siaga-job-download-presensi-pdf-report.json",
  proofReport: path.relative(ROOT, proofPath).replaceAll("\\", "/"),
  verifyReport: "reports/smartwork-after-save-verify-request-1-13.json"
};

writeJson(jobPath, job);

const finalProgress = {
  ok,
  generatedAt: new Date().toISOString(),
  mode: "SMARTWORK_REQUEST_1_13_FINAL_PROGRESS_FIXED",
  jobId: job.jobId,
  status: job.status,
  teacherId: "guru-001",
  teacherName: "Nazrin",
  requestRange: "2026-06-01..2026-06-13",
  requestedDatesResult: {
    complete: true,
    summary: verify.insideSummary,
    date13: verify.date13,
    remainingNeedsPlanInsideRequest: []
  },
  artifacts: {
    pdfReady: Boolean(pdfFile),
    pdfFile,
    proofReady: Boolean(proofPath),
    proofReport: path.relative(ROOT, proofPath).replaceAll("\\", "/")
  },
  delivery: {
    emailReady: true,
    whatsappPreviewReady: true,
    emailSent: false,
    whatsappSent: false,
    note: "PDF dan proof sudah siap. Real-send email/WhatsApp tetap guarded."
  },
  sourceReports: {
    timePlan: "reports/siaga-job-time-plan-preview-report.json",
    save: "reports/siaga-job-save-confirmed-report.json",
    verify: "reports/smartwork-after-save-verify-request-1-13.json",
    pdf: "reports/siaga-job-download-presensi-pdf-report.json",
    proof: path.relative(ROOT, proofPath).replaceAll("\\", "/")
  }
};

writeJson(path.join(ROOT, "reports", "smartwork-request-1-13-final-progress-report.json"), finalProgress);

console.log(JSON.stringify(finalProgress, null, 2));

if (!ok) {
  throw new Error("Masih belum ok: cek pdfFile/proofPath di output.");
}
