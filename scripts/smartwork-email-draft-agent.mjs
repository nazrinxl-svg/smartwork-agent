import fs from "fs";
import path from "path";
import crypto from "crypto";

const MODE = "SMARTWORK_EMAIL_DRAFT_EML_NO_SEND";
const PREVIEW_REPORT_PATH =
  process.env.PREVIEW_REPORT_PATH || "reports/smartwork-delivery-preview-report.json";
const OUT_DIR = process.env.OUT_DIR || "reports/delivery-drafts";

const rules = {
  sendEmail: false,
  sendWhatsApp: false,
  save: false,
  submit: false,
  delete: false,
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

function buildEmailBody(report) {
  const teacherName = report?.job?.teacherName || "Guru";
  const month = report?.job?.targetMonth || "bulan target";
  const year = report?.job?.targetYear || "tahun target";
  const fileName = report?.pdf?.fileName || "file presensi SIAGA.pdf";

  return [
    "Assalamu'alaikum.",
    "",
    `Berikut kami kirimkan file Presensi SIAGA atas nama ${teacherName} untuk periode ${month} ${year}.`,
    "",
    `File terlampir: ${fileName}`,
    "",
    "Terima kasih.",
  ].join("\r\n");
}

function buildEml({ from, to, subject, body, attachmentPath, attachmentName }) {
  const boundary = `smartwork_${crypto.randomBytes(16).toString("hex")}`;
  const attachmentBuffer = fs.readFileSync(attachmentPath);
  const attachmentBase64 = foldBase64(attachmentBuffer.toString("base64"));

  return [
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
    `--${boundary}`,
    `Content-Type: application/pdf; name="${attachmentName}"`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="${attachmentName}"`,
    "",
    attachmentBase64,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function main() {
  console.log(`MODE=${MODE}`);
  console.log("RULE=NO_SEND_NO_SAVE_NO_SUBMIT_NO_DELETE");

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

  const from = process.env.MAIL_FROM || "SmartWork Agent <no-send@smartwork.local>";
  const to = email;
  const subject = `Presensi SIAGA ${teacherName} - ${month} ${year}`;
  const body = buildEmailBody(report);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const draftBaseName = sanitizeFileName(
    `Draft_Email_Presensi_${teacherName}_${month}_${year}.eml`
  );

  const draftPath = path.join(OUT_DIR, draftBaseName);

  const eml = buildEml({
    from,
    to,
    subject,
    body,
    attachmentPath: pdfPath,
    attachmentName: pdfName,
  });

  fs.writeFileSync(draftPath, eml, "utf8");

  const draftStat = fs.statSync(draftPath);
  const pdfStat = fs.statSync(pdfPath);

  const emailDraftReport = {
    ok: true,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    rules,
    sourcePreviewReport: PREVIEW_REPORT_PATH,
    email: {
      from,
      to,
      subject,
      body,
    },
    attachment: {
      filePath: pdfPath,
      fileName: pdfName,
      sizeBytes: pdfStat.size,
    },
    draft: {
      filePath: draftPath,
      fileName: path.basename(draftPath),
      sizeBytes: draftStat.size,
      format: "eml",
    },
    sent: false,
    nextSafeStep:
      "Draft .eml sudah dibuat. Lanjut SMTP/API email sender hanya setelah konfigurasi .env.local dan konfirmasi kirim.",
  };

  const reportPath = path.join(OUT_DIR, "smartwork-email-draft-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(emailDraftReport, null, 2), "utf8");

  console.log(`REPORT=${reportPath}`);
  console.log(`EMAIL_TO=${to}`);
  console.log(`PDF_ATTACHED=true`);
  console.log(`DRAFT_EML=${draftPath}`);
  console.log(`SENT_EMAIL=false`);
  console.log("STATUS=EMAIL_DRAFT_READY_NO_SEND");
}

main().catch((error) => {
  console.error("SMARTWORK_EMAIL_DRAFT_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
