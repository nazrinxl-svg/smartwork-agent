import fs from "fs";
import path from "path";

function readJson(file, fallback = {}) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function rangeOf(req) {
  return req?.requestRange || [req?.startDate, req?.endDate].filter(Boolean).join("..");
}

const patch = JSON.parse(process.env.SMARTWORK_PROGRESS_PATCH || "{}");
const current = readJson("reports/smartwork-progress-live-state.json", {});
const localReq = readJson("data/siaga-attendance-request.local.json", {});
const app = readJson("reports/smartwork-app-artifacts-report.json", {});
const finalProgress = readJson("reports/smartwork-final-progress-report.json", {});

const request = {
  teacherId: localReq.teacherId || app?.request?.teacherId || finalProgress?.request?.teacherId || "guru-001",
  teacherName: localReq.teacherName || app?.request?.teacherName || finalProgress?.request?.teacherName || "Nazrin",
  startDate: localReq.startDate || app?.request?.startDate || finalProgress?.request?.startDate || "",
  endDate: localReq.endDate || app?.request?.endDate || finalProgress?.request?.endDate || "",
  requestRange:
    localReq.requestRange ||
    app?.request?.requestRange ||
    finalProgress?.request?.requestRange ||
    [localReq.startDate, localReq.endDate].filter(Boolean).join("..")
};

const localRange = rangeOf(request);
const appRange = app?.request?.requestRange;
const finalRange = finalProgress?.request?.requestRange;

const requestComplete =
  app?.ok === true &&
  finalProgress?.ok === true &&
  finalProgress?.verifyComplete === true &&
  Number(finalProgress?.summary?.needsPlan || 0) === 0 &&
  (app?.artifacts?.pdfReady === true || finalProgress?.artifacts?.pdfReady === true) &&
  (app?.artifacts?.proofReady === true || finalProgress?.artifacts?.proofReady === true) &&
  (!localRange || appRange === localRange || finalRange === localRange);

const incomingPercent = Number(patch.percent ?? current.percent ?? 0);

const forcedComplete = requestComplete || patch.status === "complete";

const percent = forcedComplete ? 100 : incomingPercent;
const status = forcedComplete ? "complete" : (patch.status || current.status || "idle");
const stage = forcedComplete ? "Hasil Siap" : (patch.stage || current.stage || "Menunggu request");
const message = forcedComplete
  ? "Request user selesai. PDF terbaru dan bukti laporan sudah cocok dengan rentang yang diminta."
  : (patch.message || current.message || "Progress akan muncul saat agent mulai bekerja.");

const next = {
  ok: true,
  mode: "SMARTWORK_PROGRESS_LIVE_STATE",
  generatedAt: current.generatedAt || new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  request,
  percent,
  stage,
  status,
  currentStep: forcedComplete ? "complete" : (patch.currentStep || current.currentStep || null),
  message,
  summary: finalProgress?.summary || current.summary || null,
  artifacts: {
    pdfReady: app?.artifacts?.pdfReady === true || finalProgress?.artifacts?.pdfReady === true,
    proofReady: app?.artifacts?.proofReady === true || finalProgress?.artifacts?.proofReady === true,
    uiTitle: forcedComplete ? "Hasil Siap" : (app?.uiText?.title || current.artifacts?.uiTitle || null)
  },
  history: [
    ...(Array.isArray(current.history) ? current.history.slice(-20) : []),
    {
      at: new Date().toISOString(),
      percent,
      stage,
      status,
      message
    }
  ]
};

writeJson("reports/smartwork-progress-live-state.json", next);

console.log(JSON.stringify({
  ok: true,
  requestComplete,
  percent: next.percent,
  stage: next.stage,
  status: next.status,
  message: next.message,
  requestRange: next.request.requestRange,
  summary: next.summary
}, null, 2));
