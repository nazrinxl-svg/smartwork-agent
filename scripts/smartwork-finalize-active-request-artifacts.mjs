import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const root = process.cwd();

function readJson(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return { ok: false, readError: String(error?.message || error), file };
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function exists(file) {
  return fs.existsSync(file);
}

function fileInfo(file) {
  if (!exists(file)) return null;
  const stat = fs.statSync(file);
  return {
    path: file.replaceAll("\\", "/"),
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString()
  };
}

function pick(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

const localReq = readJson("data/siaga-attendance-request.local.json", {});
const checkpoint = readJson("reports/smartwork-checkpoint-1-6-juni-2026.json", {});
const timePlan = readJson("reports/siaga-job-time-plan-preview-report.json", {});
const saveRange = readJson("reports/siaga-job-save-request-range-confirmed-report.json", {});
const download = readJson("reports/siaga-job-download-presensi-pdf-report.json", {});
const proof = readJson("reports/proof/smartwork-siaga-proof-report.json", {});

const verifyRun = spawnSync(process.execPath, ["scripts/smartwork-verify-request-range-complete.mjs"], {
  cwd: root,
  encoding: "utf8",
  shell: false
});

let verify = {};
try {
  verify = JSON.parse(String(verifyRun.stdout || "").trim());
} catch {
  verify = {
    ok: verifyRun.status === 0,
    stdoutTail: String(verifyRun.stdout || "").slice(-4000),
    stderrTail: String(verifyRun.stderr || "").slice(-4000)
  };
}

const teacherId = pick(localReq.teacherId, localReq?.request?.teacherId, checkpoint.teacherId, "guru-001");
const teacherName = pick(localReq.teacherName, localReq?.request?.teacherName, checkpoint.teacherName, "Nazrin");

const startDate = pick(localReq.startDate, localReq?.request?.startDate, checkpoint.requestRange?.split("..")?.[0], "2026-06-01");
const endDate = pick(localReq.endDate, localReq?.request?.endDate, checkpoint.requestRange?.split("..")?.[1], "2026-06-06");
const requestRange = `${startDate}..${endDate}`;

const pdfPath = pick(
  download?.file?.savedAs,
  checkpoint?.files?.pdf,
  "reports/downloads/Presensi_Nazrin_Juni_2026.pdf"
).replaceAll("\\", "/");

const proofPath = "reports/proof/smartwork-siaga-proof-report.json";
const proofTextPath = "reports/proof/smartwork-siaga-proof-report.txt";

const verifyComplete =
  verify?.ok === true &&
  Number(verify?.insideSummary?.total || 0) > 0 &&
  Number(verify?.insideSummary?.needsPlan || 0) === 0;

const pdfReady = exists(pdfPath) && Number(fileInfo(pdfPath)?.sizeBytes || 0) > 0;
const proofReady = exists(proofPath) && (proof?.ok === true || String(proof?.status || "").includes("READY") || exists(proofTextPath));

const finalProgress = {
  ok: verifyComplete && pdfReady && proofReady,
  mode: "SMARTWORK_FINAL_PROGRESS_REPORT",
  generatedAt: new Date().toISOString(),
  request: {
    source: "smartwork-user-request-form",
    teacherId,
    teacherName,
    requestRange,
    startDate,
    endDate
  },
  status: verifyComplete ? "complete" : "needs_check",
  verifyComplete,
  summary: {
    total: Number(verify?.insideSummary?.total || 0),
    alreadyFilled: Number(verify?.insideSummary?.alreadyFilled || 0),
    skip: Number(verify?.insideSummary?.skip || 0),
    needsPlan: Number(verify?.insideSummary?.needsPlan || 0),
    timePlanRows: Number(timePlan?.summary?.totalRows || 0),
    timePlanAlreadyFilled: Number(timePlan?.summary?.totalAlreadyFilled || 0),
    timePlanPlanned: Number(timePlan?.summary?.totalPlanned || 0),
    timePlanNeedsCheck: Number(timePlan?.summary?.totalNeedsCheck || 0)
  },
  savedDates: saveRange?.savedDates || saveRange?.targetDates || [],
  artifacts: {
    pdfReady,
    pdfFile: pdfReady ? fileInfo(pdfPath) : null,
    proofReady,
    proofReport: proofReady ? proofPath : null,
    proofText: exists(proofTextPath) ? proofTextPath : null
  },
  rowsInsideRequest: verify?.rowsInsideRequest || [],
  sourceReports: {
    verify: "scripts/smartwork-verify-request-range-complete.mjs stdout",
    timePlan: "reports/siaga-job-time-plan-preview-report.json",
    saveRange: "reports/siaga-job-save-request-range-confirmed-report.json",
    download: "reports/siaga-job-download-presensi-pdf-report.json",
    proof: proofPath
  }
};

writeJson("reports/smartwork-final-progress-report.json", finalProgress);

const artifactReport = {
  ok: finalProgress.ok,
  mode: "SMARTWORK_APP_ARTIFACTS_ONLY",
  generatedAt: new Date().toISOString(),
  deliveryPolicy: "APP_DOWNLOAD_ONLY_EMAIL_WHATSAPP_DISABLED",
  request: finalProgress.request,
  artifactGuard: {
    activeRange: requestRange,
    finalRange: requestRange,
    verifyComplete,
    artifactMatchesActiveRequest: finalProgress.ok,
    staleArtifactBlocked: false
  },
  artifacts: {
    pdfReady,
    pdfFile: pdfReady ? pdfPath : null,
    proofReady,
    proofReport: proofReady ? proofPath : null,
    finalProgressReport: "reports/smartwork-final-progress-report.json"
  },
  disabled: {
    email: true,
    whatsapp: true,
    reason: "Delivery is shown in the app only."
  },
  uiText: {
    title: finalProgress.ok ? "Hasil Siap" : "Hasil Belum Siap",
    pdfLabel: "Unduh PDF Presensi",
    proofLabel: "Lihat Bukti Laporan",
    note: finalProgress.ok
      ? "PDF dan bukti laporan sudah siap untuk request aktif."
      : "PDF dan bukti laporan untuk request aktif belum lengkap. Jangan tampilkan file lama."
  }
};

writeJson("reports/smartwork-app-artifacts-report.json", artifactReport);

console.log(JSON.stringify({
  ok: artifactReport.ok,
  requestRange,
  verifyComplete,
  pdfReady,
  pdfFile: artifactReport.artifacts.pdfFile,
  proofReady,
  proofReport: artifactReport.artifacts.proofReport,
  finalProgressReport: artifactReport.artifacts.finalProgressReport,
  uiTitle: artifactReport.uiText.title
}, null, 2));

process.exit(artifactReport.ok ? 0 : 1);
