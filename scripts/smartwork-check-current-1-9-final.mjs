import fs from "fs";

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function exists(file) {
  return fs.existsSync(file);
}

const app = readJson("reports/smartwork-app-artifacts-report.json");
const finalProgress = readJson("reports/smartwork-final-progress-report.json");
const live = readJson("reports/smartwork-progress-live-state.json");

const rows = finalProgress?.rowsInsideRequest || [];
const dates_7_8_9 = rows
  .filter((r) => [7,8,9].includes(Number(r.tanggal)))
  .map((r) => ({
    tanggal: r.tanggal,
    hari: r.hari,
    masuk: r.current?.masuk,
    pulang: r.current?.pulang,
    status: r.status,
    reason: r.reason
  }));

const pdfPath =
  app?.artifacts?.pdfFile ||
  finalProgress?.artifacts?.pdfFile?.path ||
  "reports/downloads/Presensi_Nazrin_Juni_2026.pdf";

const ok =
  app?.ok === true &&
  finalProgress?.ok === true &&
  finalProgress?.verifyComplete === true &&
  Number(finalProgress?.summary?.needsPlan || 0) === 0 &&
  live?.percent === 100 &&
  live?.status === "complete" &&
  exists(pdfPath);

console.log(JSON.stringify({
  ok,
  app: {
    ok: app?.ok,
    requestRange: app?.request?.requestRange,
    uiTitle: app?.uiText?.title,
    pdfReady: app?.artifacts?.pdfReady,
    proofReady: app?.artifacts?.proofReady
  },
  finalProgress: {
    ok: finalProgress?.ok,
    requestRange: finalProgress?.request?.requestRange,
    verifyComplete: finalProgress?.verifyComplete,
    summary: finalProgress?.summary,
    savedDates: finalProgress?.savedDates
  },
  live: {
    percent: live?.percent,
    stage: live?.stage,
    status: live?.status,
    message: live?.message
  },
  dates_7_8_9,
  pdfExists: exists(pdfPath),
  pdfPath
}, null, 2));

if (!ok) process.exit(1);
