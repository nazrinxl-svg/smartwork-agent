import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports");
const OUT_DIR = path.join(REPORT_DIR, "progress");

function readJson(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    return { ok: false, parseError: error.message, path: rel };
  }
}

function latestJson(dirRel) {
  const dir = path.join(ROOT, dirRel);
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return {
        name,
        full,
        rel: path.relative(ROOT, full).replaceAll("\\", "/"),
        mtimeMs: stat.mtimeMs,
        modifiedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!files[0]) return null;

  return {
    file: files[0],
    json: JSON.parse(fs.readFileSync(files[0].full, "utf8").replace(/^\uFEFF/, ""))
  };
}

function countInputResults(inputPreview) {
  const results = inputPreview?.result?.results || [];
  return {
    total: results.length,
    filledNoSave: results.filter((x) => x.status === "filled_no_save").length,
    saved: results.filter((x) => x.status === "saved_and_verified").length,
    failed: results.filter((x) => x.ok === false || x.status === "failed").length,
    needsCheck: results.filter((x) => x.status === "needs_check").length,
    dates: results.map((x) => ({
      date: x.target?.date || null,
      tanggal: x.target?.tanggal || null,
      hari: x.target?.hari || null,
      status: x.status || null,
      ok: Boolean(x.ok),
      masuk: x.target?.masuk || null,
      pulang: x.target?.pulang || null
    }))
  };
}

function countTimePlan(timePlan) {
  const rows =
    timePlan?.results?.[0]?.rows ||
    timePlan?.result?.rows ||
    [];

  return {
    total: rows.length,
    planned: rows.filter((x) => x.status === "needs_plan").length,
    skipped: rows.filter((x) => x.status === "skip").length,
    alreadyFilled: rows.filter((x) => x.status === "already_filled").length,
    needsCheck: rows.filter((x) => x.status === "needs_check").length,
    dates: rows.map((x) => ({
      tanggal: x.tanggal,
      hari: x.hari,
      status: x.status,
      reason: x.reason,
      masuk: x.plan?.masuk || null,
      pulang: x.plan?.pulang || null,
      rule: x.plan?.rule || null
    }))
  };
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const latestJob = latestJson("data/jobs");
const latestRequest = latestJson("intake/requests");

const reports = {
  pipeline: readJson("reports/smartwork-request-pipeline-diagnose-report.json"),
  intelligence: readJson("reports/smartwork-agent-intelligence-diagnose-report.json"),
  timePlan: readJson("reports/siaga-job-time-plan-preview-report.json"),
  inputPreview: readJson("reports/siaga-job-input-preview-no-save-report.json"),
  saveConfirmed: readJson("reports/siaga-job-save-confirmed-report.json"),
  pdfDownload: readJson("reports/siaga-job-download-presensi-pdf-report.json"),
  proofReport: readJson("reports/proof/smartwork-siaga-proof-report.json"),
  deliverySummary: readJson("reports/delivery-summary/smartwork-delivery-summary-report.json")
};

const job = latestJob?.json || {};
const request = latestRequest?.json || {};
const account = request.accounts?.[0] || {};

const timePlanSummary = countTimePlan(reports.timePlan);
const inputSummary = countInputResults(reports.inputPreview);

const pdfReady = Boolean(reports.pdfDownload?.ok && reports.pdfDownload?.file?.savedAs);
const proofReady = Boolean(reports.proofReport?.ok && reports.proofReport?.status === "SIAGA_PROOF_READY");

let stage = "QUEUED";
let stageText = "Request diterima";
let tone = "info";

if (job.status === "FAILED") {
  stage = "FAILED";
  stageText = "Pekerjaan gagal. Perlu dicek admin.";
  tone = "danger";
} else if (job.status === "RUNNING") {
  stage = "RUNNING";
  stageText = "SmartWork Agent sedang memproses request.";
  tone = "warning";
} else if (pdfReady && proofReady) {
  stage = "RESULT_READY";
  stageText = "Pekerjaan selesai. PDF dan laporan bukti siap.";
  tone = "success";
} else if (proofReady) {
  stage = "PROOF_READY";
  stageText = "Laporan bukti siap. PDF perlu dicek.";
  tone = "success";
} else if (pdfReady) {
  stage = "PDF_READY";
  stageText = "PDF presensi sudah tersedia.";
  tone = "success";
} else if (reports.saveConfirmed?.ok) {
  stage = "RUNNING_SAVE";
  stageText = "Data sudah disimpan sebagian/selesai disimpan.";
  tone = "warning";
} else if (reports.inputPreview?.ok) {
  stage = "RUNNING_INPUT";
  stageText = "SmartWork Agent berhasil mengisi preview input.";
  tone = "warning";
} else if (reports.timePlan?.ok) {
  stage = "RUNNING_TIME_PLAN";
  stageText = "SmartWork Agent sudah membuat rencana tanggal dan jam.";
  tone = "warning";
}

const progressSteps = [
  {
    id: "request",
    label: "Request diterima",
    done: Boolean(latestRequest),
    detail: latestRequest?.file?.rel || null
  },
  {
    id: "job",
    label: "Job dibuat",
    done: Boolean(latestJob),
    detail: job.status || null
  },
  {
    id: "time_plan",
    label: "Rencana tanggal dibuat",
    done: Boolean(reports.timePlan?.ok),
    detail: `${timePlanSummary.planned} direncanakan, ${timePlanSummary.skipped} dilewati`
  },
  {
    id: "input",
    label: "Input diproses",
    done: Boolean(reports.inputPreview?.ok),
    detail: `${inputSummary.filledNoSave} preview terisi`
  },
  {
    id: "save",
    label: "Data disimpan",
    done: Boolean(reports.saveConfirmed?.ok),
    detail: reports.saveConfirmed?.summary ? `${reports.saveConfirmed.summary.saved || 0} tersimpan` : null
  },
  {
    id: "pdf",
    label: "PDF diunduh",
    done: pdfReady,
    detail: reports.pdfDownload?.file?.savedAs || null
  },
  {
    id: "proof",
    label: "Laporan bukti dibuat",
    done: proofReady,
    detail: reports.proofReport?.statusText || null
  }
];

const nextActions = [];

if (stage === "RESULT_READY") {
  nextActions.push("Tampilkan tombol download PDF dan laporan bukti di Progress/History.");
  nextActions.push("Siapkan draft email dan preview WhatsApp, jangan auto-send tanpa provider valid.");
} else if (stage === "FAILED") {
  nextActions.push("Baca error job dan report runner terakhir.");
} else {
  nextActions.push("Lanjutkan monitor runner sampai RESULT_READY atau FAILED.");
}

const progress = {
  ok: true,
  mode: "SMARTWORK_PROGRESS_INTELLIGENCE",
  generatedAt: new Date().toISOString(),
  stage,
  stageText,
  tone,
  job: {
    jobId: job.jobId || request.jobId || null,
    status: job.status || null,
    service: job.service || request.service || "siaga",
    teacherId: job.teacherId || account.teacherId || null,
    teacherName: account.teacherName || request.requesterName || null,
    targetMonth: job.targetMonth || request.targetMonth || null,
    targetYear: job.targetYear || request.targetYear || null,
    startDate: account.startDate || null,
    endDate: account.endDate || null,
    error: job.error || null
  },
  request: latestRequest ? {
    file: latestRequest.file.rel,
    modifiedAt: latestRequest.file.modifiedAt
  } : null,
  latestJob: latestJob ? {
    file: latestJob.file.rel,
    modifiedAt: latestJob.file.modifiedAt
  } : null,
  summaries: {
    timePlan: timePlanSummary,
    inputPreview: inputSummary,
    saveConfirmed: reports.saveConfirmed?.summary || null,
    pdfDownload: reports.pdfDownload?.file || null,
    proofReport: reports.proofReport ? {
      status: reports.proofReport.status,
      statusText: reports.proofReport.statusText,
      pdfFound: reports.proofReport.files?.pdfFound || false,
      pdfName: reports.proofReport.files?.pdfName || null,
      emailDraftReady: reports.proofReport.delivery?.emailDraftReady || false,
      whatsappPreviewReady: reports.proofReport.delivery?.whatsappPreviewReady || false
    } : null
  },
  progressSteps,
  nextActions
};

const outJson = path.join(OUT_DIR, "smartwork-progress-intelligence-report.json");
fs.writeFileSync(outJson, JSON.stringify(progress, null, 2), "utf8");

console.log(JSON.stringify({
  ok: progress.ok,
  mode: progress.mode,
  stage: progress.stage,
  stageText: progress.stageText,
  jobId: progress.job.jobId,
  reportPath: path.relative(ROOT, outJson).replaceAll("\\", "/")
}, null, 2));
