import fs from "fs";
import path from "path";

const MODE = "SMARTWORK_BATCH_PLANNER_V1_SAFE_NO_ACTION";

const INTAKE_PATH =
  process.env.INTAKE_PATH || "intake/smartwork-job-request.sample.json";

const VALIDATOR_REPORT_PATH =
  process.env.VALIDATOR_REPORT_PATH || "reports/intake/smartwork-intake-validator-report.json";

const OUT_REPORT_PATH =
  process.env.OUT_REPORT_PATH || "reports/batch/smartwork-batch-plan-report.json";

const rules = {
  planOnly: true,
  noLogin: true,
  noInput: true,
  noSave: true,
  noSubmit: true,
  noDelete: true,
  noEmailSend: true,
  noWhatsAppSend: true,
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

function normalizePdfPath(targetPdfName) {
  if (!targetPdfName) return null;
  return path.join("reports", "downloads", targetPdfName);
}

function buildAccountPlan(account, index, job) {
  const pdfPath = normalizePdfPath(account.targetPdfName);
  const pdfExists = Boolean(pdfPath && fs.existsSync(pdfPath));

  let status = "NEEDS_PDF_DOWNLOAD";
  const nextActions = [];

  if (pdfExists) {
    status = "DELIVERY_READY";
    nextActions.push("RUN_DELIVERY_FOR_ACCOUNT");
  } else {
    nextActions.push("RUN_SIAGA_ATTENDANCE_OR_DOWNLOAD_PDF_PREVIEW_FIRST");
  }

  return {
    index,
    workerId: `worker-${String(index + 1).padStart(3, "0")}`,
    teacherId: account.teacherId || null,
    teacherName: account.teacherName || null,
    schoolName: account.schoolName || null,
    service: job.service,
    mode: job.mode,
    targetMonth: job.targetMonth,
    targetYear: job.targetYear,
    targetPdfName: account.targetPdfName || null,
    pdfPath,
    pdfExists,
    status,
    nextActions,
    safety: {
      canAutoSave: false,
      canAutoSubmit: false,
      canAutoDelete: false,
      canAutoSendEmail: false,
      canAutoSendWhatsApp: false,
      requiresConfirmationForSaveSubmitSend: true,
    },
    exceptions: {
      skipDates: Array.isArray(account.skipDates) ? account.skipDates : [],
      leaveDates: Array.isArray(account.leaveDates) ? account.leaveDates : [],
    },
    notes: account.notes || "",
  };
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(OUT_REPORT_PATH), { recursive: true });
  fs.writeFileSync(OUT_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
}

async function main() {
  console.log(`MODE=${MODE}`);
  console.log("RULE=PLAN_ONLY_NO_LOGIN_NO_INPUT_NO_SAVE_NO_SEND");

  const intake = readJson(INTAKE_PATH);
  const validatorReport = readJsonIfExists(VALIDATOR_REPORT_PATH);

  if (validatorReport && validatorReport.ok !== true) {
    const report = {
      ok: false,
      mode: MODE,
      generatedAt: new Date().toISOString(),
      rules,
      intakePath: INTAKE_PATH,
      validatorReportPath: VALIDATOR_REPORT_PATH,
      reason: "Validator report belum OK. Jalankan/perbaiki npm run intake:validate dulu.",
      validatorStatus: validatorReport.status || null,
      status: "BATCH_PLAN_BLOCKED_BY_INVALID_INTAKE",
    };

    writeReport(report);
    console.log("STATUS=BATCH_PLAN_BLOCKED_BY_INVALID_INTAKE");
    process.exitCode = 1;
    return;
  }

  const accounts = Array.isArray(intake.accounts) ? intake.accounts : [];
  const accountPlans = accounts.map((account, index) =>
    buildAccountPlan(account, index, intake)
  );

  const counts = {
    accountCount: accountPlans.length,
    deliveryReadyCount: accountPlans.filter((item) => item.status === "DELIVERY_READY").length,
    needsPdfDownloadCount: accountPlans.filter((item) => item.status === "NEEDS_PDF_DOWNLOAD").length,
  };

  let overallStatus = "BATCH_PLAN_READY";
  if (counts.accountCount === 0) overallStatus = "BATCH_PLAN_EMPTY";
  else if (counts.needsPdfDownloadCount > 0 && counts.deliveryReadyCount > 0) {
    overallStatus = "BATCH_PLAN_PARTIAL_READY";
  } else if (counts.needsPdfDownloadCount > 0) {
    overallStatus = "BATCH_PLAN_NEEDS_PDF_DOWNLOAD";
  }

  const report = {
    ok: counts.accountCount > 0,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    rules,
    intakePath: INTAKE_PATH,
    validatorReportPath: VALIDATOR_REPORT_PATH,
    job: {
      jobId: intake.jobId || null,
      service: intake.service || null,
      mode: intake.mode || null,
      targetMonth: intake.targetMonth || null,
      targetYear: intake.targetYear || null,
    },
    delivery: {
      email: intake?.delivery?.email || null,
      whatsapp: intake?.delivery?.whatsapp || null,
    },
    counts,
    accounts: accountPlans,
    status: overallStatus,
    nextSafeStep:
      counts.needsPdfDownloadCount > 0
        ? "Buat batch worker untuk akun NEEDS_PDF_DOWNLOAD terlebih dahulu. Tetap no-save/no-submit tanpa konfirmasi."
        : "Semua akun punya PDF. Lanjut buat batch delivery runner per akun.",
  };

  writeReport(report);

  console.log(`REPORT=${OUT_REPORT_PATH}`);
  console.log(`ACCOUNT_COUNT=${counts.accountCount}`);
  console.log(`DELIVERY_READY_COUNT=${counts.deliveryReadyCount}`);
  console.log(`NEEDS_PDF_DOWNLOAD_COUNT=${counts.needsPdfDownloadCount}`);
  console.log(`STATUS=${overallStatus}`);
}

main().catch((error) => {
  console.error("SMARTWORK_BATCH_PLANNER_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
