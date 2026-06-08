import fs from "fs";
import path from "path";
import crypto from "crypto";

const MODE = "SMARTWORK_EMAIL_DRAFT_EML_NO_SEND_WITH_PROOF";
const PREVIEW_REPORT_PATH =
  process.env.PREVIEW_REPORT_PATH || "reports/smartwork-delivery-preview-report.json";
const PROOF_REPORT_TEXT_PATH =
  process.env.PROOF_REPORT_TEXT_PATH || "reports/proof/smartwork-siaga-proof-report.txt";
const OUT_DIR = process.env.OUT_DIR || "reports/delivery-drafts";

const rules = {
  sendEmail: false,
  sendWhatsApp: false,
  save: false,
  submit: false,
  delete: false,
  attachPdf: true,
  attachProofReport: true,
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`STOP: Preview report tidak ditemukan: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function sanitizeFileName(input) {
  return String(input || "smartwork-email-draft")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function foldBase64(base64) {
  return base64.match(/.{1,76}/g)?.join("\r\n") || "";
}

function encodeHeader(value) {
  const text = String(value || "");
  if (/^[\x00-\x7F]*$/.test(text)) return text;

  return `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;
}

function buildEmailBody(report, attachments) {
  const teacherName = report?.job?.teacherName || "Guru";
  const month = report?.job?.targetMonth || "bulan target";
  const year = report?.job?.targetYear || "tahun target";

  return [
    "Assalamu'alaikum.",
    "",
    `Berikut kami kirimkan hasil pekerjaan SmartWork SIAGA atas nama ${teacherName} untuk periode ${month} ${year}.`,
    "",
    "Berkas terlampir:",
    ...attachments.map((item, index) => `${index + 1}. ${item.filename}`),
    "",
    "Terima kasih.",
  ].join("\r\n");
}

function getContentType(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt")) return "text/plain; charset=\"UTF-8\"";
  if (lower.endsWith(".json")) return "application/json; charset=\"UTF-8\"";
  return "application/octet-stream";
}

function buildAttachmentPart(boundary, attachment) {
  const buffer = fs.readFileSync(attachment.path);
  const base64 = foldBase64(buffer.toString("base64"));
  const contentType = getContentType(attachment.filename);

  return [
    `--${boundary}`,
    `Content-Type: ${contentType}; name="${attachment.filename}"`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="${attachment.filename}"`,
    "",
    base64,
    "",
  ].join("\r\n");
}

function buildEml({ from, to, subject, body, attachments }) {
  const boundary = `smartwork_${crypto.randomBytes(16).toString("hex")}`;

  const parts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 8bit`,
    "",
    body,
    "",
  ];

  for (const attachment of attachments) {
    parts.push(buildAttachmentPart(boundary, attachment));
  }

  parts.push(`--${boundary}--`, "");

  return parts.join("\r\n");
}

function buildAttachments(pdfPath, pdfName) {
  const attachments = [];

  attachments.push({
    type: "pdf",
    filename: pdfName,
    path: pdfPath,
  });

  if (fs.existsSync(PROOF_REPORT_TEXT_PATH)) {
    attachments.push({
      type: "proof-report",
      filename: path.basename(PROOF_REPORT_TEXT_PATH),
      path: PROOF_REPORT_TEXT_PATH,
    });
  }

  return attachments;
}

async function main() {
  console.log(`MODE=${MODE}`);
  console.log("RULE=NO_SEND_ATTACH_PDF_AND_PROOF_REPORT");

  const report = readJson(PREVIEW_REPORT_PATH);

  const email = String(report?.delivery?.email || "").trim();
  const pdfPath = report?.pdf?.filePath;
  const pdfName = report?.pdf?.fileName;

  if (!report?.checks?.readyForEmailDelivery) {
    throw new Error("STOP: Preview report belum ready untuk email delivery.");
  }

  if (!email) {
    throw new Error("STOP: Email tujuan kosong.");
  }

  if (!pdfPath || !fs.existsSync(pdfPath)) {
    throw new Error(`STOP: PDF tidak ditemukan: ${pdfPath}`);
  }

  const teacherName = report?.job?.teacherName || "Guru";
  const month = report?.job?.targetMonth || "Bulan";
  const year = report?.job?.targetYear || "Tahun";

  const attachments = buildAttachments(pdfPath, pdfName);

  const from = process.env.MAIL_FROM || "SmartWork Agent <no-send@smartwork.local>";
  const to = email;
  const subject = `Bukti SmartWork SIAGA ${teacherName} - ${month} ${year}`;
  const body = buildEmailBody(report, attachments);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const draftBaseName = sanitizeFileName(
    `Draft_Email_Bukti_SmartWork_SIAGA_${teacherName}_${month}_${year}.eml`
  );

  const draftPath = path.join(OUT_DIR, draftBaseName);

  const eml = buildEml({
    from,
    to,
    subject,
    body,
    attachments,
  });

  fs.writeFileSync(draftPath, eml, "utf8");

  const draftStat = fs.statSync(draftPath);

  const emailDraftReport = {
    ok: true,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    rules,
    sourcePreviewReport: PREVIEW_REPORT_PATH,
    proofReportTextPath: fs.existsSync(PROOF_REPORT_TEXT_PATH) ? PROOF_REPORT_TEXT_PATH : null,
    email: {
      from,
      to,
      subject,
      body,
    },
    attachments: attachments.map((item) => ({
      type: item.type,
      filePath: item.path,
      fileName: item.filename,
      exists: fs.existsSync(item.path),
      sizeBytes: fs.statSync(item.path).size,
    })),
    draft: {
      filePath: draftPath,
      fileName: path.basename(draftPath),
      sizeBytes: draftStat.size,
      format: "eml",
    },
    sent: false,
    nextSafeStep:
      "Draft .eml sudah dibuat dengan PDF dan laporan bukti. Lanjut real SMTP/API email sender hanya setelah konfigurasi valid dan konfirmasi kirim.",
  };

  const reportPath = path.join(OUT_DIR, "smartwork-email-draft-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(emailDraftReport, null, 2), "utf8");

  console.log(`REPORT=${reportPath}`);
  console.log(`EMAIL_TO=${to}`);
  console.log(`ATTACHMENT_COUNT=${attachments.length}`);
  console.log(`PDF_ATTACHED=${attachments.some((item) => item.type === "pdf")}`);
  console.log(`PROOF_ATTACHED=${attachments.some((item) => item.type === "proof-report")}`);
  console.log(`DRAFT_EML=${draftPath}`);
  console.log(`SENT_EMAIL=false`);
  console.log("STATUS=EMAIL_DRAFT_READY_WITH_PROOF_NO_SEND");
}

main().catch((error) => {
  console.error("SMARTWORK_EMAIL_DRAFT_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
