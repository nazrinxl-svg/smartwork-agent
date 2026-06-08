import fs from "fs";
import path from "path";

const MODE = "SMARTWORK_BATCH_FINAL_SUMMARY_V1";

const BATCH_PLAN_PATH =
  process.env.BATCH_PLAN_PATH || "reports/batch/smartwork-batch-plan-report.json";

const BATCH_DELIVERY_PATH =
  process.env.BATCH_DELIVERY_PATH || "reports/batch-delivery/smartwork-batch-delivery-runner-report.json";

const OUT_REPORT_PATH =
  process.env.OUT_REPORT_PATH || "reports/batch-summary/smartwork-batch-summary-report.json";

const OUT_TEXT_PATH =
  process.env.OUT_TEXT_PATH || "reports/batch-summary/smartwork-batch-summary.txt";

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`STOP: File tidak ditemukan: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function safe(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return value;
}

function writeOutput(report, text) {
  fs.mkdirSync(path.dirname(OUT_REPORT_PATH), { recursive: true });
  fs.writeFileSync(OUT_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(OUT_TEXT_PATH, text, "utf8");
}

function buildAccountRows(batchPlan, batchDelivery) {
  const planAccounts = Array.isArray(batchPlan.accounts) ? batchPlan.accounts : [];
  const processed = Array.isArray(batchDelivery.processed) ? batchDelivery.processed : [];
  const skipped = Array.isArray(batchDelivery.skipped) ? batchDelivery.skipped : [];

  return planAccounts.map((account) => {
    const processedHit = processed.find((item) => item.teacherId === account.teacherId);
    const skippedHit = skipped.find((item) => item.teacherId === account.teacherId);

    let finalStatus = "UNKNOWN";
    let note = "";

    if (processedHit) {
      finalStatus = processedHit.ok ? "DELIVERY_READY_NO_AUTO_SEND" : "DELIVERY_NEEDS_CHECK";
      note = processedHit.status || "";
    } else if (skippedHit) {
      finalStatus = "SKIPPED_NEEDS_PDF";
      note = skippedHit.reason || "Skipped safely.";
    } else if (account.status === "NEEDS_PDF_DOWNLOAD") {
      finalStatus = "NEEDS_PDF_DOWNLOAD";
      note = "PDF belum tersedia.";
    }

    return {
      workerId: account.workerId || null,
      teacherId: account.teacherId || null,
      teacherName: account.teacherName || null,
      schoolName: account.schoolName || null,
      targetPdfName: account.targetPdfName || null,
      pdfExists: Boolean(account.pdfExists),
      planStatus: account.status || null,
      finalStatus,
      processed: Boolean(processedHit),
      skipped: Boolean(skippedHit),
      note,
    };
  });
}

function buildText(report) {
  const lines = [];

  lines.push("SMARTWORK BATCH FINAL SUMMARY");
  lines.push("=============================");
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
  lines.push(`- Delivery ready: ${report.counts.deliveryReadyCount}`);
  lines.push(`- Needs PDF download: ${report.counts.needsPdfDownloadCount}`);
  lines.push(`- Processed delivery: ${report.counts.processedCount}`);
  lines.push(`- Skipped safely: ${report.counts.skippedCount}`);
  lines.push(`- Failed delivery: ${report.counts.failedCount}`);
  lines.push("");

  lines.push("DELIVERY CHANNELS");
  lines.push(`- Email real sent: ${report.delivery.emailSentCount}`);
  lines.push(`- Email draft ready/processable: ${report.delivery.emailDraftReadyCount}`);
  lines.push(`- WhatsApp preview ready/processable: ${report.delivery.whatsappPreviewReadyCount}`);
  lines.push("");

  lines.push("ACCOUNTS");
  for (const account of report.accounts) {
    lines.push(
      `- ${safe(account.teacherId)} | ${safe(account.teacherName)} | ${safe(account.schoolName)} | ${account.finalStatus}`
    );
    lines.push(`  PDF: ${account.pdfExists ? "OK" : "MISSING"} | ${safe(account.targetPdfName)}`);
    if (account.note) lines.push(`  Note: ${account.note}`);
  }
  lines.push("");

  lines.push("NEXT SAFE STEP");
  lines.push(`- ${report.nextSafeStep}`);
  lines.push("");

  return lines.join("\n");
}

async function main() {
  console.log(`MODE=${MODE}`);
  console.log("RULE=SUMMARY_ONLY_NO_LOGIN_NO_INPUT_NO_SAVE_NO_SEND");

  const batchPlan = readJson(BATCH_PLAN_PATH);
  const batchDelivery = readJson(BATCH_DELIVERY_PATH);

  const accounts = buildAccountRows(batchPlan, batchDelivery);

  const counts = {
    totalAccounts: accounts.length,
    deliveryReadyCount: accounts.filter((item) => item.planStatus === "DELIVERY_READY").length,
    needsPdfDownloadCount: accounts.filter((item) => item.planStatus === "NEEDS_PDF_DOWNLOAD").length,
    processedCount: accounts.filter((item) => item.processed).length,
    skippedCount: accounts.filter((item) => item.skipped).length,
    failedCount: accounts.filter((item) => item.finalStatus === "DELIVERY_NEEDS_CHECK").length,
  };

  const delivery = {
    emailSentCount: 0,
    emailDraftReadyCount: counts.processedCount,
    whatsappPreviewReadyCount: counts.processedCount,
  };

  let status = "BATCH_SUMMARY_READY";
  if (counts.failedCount > 0) status = "BATCH_SUMMARY_NEEDS_CHECK";
  else if (counts.needsPdfDownloadCount > 0) status = "BATCH_SUMMARY_PARTIAL_READY";

  const report = {
    ok: counts.failedCount === 0,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    sourceReports: {
      batchPlan: BATCH_PLAN_PATH,
      batchDelivery: BATCH_DELIVERY_PATH,
    },
    job: batchPlan.job || {},
    deliveryTarget: batchPlan.delivery || {},
    counts,
    delivery,
    accounts,
    status,
    nextSafeStep:
      counts.needsPdfDownloadCount > 0
        ? "Akun yang belum punya PDF perlu diproses SIAGA/download PDF dulu. Akun PDF-ready sudah punya delivery draft/preview."
        : "Semua akun sudah siap delivery no-auto-send. Real-send tetap perlu SMTP/WhatsApp provider valid dan konfirmasi.",
  };

  const text = buildText(report);
  writeOutput(report, text);

  console.log(`REPORT=${OUT_REPORT_PATH}`);
  console.log(`TEXT=${OUT_TEXT_PATH}`);
  console.log(`TOTAL_ACCOUNTS=${counts.totalAccounts}`);
  console.log(`PROCESSED_COUNT=${counts.processedCount}`);
  console.log(`SKIPPED_COUNT=${counts.skippedCount}`);
  console.log(`NEEDS_PDF_DOWNLOAD_COUNT=${counts.needsPdfDownloadCount}`);
  console.log(`STATUS=${status}`);
}

main().catch((error) => {
  console.error("SMARTWORK_BATCH_FINAL_SUMMARY_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
