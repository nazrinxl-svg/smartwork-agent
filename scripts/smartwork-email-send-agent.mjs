import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const MODE = "SMARTWORK_EMAIL_SEND_GUARDED";
const PREVIEW_REPORT_PATH =
  process.env.PREVIEW_REPORT_PATH || "reports/smartwork-delivery-preview-report.json";
const SEND_REPORT_PATH =
  process.env.SEND_REPORT_PATH || "reports/delivery-send/smartwork-email-send-report.json";

const CONFIRM_SEND_EMAIL = process.env.CONFIRM_SEND_EMAIL || "NO";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER || "";

const rules = {
  requiresConfirmSendEmail: true,
  confirmValueRequired: "YES",
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
  ].join("\n");
}

function ensureEnv() {
  const missing = [];

  if (!SMTP_HOST) missing.push("SMTP_HOST");
  if (!SMTP_PORT) missing.push("SMTP_PORT");
  if (!SMTP_USER) missing.push("SMTP_USER");
  if (!SMTP_PASS) missing.push("SMTP_PASS");
  if (!MAIL_FROM) missing.push("MAIL_FROM");

  return missing;
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(SEND_REPORT_PATH), { recursive: true });
  fs.writeFileSync(SEND_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
}

async function main() {
  console.log(`MODE=${MODE}`);
  console.log("RULE=SEND_ONLY_IF_CONFIRM_SEND_EMAIL_YES");

  const preview = readJson(PREVIEW_REPORT_PATH);

  const emailTo = String(preview?.delivery?.email || "").trim();
  const pdfPath = preview?.pdf?.filePath;
  const pdfName = preview?.pdf?.fileName;

  const baseReport = {
    ok: false,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    rules,
    sourcePreviewReport: PREVIEW_REPORT_PATH,
    confirm: {
      CONFIRM_SEND_EMAIL,
      allowed: CONFIRM_SEND_EMAIL === "YES",
    },
    delivery: {
      emailTo,
      pdfPath,
      pdfName,
    },
    smtp: {
      hostConfigured: Boolean(SMTP_HOST),
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      userConfigured: Boolean(SMTP_USER),
      passConfigured: Boolean(SMTP_PASS),
      fromConfigured: Boolean(MAIL_FROM),
    },
    sent: false,
  };

  if (!preview?.checks?.readyForEmailDelivery) {
    baseReport.reason = "Preview report belum ready untuk email delivery.";
    writeReport(baseReport);
    console.log("STATUS=BLOCKED_PREVIEW_NOT_READY");
    process.exitCode = 1;
    return;
  }

  if (!pdfPath || !fs.existsSync(pdfPath)) {
    baseReport.reason = `PDF tidak ditemukan: ${pdfPath}`;
    writeReport(baseReport);
    console.log("STATUS=BLOCKED_PDF_NOT_FOUND");
    process.exitCode = 1;
    return;
  }

  const missing = ensureEnv();

  if (missing.length) {
    baseReport.reason = "SMTP env belum lengkap.";
    baseReport.missingEnv = missing;
    writeReport(baseReport);
    console.log(`MISSING_ENV=${missing.join(",")}`);
    console.log("STATUS=BLOCKED_SMTP_ENV_MISSING");
    process.exitCode = 1;
    return;
  }

  if (CONFIRM_SEND_EMAIL !== "YES") {
    baseReport.reason = "Konfirmasi kirim belum diberikan. Set CONFIRM_SEND_EMAIL=YES untuk mengirim.";
    writeReport(baseReport);
    console.log("SENT_EMAIL=false");
    console.log("STATUS=BLOCKED_CONFIRM_SEND_EMAIL_REQUIRED");
    return;
  }

  const teacherName = preview?.job?.teacherName || "Guru";
  const month = preview?.job?.targetMonth || "Bulan";
  const year = preview?.job?.targetYear || "Tahun";

  const subject = `Presensi SIAGA ${teacherName} - ${month} ${year}`;
  const text = buildEmailBody(preview);

  console.log("SMTP_CONNECTING=true");

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });

  console.log("SMTP_VERIFY_START=true");
  await transporter.verify();
  console.log("SMTP_VERIFY_OK=true");

  console.log("EMAIL_SEND_START=true");

  const info = await transporter.sendMail({
    from: MAIL_FROM,
    to: emailTo,
    subject,
    text,
    attachments: [
      {
        filename: pdfName,
        path: pdfPath,
      },
    ],
  });

  const successReport = {
    ...baseReport,
    ok: true,
    reason: "Email berhasil dikirim.",
    email: {
      from: MAIL_FROM,
      to: emailTo,
      subject,
      attachment: pdfName,
    },
    nodemailer: {
      messageId: info.messageId || null,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response || null,
    },
    sent: true,
    sentAt: new Date().toISOString(),
  };

  writeReport(successReport);

  console.log(`EMAIL_TO=${emailTo}`);
  console.log(`PDF_ATTACHED=true`);
  console.log(`MESSAGE_ID=${info.messageId || "-"}`);
  console.log("SENT_EMAIL=true");
  console.log("STATUS=EMAIL_SENT");
}

main().catch((error) => {
  console.error("SMARTWORK_EMAIL_SEND_ERROR");
  console.error(error?.stack || error?.message || String(error));

  try {
    writeReport({
      ok: false,
      mode: MODE,
      generatedAt: new Date().toISOString(),
      rules,
      sent: false,
      error: error?.message || String(error),
    });
  } catch {}

  process.exit(1);
});
