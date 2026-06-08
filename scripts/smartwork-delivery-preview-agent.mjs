import fs from "fs";
import path from "path";

const MODE = "SMARTWORK_DELIVERY_PREVIEW_NO_SEND";
const INTAKE_PATH = process.env.INTAKE_PATH || "intake/delivery-request.sample.json";
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "reports/downloads";
const REPORT_PATH = process.env.REPORT_PATH || "reports/smartwork-delivery-preview-report.json";

const rules = {
  sendEmail: false,
  sendWhatsApp: false,
  save: false,
  submit: false,
  delete: false,
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`STOP: Intake file tidak ditemukan: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function normalizeWhatsApp(input) {
  const raw = String(input || "").trim();
  const digits = raw.replace(/[^\d]/g, "");

  if (!digits) return "";

  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;

  return digits;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function isValidWhatsApp(wa) {
  return /^62\d{8,15}$/.test(String(wa || "").trim());
}

function findPdf(downloadDir, pdfName) {
  if (!fs.existsSync(downloadDir)) {
    return {
      found: false,
      reason: `Folder download tidak ditemukan: ${downloadDir}`,
      expectedPath: path.join(downloadDir, pdfName || ""),
      filePath: null,
      fileName: null,
      sizeBytes: 0,
    };
  }

  if (pdfName) {
    const exactPath = path.join(downloadDir, pdfName);
    if (fs.existsSync(exactPath)) {
      const stat = fs.statSync(exactPath);
      return {
        found: true,
        reason: "Exact PDF name found",
        expectedPath: exactPath,
        filePath: exactPath,
        fileName: path.basename(exactPath),
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    }
  }

  const pdfFiles = fs
    .readdirSync(downloadDir)
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .map((name) => {
      const filePath = path.join(downloadDir, name);
      const stat = fs.statSync(filePath);
      return {
        filePath,
        fileName: name,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime,
      };
    })
    .sort((a, b) => b.modifiedAt - a.modifiedAt);

  if (!pdfFiles.length) {
    return {
      found: false,
      reason: "Tidak ada file PDF di folder download",
      expectedPath: pdfName ? path.join(downloadDir, pdfName) : null,
      filePath: null,
      fileName: null,
      sizeBytes: 0,
    };
  }

  const latest = pdfFiles[0];

  return {
    found: true,
    reason: "Exact PDF tidak ditemukan, memakai PDF terbaru sebagai fallback preview",
    expectedPath: pdfName ? path.join(downloadDir, pdfName) : null,
    filePath: latest.filePath,
    fileName: latest.fileName,
    sizeBytes: latest.sizeBytes,
    modifiedAt: latest.modifiedAt.toISOString(),
  };
}

function buildMessage(data, pdfInfo) {
  const teacherName = data.teacherName || data.teacherId || "Guru";
  const month = data.targetMonth || "bulan target";
  const year = data.targetYear || "tahun target";

  return [
    `Assalamu'alaikum.`,
    ``,
    `Berikut kami kirimkan file Presensi SIAGA atas nama ${teacherName} untuk periode ${month} ${year}.`,
    ``,
    `File: ${pdfInfo.fileName || data.pdfName || "-"}`,
    ``,
    `Terima kasih.`
  ].join("\n");
}

async function main() {
  console.log(`MODE=${MODE}`);
  console.log("RULE=NO_SEND_NO_SAVE_NO_SUBMIT_NO_DELETE");

  const data = readJson(INTAKE_PATH);

  const email = String(data?.delivery?.email || "").trim();
  const whatsapp = normalizeWhatsApp(data?.delivery?.whatsapp || "");

  const pdfInfo = findPdf(DOWNLOAD_DIR, data.pdfName);
  const message = buildMessage(data, pdfInfo);

  const emailOk = isValidEmail(email);
  const whatsappOk = isValidWhatsApp(whatsapp);

  const waText = encodeURIComponent(message);
  const whatsappPreviewUrl = whatsappOk ? `https://wa.me/${whatsapp}?text=${waText}` : null;

  const checks = {
    intakeFound: true,
    pdfFound: pdfInfo.found,
    emailValid: emailOk,
    whatsappValid: whatsappOk,
    readyForEmailDelivery: pdfInfo.found && emailOk,
    readyForWhatsAppDelivery: pdfInfo.found && whatsappOk,
  };

  const report = {
    ok: Boolean(checks.pdfFound && (checks.readyForEmailDelivery || checks.readyForWhatsAppDelivery)),
    mode: MODE,
    generatedAt: new Date().toISOString(),
    rules,
    intakePath: INTAKE_PATH,
    downloadDir: DOWNLOAD_DIR,
    job: {
      jobId: data.jobId || null,
      teacherId: data.teacherId || null,
      teacherName: data.teacherName || null,
      targetMonth: data.targetMonth || null,
      targetYear: data.targetYear || null,
    },
    delivery: {
      email,
      whatsapp,
      whatsappPreviewUrl,
    },
    pdf: pdfInfo,
    checks,
    previewMessage: message,
    nextSafeStep: "Jika checks ready=true, lanjut buat email delivery agent no-auto-send / draft dulu.",
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log(`REPORT=${REPORT_PATH}`);
  console.log(`PDF_FOUND=${checks.pdfFound}`);
  console.log(`EMAIL_VALID=${checks.emailValid}`);
  console.log(`WHATSAPP_VALID=${checks.whatsappValid}`);
  console.log(`READY_EMAIL=${checks.readyForEmailDelivery}`);
  console.log(`READY_WHATSAPP=${checks.readyForWhatsAppDelivery}`);
  console.log(`SENT_EMAIL=false`);
  console.log(`SENT_WHATSAPP=false`);

  if (whatsappPreviewUrl) {
    console.log(`WHATSAPP_PREVIEW_URL=${whatsappPreviewUrl}`);
  }

  if (!report.ok) {
    console.log("STATUS=NEEDS_CHECK");
    process.exitCode = 1;
    return;
  }

  console.log("STATUS=PREVIEW_READY_NO_SEND");
}

main().catch((error) => {
  console.error("SMARTWORK_DELIVERY_PREVIEW_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
