import fs from "fs";
import path from "path";

const MODE = "SMARTWORK_SIAGA_PROOF_REPORT_AGENT_V1";

const DELIVERY_REQUEST_PATH =
  process.env.DELIVERY_REQUEST_PATH || "intake/delivery-request.sample.json";

const DELIVERY_SUMMARY_PATH =
  process.env.DELIVERY_SUMMARY_PATH || "reports/delivery-summary/smartwork-delivery-summary-report.json";

const OUT_REPORT_PATH =
  process.env.OUT_REPORT_PATH || "reports/proof/smartwork-siaga-proof-report.json";

const OUT_TEXT_PATH =
  process.env.OUT_TEXT_PATH || "reports/proof/smartwork-siaga-proof-report.txt";

const rules = {
  reportOnly: true,
  noLogin: true,
  noInput: true,
  noSave: true,
  noSubmit: true,
  noDelete: true,
  noEmailSend: true,
  noWhatsAppSend: true,
};

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

function resolvePdfPath(request, summary) {
  const fromSummary = summary?.files?.pdf?.path;
  if (fromSummary && fs.existsSync(fromSummary)) return fromSummary;

  const pdfName = request?.pdfName || summary?.files?.pdf?.name;
  if (!pdfName) return null;

  const expectedPath = path.join("reports", "downloads", pdfName);
  return expectedPath;
}

function buildText(report) {
  const lines = [];

  lines.push("LAPORAN SMARTWORK SIAGA");
  lines.push("=======================");
  lines.push("");
  lines.push(`Status Pekerjaan: ${report.statusText}`);
  lines.push(`Tanggal Laporan: ${report.generatedAt}`);
  lines.push("");

  lines.push("IDENTITAS");
  lines.push(`- Nama: ${safe(report.teacher.teacherName)}`);
  lines.push(`- ID Guru: ${safe(report.teacher.teacherId)}`);
  lines.push(`- Periode: ${safe(report.period.month)} ${safe(report.period.year)}`);
  lines.push("");

  lines.push("HASIL KERJA");
  lines.push(`- Absensi SIAGA: ${report.work.attendanceStatus}`);
  lines.push(`- PDF Presensi: ${report.files.pdfFound ? "Tersedia" : "Belum ditemukan"}`);
  lines.push(`- Nama File: ${safe(report.files.pdfName)}`);
  lines.push(`- Lokasi File: ${safe(report.files.pdfPath)}`);
  lines.push("");

  lines.push("BUKTI & PENGIRIMAN");
  lines.push(`- Email/WhatsApp: Dinonaktifkan`);
  lines.push(`- Mode Delivery: Aplikasi / Download`);
  lines.push(`- File: PDF dan bukti laporan tersedia di aplikasi`);
  lines.push(`- Tujuan Email: ${safe(report.delivery.emailTo)}`);
  lines.push(`- Tujuan WhatsApp: ${safe(report.delivery.whatsappTo)}`);
  lines.push("");

  lines.push("CATATAN");
  lines.push(`- ${report.note}`);
  lines.push("");

  lines.push("KESIMPULAN");
  lines.push(`- ${report.conclusion}`);
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
  console.log("RULE=REPORT_ONLY_NO_ACTION");

  const request = readJsonIfExists(DELIVERY_REQUEST_PATH);
  const summary = readJsonIfExists(DELIVERY_SUMMARY_PATH);

  if (!request && !summary) {
    throw new Error("STOP: Tidak ada delivery request atau delivery summary untuk dibuat laporan.");
  }

  const teacherName =
    request?.teacherName ||
    summary?.job?.teacherName ||
    null;

  const teacherId =
    request?.teacherId ||
    summary?.job?.teacherId ||
    null;

  const targetMonth =
    request?.targetMonth ||
    summary?.job?.targetMonth ||
    null;

  const targetYear =
    request?.targetYear ||
    summary?.job?.targetYear ||
    null;

  const pdfPath = resolvePdfPath(request, summary);
  const pdfFound = Boolean(pdfPath && fs.existsSync(pdfPath));
  const pdfName =
    request?.pdfName ||
    summary?.files?.pdf?.name ||
    (pdfPath ? path.basename(pdfPath) : null);

  const emailDraftReady = false;
  const emailSent = false;
  const whatsappPreviewReady = false;

  const emailTo =
    request?.delivery?.email ||
    summary?.delivery?.email?.to ||
    null;

  const whatsappTo =
    request?.delivery?.whatsapp ||
    summary?.delivery?.whatsapp?.to ||
    null;

  const attendanceStatus = pdfFound ? "Selesai / bukti PDF tersedia" : "Belum lengkap / PDF belum ditemukan";

  const ok = Boolean(pdfFound);

  const note = "Email dan WhatsApp dinonaktifkan. PDF presensi dan bukti laporan tersedia melalui aplikasi.";

  const conclusion = ok
    ? "Pekerjaan SIAGA sudah memiliki bukti hasil. PDF presensi dan bukti laporan tersedia melalui aplikasi."
    : "Pekerjaan belum memiliki bukti lengkap. Perlu cek PDF atau delivery preview.";

  const report = {
    ok,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    rules,
    status: ok ? "SIAGA_PROOF_READY" : "SIAGA_PROOF_NEEDS_CHECK",
    statusText: ok ? "Selesai dengan bukti tersedia" : "Perlu pengecekan",
    teacher: {
      teacherId,
      teacherName,
    },
    period: {
      month: targetMonth,
      year: targetYear,
    },
    work: {
      attendanceStatus,
    },
    files: {
      pdfFound,
      pdfName,
      pdfPath,
    },
    delivery: {
      mode: "APP_DOWNLOAD_ONLY",
      emailDisabled: true,
      whatsappDisabled: true,
      emailTo,
      whatsappTo,
      emailDraftReady,
      emailSent,
      whatsappPreviewReady,
    },
    sourceReports: {
      deliveryRequest: fs.existsSync(DELIVERY_REQUEST_PATH) ? DELIVERY_REQUEST_PATH : null,
      deliverySummary: fs.existsSync(DELIVERY_SUMMARY_PATH) ? DELIVERY_SUMMARY_PATH : null,
    },
    note,
    conclusion,
    nextSafeStep: ok
      ? "Unduh PDF presensi dan lihat bukti laporan melalui aplikasi."
      : "Periksa ulang PDF dan jalankan delivery:run sebelum membuat laporan final.",
  };

  const text = buildText(report);
  writeOutput(report, text);

  console.log(`REPORT=${OUT_REPORT_PATH}`);
  console.log(`TEXT=${OUT_TEXT_PATH}`);
  console.log(`PDF_FOUND=${pdfFound}`);
  console.log(`EMAIL_DRAFT_READY=${emailDraftReady}`);
  console.log(`EMAIL_SENT=${emailSent}`);
  console.log(`WHATSAPP_PREVIEW_READY=${whatsappPreviewReady}`);
  console.log(`STATUS=${report.status}`);

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_PROOF_REPORT_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});

