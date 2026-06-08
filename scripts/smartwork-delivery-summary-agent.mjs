import fs from "fs";
import path from "path";

const MODE = "SMARTWORK_DELIVERY_SUMMARY_AGENT";

const PATHS = {
  deliveryPreview: process.env.DELIVERY_PREVIEW_REPORT || "reports/smartwork-delivery-preview-report.json",
  emailDraft: process.env.EMAIL_DRAFT_REPORT || "reports/delivery-drafts/smartwork-email-draft-report.json",
  emailSend: process.env.EMAIL_SEND_REPORT || "reports/delivery-send/smartwork-email-send-report.json",
  whatsappPreview: process.env.WHATSAPP_PREVIEW_REPORT || "reports/whatsapp-preview/smartwork-whatsapp-preview-report.json",
};

const OUT_REPORT_PATH =
  process.env.OUT_REPORT_PATH || "reports/delivery-summary/smartwork-delivery-summary-report.json";

const OUT_TEXT_PATH =
  process.env.OUT_TEXT_PATH || "reports/delivery-summary/smartwork-delivery-summary.txt";

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      path: filePath,
      data: null,
      error: null,
    };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return {
      exists: true,
      path: filePath,
      data: JSON.parse(raw),
      error: null,
    };
  } catch (error) {
    return {
      exists: true,
      path: filePath,
      data: null,
      error: error?.message || String(error),
    };
  }
}

function existsFile(filePath) {
  return Boolean(filePath && fs.existsSync(filePath));
}

function statusLabel(ok, fallback = "NEEDS_CHECK") {
  return ok ? "OK" : fallback;
}

function buildSummary({ preview, emailDraft, emailSend, whatsappPreview }) {
  const previewData = preview.data || {};
  const emailDraftData = emailDraft.data || {};
  const emailSendData = emailSend.data || {};
  const whatsappData = whatsappPreview.data || {};

  const job = previewData.job || whatsappData.job || {};
  const pdf = previewData.pdf || whatsappData.pdf || {};
  const emailTo =
    previewData?.delivery?.email ||
    emailDraftData?.email?.to ||
    emailSendData?.delivery?.emailTo ||
    null;

  const whatsapp =
    previewData?.delivery?.whatsapp ||
    whatsappData?.delivery?.whatsapp ||
    null;

  const pdfPath = pdf.filePath || emailDraftData?.attachment?.filePath || emailSendData?.delivery?.pdfPath || null;
  const pdfName = pdf.fileName || emailDraftData?.attachment?.fileName || emailSendData?.delivery?.pdfName || null;

  const emailDraftPath = emailDraftData?.draft?.filePath || null;

  const checks = {
    deliveryPreviewReady: Boolean(preview.exists && previewData.ok),
    pdfFound: Boolean(existsFile(pdfPath)),
    emailDraftReady: Boolean(emailDraft.exists && emailDraftData.ok && existsFile(emailDraftPath)),
    emailSent: Boolean(emailSend.exists && emailSendData.sent === true),
    emailSendBlockedOrFailed: Boolean(emailSend.exists && emailSendData.sent !== true),
    whatsappPreviewReady: Boolean(whatsappPreview.exists && whatsappData.ok),
    whatsappSent: false,
  };

  let overallStatus = "READY_WITH_MANUAL_DELIVERY";
  const blockers = [];

  if (!checks.deliveryPreviewReady) blockers.push("Delivery preview belum ready.");
  if (!checks.pdfFound) blockers.push("PDF belum ditemukan.");
  if (!checks.emailDraftReady) blockers.push("Email draft belum ready.");
  if (!checks.whatsappPreviewReady) blockers.push("WhatsApp preview belum ready.");

  if (checks.emailSent) {
    overallStatus = "DELIVERY_EMAIL_SENT";
  } else if (checks.emailDraftReady && checks.whatsappPreviewReady && checks.pdfFound) {
    overallStatus = "READY_EMAIL_DRAFT_AND_WHATSAPP_PREVIEW";
  } else if (blockers.length) {
    overallStatus = "NEEDS_CHECK";
  }

  const emailSendReason =
    emailSendData?.reason ||
    emailSendData?.error ||
    (checks.emailSent ? "Email berhasil terkirim." : "Email belum terkirim.");

  const summary = {
    ok: blockers.length === 0,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    overallStatus,
    job: {
      jobId: job.jobId || null,
      teacherId: job.teacherId || null,
      teacherName: job.teacherName || null,
      targetMonth: job.targetMonth || null,
      targetYear: job.targetYear || null,
    },
    files: {
      pdf: {
        path: pdfPath,
        name: pdfName,
        found: checks.pdfFound,
      },
      emailDraft: {
        path: emailDraftPath,
        found: existsFile(emailDraftPath),
      },
    },
    delivery: {
      email: {
        to: emailTo,
        draftReady: checks.emailDraftReady,
        sent: checks.emailSent,
        status: checks.emailSent ? "SENT" : "NOT_SENT",
        reason: emailSendReason,
      },
      whatsapp: {
        to: whatsapp,
        previewReady: checks.whatsappPreviewReady,
        sent: false,
        previewUrl: whatsappData?.delivery?.whatsappPreviewUrl || previewData?.delivery?.whatsappPreviewUrl || null,
        status: checks.whatsappPreviewReady ? "PREVIEW_READY_NO_SEND" : "NOT_READY",
      },
    },
    checks,
    blockers,
    sourceReports: {
      deliveryPreview: PATHS.deliveryPreview,
      emailDraft: PATHS.emailDraft,
      emailSend: PATHS.emailSend,
      whatsappPreview: PATHS.whatsappPreview,
    },
    nextSafeStep:
      checks.emailSent
        ? "Email sudah terkirim. Lanjut validasi inbox/arsip delivery atau siapkan WhatsApp Cloud API."
        : "Email otomatis belum terkirim. Gunakan draft .eml manual atau perbaiki SMTP/App Password. WhatsApp preview siap untuk pesan manual.",
  };

  return summary;
}

function buildText(summary) {
  const lines = [];

  lines.push("SMARTWORK DELIVERY SUMMARY");
  lines.push("==========================");
  lines.push("");
  lines.push(`Status: ${summary.overallStatus}`);
  lines.push(`Generated: ${summary.generatedAt}`);
  lines.push("");

  lines.push("JOB");
  lines.push(`- Teacher: ${summary.job.teacherName || "-"} (${summary.job.teacherId || "-"})`);
  lines.push(`- Period: ${summary.job.targetMonth || "-"} ${summary.job.targetYear || "-"}`);
  lines.push(`- Job ID: ${summary.job.jobId || "-"}`);
  lines.push("");

  lines.push("FILES");
  lines.push(`- PDF: ${statusLabel(summary.files.pdf.found)} | ${summary.files.pdf.path || "-"}`);
  lines.push(`- Email Draft: ${statusLabel(summary.files.emailDraft.found)} | ${summary.files.emailDraft.path || "-"}`);
  lines.push("");

  lines.push("EMAIL");
  lines.push(`- To: ${summary.delivery.email.to || "-"}`);
  lines.push(`- Draft Ready: ${summary.delivery.email.draftReady}`);
  lines.push(`- Sent: ${summary.delivery.email.sent}`);
  lines.push(`- Reason: ${summary.delivery.email.reason || "-"}`);
  lines.push("");

  lines.push("WHATSAPP");
  lines.push(`- To: ${summary.delivery.whatsapp.to || "-"}`);
  lines.push(`- Preview Ready: ${summary.delivery.whatsapp.previewReady}`);
  lines.push(`- Sent: ${summary.delivery.whatsapp.sent}`);
  lines.push(`- Preview URL: ${summary.delivery.whatsapp.previewUrl || "-"}`);
  lines.push("");

  if (summary.blockers.length) {
    lines.push("BLOCKERS");
    for (const blocker of summary.blockers) {
      lines.push(`- ${blocker}`);
    }
    lines.push("");
  }

  lines.push("NEXT SAFE STEP");
  lines.push(`- ${summary.nextSafeStep}`);
  lines.push("");

  return lines.join("\n");
}

async function main() {
  console.log(`MODE=${MODE}`);

  const reports = {
    preview: readJsonIfExists(PATHS.deliveryPreview),
    emailDraft: readJsonIfExists(PATHS.emailDraft),
    emailSend: readJsonIfExists(PATHS.emailSend),
    whatsappPreview: readJsonIfExists(PATHS.whatsappPreview),
  };

  const summary = buildSummary(reports);
  const text = buildText(summary);

  fs.mkdirSync(path.dirname(OUT_REPORT_PATH), { recursive: true });
  fs.writeFileSync(OUT_REPORT_PATH, JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(OUT_TEXT_PATH, text, "utf8");

  console.log(`REPORT=${OUT_REPORT_PATH}`);
  console.log(`TEXT=${OUT_TEXT_PATH}`);
  console.log(`OVERALL_STATUS=${summary.overallStatus}`);
  console.log(`PDF_FOUND=${summary.files.pdf.found}`);
  console.log(`EMAIL_DRAFT_READY=${summary.delivery.email.draftReady}`);
  console.log(`EMAIL_SENT=${summary.delivery.email.sent}`);
  console.log(`WHATSAPP_PREVIEW_READY=${summary.delivery.whatsapp.previewReady}`);
  console.log("STATUS=DELIVERY_SUMMARY_READY");
}

main().catch((error) => {
  console.error("SMARTWORK_DELIVERY_SUMMARY_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
