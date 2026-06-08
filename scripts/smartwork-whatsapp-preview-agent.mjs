import fs from "fs";
import path from "path";

const MODE = "SMARTWORK_WHATSAPP_DELIVERY_PREVIEW_NO_SEND";
const PREVIEW_REPORT_PATH =
  process.env.PREVIEW_REPORT_PATH || "reports/smartwork-delivery-preview-report.json";
const OUT_REPORT_PATH =
  process.env.OUT_REPORT_PATH || "reports/whatsapp-preview/smartwork-whatsapp-preview-report.json";

const rules = {
  sendEmail: false,
  sendWhatsApp: false,
  attachFileAutomatically: false,
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

function normalizeWhatsApp(input) {
  const raw = String(input || "").trim();
  const digits = raw.replace(/[^\d]/g, "");

  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;

  return digits;
}

function isValidWhatsApp(wa) {
  return /^62\d{8,15}$/.test(String(wa || "").trim());
}

function buildMessage(report) {
  const teacherName = report?.job?.teacherName || "Guru";
  const month = report?.job?.targetMonth || "bulan target";
  const year = report?.job?.targetYear || "tahun target";
  const fileName = report?.pdf?.fileName || "file presensi SIAGA.pdf";

  return [
    "Assalamu'alaikum.",
    "",
    `Berikut laporan Presensi SIAGA atas nama ${teacherName} untuk periode ${month} ${year}.`,
    "",
    `File PDF: ${fileName}`,
    "",
    "Catatan: file PDF akan dikirim/diunggah oleh SmartWork pada tahap pengiriman resmi.",
    "",
    "Terima kasih.",
  ].join("\n");
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(OUT_REPORT_PATH), { recursive: true });
  fs.writeFileSync(OUT_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
}

async function main() {
  console.log(`MODE=${MODE}`);
  console.log("RULE=NO_AUTO_SEND_NO_FILE_UPLOAD");

  const preview = readJson(PREVIEW_REPORT_PATH);

  const rawWhatsapp = preview?.delivery?.whatsapp || "";
  const whatsapp = normalizeWhatsApp(rawWhatsapp);
  const whatsappValid = isValidWhatsApp(whatsapp);

  const pdfPath = preview?.pdf?.filePath;
  const pdfName = preview?.pdf?.fileName;
  const pdfFound = Boolean(pdfPath && fs.existsSync(pdfPath));

  const message = buildMessage(preview);
  const whatsappPreviewUrl = whatsappValid
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`
    : null;

  const report = {
    ok: Boolean(whatsappValid && pdfFound),
    mode: MODE,
    generatedAt: new Date().toISOString(),
    rules,
    sourcePreviewReport: PREVIEW_REPORT_PATH,
    job: preview?.job || {},
    delivery: {
      rawWhatsapp,
      whatsapp,
      whatsappValid,
      whatsappPreviewUrl,
    },
    pdf: {
      filePath: pdfPath || null,
      fileName: pdfName || null,
      found: pdfFound,
      attachFileAutomatically: false,
    },
    message,
    sent: false,
    nextSafeStep:
      "Preview WhatsApp siap. Untuk auto kirim file PDF perlu WhatsApp Cloud API/provider resmi dan konfirmasi user.",
  };

  writeReport(report);

  console.log(`REPORT=${OUT_REPORT_PATH}`);
  console.log(`WHATSAPP_VALID=${whatsappValid}`);
  console.log(`PDF_FOUND=${pdfFound}`);
  console.log(`SENT_WHATSAPP=false`);

  if (whatsappPreviewUrl) {
    console.log(`WHATSAPP_PREVIEW_URL=${whatsappPreviewUrl}`);
  }

  if (!report.ok) {
    console.log("STATUS=WHATSAPP_PREVIEW_NEEDS_CHECK");
    process.exitCode = 1;
    return;
  }

  console.log("STATUS=WHATSAPP_PREVIEW_READY_NO_SEND");
}

main().catch((error) => {
  console.error("SMARTWORK_WHATSAPP_PREVIEW_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
