import fs from "fs";
import path from "path";

const ROOT = process.cwd();

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").trim());
  } catch {
    return fallback;
  }
}

function rel(file) {
  if (!file) return null;
  return path.relative(ROOT, file).replaceAll("\\", "/");
}

function existsMaybe(file) {
  if (!file) return false;
  return fs.existsSync(path.isAbsolute(file) ? file : path.join(ROOT, file));
}

const finalProgress = readJson(path.join(ROOT, "reports", "smartwork-final-progress-report.json"), {});
const pdfReport = readJson(path.join(ROOT, "reports", "siaga-job-download-presensi-pdf-report.json"), {});
const proofReport = readJson(path.join(ROOT, "reports", "proof", "smartwork-siaga-proof-report.json"), {});
const syncReport = readJson(path.join(ROOT, "reports", "smartwork-sync-latest-request-report.json"), {});

const selected = syncReport?.selectedRequest?.normalized || {};
const activeRange =
  selected.startDate && selected.endDate
    ? `${selected.startDate}..${selected.endDate}`
    : null;

const finalRange =
  finalProgress?.requestRange ||
  finalProgress?.sourceReports?.requestRange ||
  null;

const verifyComplete =
  finalProgress?.requestedDatesResult?.complete === true ||
  finalProgress?.sourceReports?.allRequestedDatesDone === true;

const artifactMatchesActiveRequest =
  Boolean(activeRange && finalRange && activeRange === finalRange && verifyComplete);

const rawPdfFile =
  finalProgress?.artifacts?.pdfFile ||
  finalProgress?.sourceReports?.pdfFile ||
  pdfReport?.pdfFile ||
  pdfReport?.downloadedFile ||
  null;

const rawProofFile =
  finalProgress?.artifacts?.proofReport ||
  finalProgress?.sourceReports?.proofReport ||
  "reports/proof/smartwork-siaga-proof-report.json";

const pdfReady = Boolean(artifactMatchesActiveRequest && rawPdfFile && existsMaybe(rawPdfFile));
const proofReady = Boolean(artifactMatchesActiveRequest && rawProofFile && existsMaybe(rawProofFile));

const report = {
  ok: true,
  mode: "SMARTWORK_APP_ARTIFACTS_ONLY",
  generatedAt: new Date().toISOString(),
  deliveryPolicy: "APP_DOWNLOAD_ONLY_EMAIL_WHATSAPP_DISABLED",
  request: {
    source: selected.source || null,
    teacherId: selected.teacherId || finalProgress.teacherId || null,
    teacherName: selected.teacherName || finalProgress.teacherName || null,
    requestRange: activeRange || finalRange || null
  },
  artifactGuard: {
    activeRange,
    finalRange,
    verifyComplete,
    artifactMatchesActiveRequest,
    staleArtifactBlocked: Boolean(activeRange && finalRange && activeRange !== finalRange)
  },
  artifacts: {
    pdfReady,
    pdfFile: pdfReady ? rel(path.isAbsolute(rawPdfFile) ? rawPdfFile : path.join(ROOT, rawPdfFile)) : null,
    proofReady,
    proofReport: proofReady ? rawProofFile : null,
    finalProgressReport: "reports/smartwork-final-progress-report.json"
  },
  disabled: {
    email: true,
    whatsapp: true,
    reason: "Delivery is shown in the app only."
  },
  uiText: {
    title: pdfReady && proofReady ? "Hasil Pekerjaan Siap Diunduh" : "Hasil Belum Siap",
    pdfLabel: "Unduh PDF Presensi",
    proofLabel: "Lihat Bukti Laporan",
    note: pdfReady && proofReady
      ? "Pengiriman Email dan WhatsApp dinonaktifkan. File tersedia melalui aplikasi."
      : "PDF dan bukti laporan untuk request aktif belum siap. Jangan tampilkan file lama."
  }
};

fs.writeFileSync(
  path.join(ROOT, "reports", "smartwork-app-artifacts-report.json"),
  JSON.stringify(report, null, 2) + "\n",
  "utf8"
);

console.log(JSON.stringify(report, null, 2));
