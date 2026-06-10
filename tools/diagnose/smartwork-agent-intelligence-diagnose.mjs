import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports");

function readText(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, "");
}

function readJson(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    return { __error: error.message, path: rel };
  }
}

function latestJsonFile(relDir) {
  const absDir = path.join(ROOT, relDir);
  if (!fs.existsSync(absDir)) return null;

  const files = fs.readdirSync(absDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const abs = path.join(absDir, name);
      const stat = fs.statSync(abs);
      return {
        name,
        rel: path.relative(ROOT, abs).replaceAll("\\", "/"),
        abs,
        mtimeMs: stat.mtimeMs,
        modifiedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return files[0] || null;
}

function has(text, value) {
  return text.includes(value);
}

fs.mkdirSync(REPORT_DIR, { recursive: true });

const server = readText("app/smartwork-control-server.mjs");
const runner = readText("scripts/smartwork-v6-auto-request-pipeline.mjs");

const latestRequestFile = latestJsonFile("intake/requests");
const latestJobFile = latestJsonFile("data/jobs");

const latestRequest = latestRequestFile ? JSON.parse(fs.readFileSync(latestRequestFile.abs, "utf8").replace(/^\uFEFF/, "")) : null;
const latestJob = latestJobFile ? JSON.parse(fs.readFileSync(latestJobFile.abs, "utf8").replace(/^\uFEFF/, "")) : null;

const reports = {
  pipelineDiagnose: readJson("reports/smartwork-request-pipeline-diagnose-report.json"),
  autoRequestPipeline: readJson("reports/smartwork-v6-auto-request-pipeline-report.json"),
  timePlan: readJson("reports/siaga-job-time-plan-preview-report.json"),
  inputPreview: readJson("reports/siaga-job-input-preview-no-save-report.json"),
  saveConfirmed: readJson("reports/siaga-job-save-confirmed-report.json"),
  pdfDownload: readJson("reports/siaga-job-download-presensi-pdf-report.json"),
  proofReport: readJson("reports/proof/smartwork-siaga-proof-report.json")
};

const intelligence = {
  serverAutopilot: {
    hasPostRequest: has(server, 'req.method === "POST" && req.url === "/api/requests"'),
    hasAutoStartFlag: has(server, "autoStart: true"),
    hasSetTimeoutStart: has(server, "setTimeout(() =>"),
    callsHandleStartJob: has(server, "handleStartJob(null"),
    spawnsRunner: has(server, 'spawn("node"') && has(server, "smartwork-v6-auto-request-pipeline.mjs"),
    confirmSaveYes: has(server, 'CONFIRM_SAVE: "YES"')
  },
  runnerSignals: {
    exists: Boolean(runner),
    readsActiveIntake: has(runner, "smartwork-job-request.sample.json") || has(runner, "ACTIVE_INTAKE"),
    mentionsStartDate: has(runner, "startDate"),
    mentionsEndDate: has(runner, "endDate"),
    mentionsTargetLimit: has(runner, "TARGET_LIMIT"),
    hasTimePlan: has(runner, "time-plan") || has(runner, "timePlan"),
    hasInputPreview: has(runner, "input-preview") || has(runner, "inputPreview"),
    hasSaveConfirmed: has(runner, "save-confirmed") || has(runner, "saveConfirmed"),
    hasDownloadPdf: has(runner, "download-presensi") || has(runner, "downloadPresensi"),
    hasProof: has(runner, "proof")
  },
  latestRequest: latestRequest ? {
    file: latestRequestFile.rel,
    jobId: latestRequest.jobId || null,
    service: latestRequest.service || null,
    targetMonth: latestRequest.targetMonth || null,
    targetYear: latestRequest.targetYear || null,
    accountStartDate: latestRequest.accounts?.[0]?.startDate || null,
    accountEndDate: latestRequest.accounts?.[0]?.endDate || null,
    accountCount: latestRequest.accounts?.length || 0
  } : null,
  latestJob: latestJob ? {
    file: latestJobFile.rel,
    jobId: latestJob.jobId || null,
    status: latestJob.status || null,
    autoStart: latestJob.autoStart || false,
    runnerMode: latestJob.runner?.mode || null,
    runnerScript: latestJob.runner?.script || null,
    error: latestJob.error || null
  } : null
};

const risks = [];
const recommendations = [];

if (!intelligence.serverAutopilot.hasPostRequest) risks.push("Server belum punya POST /api/requests.");
if (!intelligence.serverAutopilot.callsHandleStartJob) risks.push("Request belum otomatis memanggil handleStartJob.");
if (!intelligence.serverAutopilot.spawnsRunner) risks.push("Start job belum menjalankan runner pipeline.");
if (!intelligence.runnerSignals.exists) risks.push("Runner smartwork-v6-auto-request-pipeline.mjs tidak ditemukan.");
if (intelligence.runnerSignals.mentionsTargetLimit) risks.push("Runner masih menyebut TARGET_LIMIT. Pastikan tidak membatasi rentang user.");
if (!intelligence.latestRequest?.accountStartDate || !intelligence.latestRequest?.accountEndDate) risks.push("Request terbaru belum punya rentang tanggal account.");
if (intelligence.latestJob?.status === "FAILED") risks.push("Job terbaru FAILED. Baca latestJob.error dan runner report.");
if (intelligence.latestJob?.status === "PENDING") recommendations.push("Job masih PENDING. Cek apakah server aktif dan setTimeout auto-start berjalan.");
if (intelligence.latestJob?.status === "RUNNING") recommendations.push("Job sedang RUNNING. Cek report runner setelah selesai.");
if (intelligence.latestJob?.status === "COMPLETED") recommendations.push("Job COMPLETED. Lanjut cek PDF + proof report.");
if (intelligence.latestJob?.status === "RESULT_READY") recommendations.push("Job RESULT_READY. UX Progress harus menampilkan PDF + proof report.");

if (risks.length === 0) {
  recommendations.push("Autopilot dasar valid. Fokus berikutnya: buat progress UI membaca detail report runner agar user tahu tanggal mana berhasil/gagal.");
  recommendations.push("Tambahkan intelligence lock agar request baru tidak menjalankan dua runner bersamaan.");
  recommendations.push("Tambahkan stage status: QUEUED, RUNNING_TIME_PLAN, RUNNING_INPUT, RUNNING_SAVE, DOWNLOADING_PDF, PROOF_READY, RESULT_READY, FAILED.");
}

const report = {
  ok: risks.length === 0,
  mode: "SMARTWORK_AGENT_INTELLIGENCE_DIAGNOSE",
  generatedAt: new Date().toISOString(),
  goal: "Membuat SmartWork Agent lebih pintar saat coding dan saat autopilot request berjalan.",
  intelligence,
  reports,
  risks,
  recommendations,
  nextPatch: risks.length === 0
    ? "Patch progress intelligence/status detail dan runner lock."
    : "Perbaiki risks terlebih dahulu."
};

const out = path.join(REPORT_DIR, "smartwork-agent-intelligence-diagnose-report.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify({
  ok: report.ok,
  mode: report.mode,
  risks: risks.length,
  recommendations: recommendations.length,
  latestJobStatus: intelligence.latestJob?.status || null,
  nextPatch: report.nextPatch,
  reportPath: path.relative(ROOT, out).replaceAll("\\", "/")
}, null, 2));
