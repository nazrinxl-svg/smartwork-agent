import fs from "fs";
import path from "path";

const MODE = "SMARTWORK_WHATSAPP_DELIVERY_PREVIEW_NO_SEND_WITH_PROOF";
const PREVIEW_REPORT_PATH =
  process.env.PREVIEW_REPORT_PATH || "reports/smartwork-delivery-preview-report.json";
const PROOF_REPORT_TEXT_PATH =
  process.env.PROOF_REPORT_TEXT_PATH || "reports/proof/smartwork-siaga-proof-report.txt";
const OUT_REPORT_PATH =
  process.env.OUT_REPORT_PATH || "reports/whatsapp-preview/smartwork-whatsapp-preview-report.json";

const rules = {
  sendEmail: false,
  sendWhatsApp: false,
  attachFileAutomatically: false,
  preparePdf: true,
  prepareProofReport: true,
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

function buildMessage(report, files) {
  const teacherName = report?.job?.teacherName || "Guru";
  const month = report?.job?.targetMonth || "bulan target";
  const year = report?.job?.targetYear || "tahun target";

  return [
    "Assalamu'alaikum.",
    "",
    `Berikut hasil pekerjaan SmartWork SIAGA atas nama ${teacherName} untuk periode ${month} ${year}.`,
    "",
    "Berkas yang disiapkan:",
    ...files.map((item, index) => `${index + 1}. ${item.fileName}`),
    "",
    "Status: pekerjaan SIAGA memiliki bukti PDF/laporan. Untuk pengiriman otomatis file melalui WhatsApp, SmartWork perlu WhatsApp Cloud API/provider resmi.",
    "",
    "Terima kasih.",
  ].join("\n");
}

function buildPreparedFiles(pdfPath, pdfName) {
  const files = [];

  files.push({
    type: "pdf",
    filePath: pdfPath || null,
    fileName: pdfName || null,
    exists: Boolean(pdfPath && fs.existsSync(pdfPath)),
  });

  files.push({
    type: "proof-report",
    filePath: PROOF_REPORT_TEXT_PATH,
    fileName: path.basename(PROOF_REPORT_TEXT_PATH),
    exists: fs.existsSync(PROOF_REPORT_TEXT_PATH),
  });

  return files;
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(OUT_REPORT_PATH), { recursive: true });
  fs.writeFileSync(OUT_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
}

async function main() {
  console.log(`MODE=${MODE}`);
  console.log("RULE=NO_AUTO_SEND_PREPARE_PDF_AND_PROOF_REPORT");

  const preview = readJson(PREVIEW_REPORT_PATH);

  const rawWhatsapp = preview?.delivery?.whatsapp || "";
  const whatsapp = normalizeWhatsApp(rawWhatsapp);
  const whatsappValid = isValidWhatsApp(whatsapp);

  const pdfPath = preview?.pdf?.filePath;
  const pdfName = preview?.pdf?.fileName;
  const pdfFound = Boolean(pdfPath && fs.existsSync(pdfPath));

  const preparedFiles = buildPreparedFiles(pdfPath, pdfName);
  const proofFound = preparedFiles.some((item) => item.type === "proof-report" && item.exists);

  const message = buildMessage(preview, preparedFiles.filter((item) => item.exists || item.fileName));
  const whatsappPreviewUrl = whatsappValid
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`
    : null;

  const report = {
    ok: Boolean(whatsappValid && pdfFound && proofFound),
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
    preparedFiles,
    checks: {
      pdfFound,
      proofReportFound: proofFound,
      whatsappValid,
    },
    message,
    sent: false,
    nextSafeStep:
      "Preview WhatsApp siap dengan PDF dan laporan bukti. Auto kirim file PDF/laporan perlu WhatsApp Cloud API/provider resmi dan konfirmasi user.",
  };

  writeReport(report);

  console.log(`REPORT=${OUT_REPORT_PATH}`);
  console.log(`WHATSAPP_VALID=${whatsappValid}`);
  console.log(`PDF_FOUND=${pdfFound}`);
  console.log(`PROOF_FOUND=${proofFound}`);
  console.log(`SENT_WHATSAPP=false`);

  if (whatsappPreviewUrl) {
    console.log(`WHATSAPP_PREVIEW_URL=${whatsappPreviewUrl}`);
  }

  if (!report.ok) {
    console.log("STATUS=WHATSAPP_PREVIEW_NEEDS_CHECK_WITH_PROOF");
    process.exitCode = 1;
    return;
  }

  console.log("STATUS=WHATSAPP_PREVIEW_READY_WITH_PROOF_NO_SEND");
}

main().catch((error) => {
  console.error("SMARTWORK_WHATSAPP_PREVIEW_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
