import fs from "fs";
import path from "path";

const MODE = "SMARTWORK_MISSING_PDF_SIAGA_WORKER_PLANNER_V1_SMART_SAFE";

const BATCH_PLAN_PATH =
  process.env.BATCH_PLAN_PATH || "reports/batch/smartwork-batch-plan-report.json";

const BATCH_SUMMARY_PATH =
  process.env.BATCH_SUMMARY_PATH || "reports/batch-summary/smartwork-batch-summary-report.json";

const INTAKE_PATH =
  process.env.INTAKE_PATH || "intake/smartwork-job-request.sample.json";

const OUT_REPORT_PATH =
  process.env.OUT_REPORT_PATH || "reports/siaga-worker-plan/smartwork-missing-pdf-worker-plan-report.json";

const OUT_TEXT_PATH =
  process.env.OUT_TEXT_PATH || "reports/siaga-worker-plan/smartwork-missing-pdf-worker-plan.txt";

const rules = {
  plannerOnly: true,
  noLogin: true,
  noInput: true,
  noSave: true,
  noSubmit: true,
  noDelete: true,
  noEmailSend: true,
  noWhatsAppSend: true,
  requireConfirmationBeforeSaveSubmitSend: true,
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`STOP: File tidak ditemukan: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safe(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return value;
}

function normalizeDateList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function estimateWorkType(account) {
  if (account.pdfExists) {
    return {
      status: "DELIVERY_READY",
      priority: 0,
      reason: "PDF sudah tersedia, tidak perlu worker SIAGA untuk download PDF.",
      recommendedAction: "RUN_DELIVERY_ONLY",
    };
  }

  const nextActions = Array.isArray(account.nextActions) ? account.nextActions : [];

  if (nextActions.includes("RUN_SIAGA_ATTENDANCE_OR_DOWNLOAD_PDF_PREVIEW_FIRST")) {
    return {
      status: "NEEDS_SIAGA_PDF_WORKER",
      priority: 1,
      reason: "PDF belum tersedia. Perlu worker SIAGA untuk cek halaman absensi target, download PDF jika sudah ada, atau rencanakan input jika belum lengkap.",
      recommendedAction: "PLAN_SIAGA_OPEN_TARGET_MONTH_AND_DOWNLOAD_PDF_PREVIEW",
    };
  }

  return {
    status: "NEEDS_CHECK",
    priority: 2,
    reason: "Status akun belum cukup jelas. Perlu diagnosis manual/preview.",
    recommendedAction: "DIAGNOSE_ACCOUNT_STATE",
  };
}

function buildWorkerPlan(account, index, intake) {
  const work = estimateWorkType(account);
  const skipDates = normalizeDateList(account?.exceptions?.skipDates || account?.skipDates);
  const leaveDates = normalizeDateList(account?.exceptions?.leaveDates || account?.leaveDates);

  return {
    workerId: account.workerId || `worker-${String(index + 1).padStart(3, "0")}`,
    teacherId: account.teacherId || null,
    teacherName: account.teacherName || null,
    schoolName: account.schoolName || null,
    service: account.service || intake.service || "siaga",
    mode: account.mode || intake.mode || "attendance-monthly",
    targetMonth: account.targetMonth || intake.targetMonth || null,
    targetYear: account.targetYear || intake.targetYear || null,
    targetPdfName: account.targetPdfName || null,
    pdfPath: account.pdfPath || (account.targetPdfName ? path.join("reports", "downloads", account.targetPdfName) : null),
    pdfExists: Boolean(account.pdfExists),
    workerStatus: work.status,
    priority: work.priority,
    reason: work.reason,
    recommendedAction: work.recommendedAction,
    exceptionRules: {
      skipDates,
      leaveDates,
      skipDatesCount: skipDates.length,
      leaveDatesCount: leaveDates.length,
    },
    safety: {
      previewOnly: true,
      canOpenSiagaPage: true,
      canDiagnoseDom: true,
      canDownloadExistingPdf: true,
      canInputAttendance: false,
      canSave: false,
      canSubmit: false,
      canDelete: false,
      canSendEmail: false,
      canSendWhatsApp: false,
      requiresUserConfirmationForInputSaveSubmitSend: true,
    },
    suggestedSteps:
      work.status === "NEEDS_SIAGA_PDF_WORKER"
        ? [
            "Open SIAGA safely using existing worker/profile.",
            "Navigate to Absensi page.",
            "Find exact target month/year row.",
            "If row exists, use Unduh button/download_draf_kehadiran to fetch PDF.",
            "If row missing, create preview only and stop before Simpan.",
            "If attendance rows incomplete, produce input plan only; do not save without confirmation.",
          ]
        : work.status === "DELIVERY_READY"
          ? [
              "Skip SIAGA worker.",
              "Use delivery pipeline only.",
            ]
          : [
              "Run diagnose preview to understand account state.",
            ],
  };
}

function buildText(report) {
  const lines = [];

  lines.push("SMARTWORK MISSING PDF / SIAGA WORKER PLAN");
  lines.push("=========================================");
  lines.push("");
  lines.push(`Status: ${report.status}`);
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");

  lines.push("JOB");
  lines.push(`- Job ID: ${safe(report.job.jobId)}`);
  lines.push(`- Service: ${safe(report.job.service)}`);
  lines.push(`- Mode: ${safe(report.job.mode)}`);
  lines.push(`- Period: ${safe(report.job.targetMonth)} ${safe(report.job.targetYear)}`);
  lines.push("");

  lines.push("COUNTS");
  lines.push(`- Total accounts: ${report.counts.totalAccounts}`);
  lines.push(`- Need SIAGA/PDF worker: ${report.counts.needsSiagaPdfWorkerCount}`);
  lines.push(`- Delivery ready: ${report.counts.deliveryReadyCount}`);
  lines.push(`- Needs check: ${report.counts.needsCheckCount}`);
  lines.push("");

  lines.push("WORKER PLAN");
  for (const item of report.workerPlan) {
    lines.push(`- ${safe(item.workerId)} | ${safe(item.teacherId)} | ${safe(item.teacherName)} | ${item.workerStatus}`);
    lines.push(`  School: ${safe(item.schoolName)}`);
    lines.push(`  PDF: ${item.pdfExists ? "OK" : "MISSING"} | ${safe(item.targetPdfName)}`);
    lines.push(`  Action: ${item.recommendedAction}`);
    lines.push(`  Reason: ${item.reason}`);
  }
  lines.push("");

  lines.push("NEXT SAFE STEP");
  lines.push(`- ${report.nextSafeStep}`);
  lines.push("");

  return lines.join("\n");
}

function writeOutput(report, text) {
  fs.mkdirSync(path.dirname(OUT_REPORT_PATH), { recursive: true });
  fs.writeFileSync(OUT_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(OUT_TEXT_PATH, text, "utf8");
}

async function main() {
  console.log(`MODE=${MODE}`);
  console.log("RULE=PLANNER_ONLY_NO_LOGIN_NO_INPUT_NO_SAVE_NO_SEND");

  const batchPlan = readJson(BATCH_PLAN_PATH);
  const batchSummary = readJsonIfExists(BATCH_SUMMARY_PATH);
  const intake = readJsonIfExists(INTAKE_PATH) || {};

  const accounts = Array.isArray(batchPlan.accounts) ? batchPlan.accounts : [];
  const workerPlan = accounts
    .map((account, index) => buildWorkerPlan(account, index, intake))
    .sort((a, b) => a.priority - b.priority);

  const counts = {
    totalAccounts: workerPlan.length,
    needsSiagaPdfWorkerCount: workerPlan.filter((item) => item.workerStatus === "NEEDS_SIAGA_PDF_WORKER").length,
    deliveryReadyCount: workerPlan.filter((item) => item.workerStatus === "DELIVERY_READY").length,
    needsCheckCount: workerPlan.filter((item) => item.workerStatus === "NEEDS_CHECK").length,
  };

  let status = "SIAGA_WORKER_PLAN_READY";
  if (counts.needsCheckCount > 0) status = "SIAGA_WORKER_PLAN_NEEDS_CHECK";
  else if (counts.needsSiagaPdfWorkerCount > 0) status = "SIAGA_WORKER_PLAN_HAS_MISSING_PDF_WORK";

  const report = {
    ok: counts.needsCheckCount === 0,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    rules,
    sourceReports: {
      batchPlan: BATCH_PLAN_PATH,
      batchSummary: fs.existsSync(BATCH_SUMMARY_PATH) ? BATCH_SUMMARY_PATH : null,
      intake: fs.existsSync(INTAKE_PATH) ? INTAKE_PATH : null,
    },
    job: batchPlan.job || {
      jobId: intake.jobId || null,
      service: intake.service || null,
      mode: intake.mode || null,
      targetMonth: intake.targetMonth || null,
      targetYear: intake.targetYear || null,
    },
    batchSummaryStatus: batchSummary?.status || null,
    counts,
    workerPlan,
    status,
    nextSafeStep:
      counts.needsSiagaPdfWorkerCount > 0
        ? "Buat SIAGA missing-PDF preview worker untuk akun prioritas. Tetap preview/download-only, no-save/no-submit tanpa konfirmasi."
        : "Tidak ada akun missing PDF. Lanjut batch delivery atau real-send provider jika siap.",
  };

  const text = buildText(report);
  writeOutput(report, text);

  console.log(`REPORT=${OUT_REPORT_PATH}`);
  console.log(`TEXT=${OUT_TEXT_PATH}`);
  console.log(`TOTAL_ACCOUNTS=${counts.totalAccounts}`);
  console.log(`NEEDS_SIAGA_PDF_WORKER_COUNT=${counts.needsSiagaPdfWorkerCount}`);
  console.log(`DELIVERY_READY_COUNT=${counts.deliveryReadyCount}`);
  console.log(`NEEDS_CHECK_COUNT=${counts.needsCheckCount}`);
  console.log(`STATUS=${status}`);
}

main().catch((error) => {
  console.error("SMARTWORK_MISSING_PDF_WORKER_PLANNER_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
