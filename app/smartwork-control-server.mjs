import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import http from "http";
import { fileURLToPath } from "url";


import { handleSmartWorkProductionQueueApiNative } from "./smartwork-production-queue-api.mjs";

import * as smartworkJobProgressFs from "node:fs";
import * as smartworkJobProgressPath from "node:path";
// SMARTWORK_JOB_PROGRESS_ENDPOINTS_V2 imports

/* SMARTWORK_REDACT_STATUS_PAYLOAD_V1 */
function __swRedactStatusPayloadV1(value) {
  if (Array.isArray(value)) return value.map(__swRedactStatusPayloadV1);
  if (!value || typeof value !== "object") return value;

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const key = String(k).toLowerCase();

    if (["password", "username", "credential", "credentials", "token", "apikey", "api_key", "secret"].includes(key)) {
      out[k] = "[REDACTED]";
      continue;
    }

    if (typeof v === "string" && /(141048|336549|nazrinxl@gmail\.com)/i.test(v)) {
      out[k] = "[REDACTED]";
      continue;
    }

    out[k] = __swRedactStatusPayloadV1(v);
  }

  return out;
}
/* END_SMARTWORK_REDACT_STATUS_PAYLOAD_V1 */



/* SMARTWORK_E2E_NATIVE_HTTP_HELPERS_V1 */
globalThis.__smartworkE2eNativeState = globalThis.__smartworkE2eNativeState || {
  running: false,
  startedAt: null,
  endedAt: null,
  exitCode: null,
  lastError: null,
  lastRunId: null,
  mode: null
};

function __swNativeSendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function __swNativeReadJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function __swNativeAppendLog(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, text, "utf8");
}

function __swNativeProgressPayload() {
  return __swRedactStatusPayloadV1({
    ok: true,
    routeVersion: "SMARTWORK_E2E_NATIVE_HTTP_ROUTES_V1",
    state: globalThis.__smartworkE2eNativeState,
    finalProgress: __swNativeReadJsonSafe(path.join(process.cwd(), "reports", "smartwork-final-progress-report.json"), null),
    runnerReport: __swNativeReadJsonSafe(path.join(process.cwd(), "reports", "smartwork-siaga-e2e-runner-report.json"), null),
    syncReport: __swNativeReadJsonSafe(path.join(process.cwd(), "reports", "smartwork-sync-latest-request-report.json"), null)
  });
}

async function __swNativeStartRunner(modeOrRes = "DRY_RUN_NO_SAVE", dryRun = false) {
  const hasHttpResponse = modeOrRes && typeof modeOrRes.writeHead === "function" && typeof modeOrRes.end === "function";
  const res = hasHttpResponse ? modeOrRes : null;

  let mode = "DRY_RUN_NO_SAVE";
  if (hasHttpResponse) {
    mode = dryRun ? "DRY_RUN_NO_SAVE" : "REAL_SAVE_GUARDED";
  } else if (typeof modeOrRes === "string") {
    mode = modeOrRes;
  } else if (modeOrRes === true) {
    mode = "DRY_RUN_NO_SAVE";
  } else if (modeOrRes === false) {
    mode = "REAL_SAVE_GUARDED";
  }

  const sendOrReturn = (statusCode, payload) => {
    if (res) {
      return __swNativeSendJson(res, statusCode, payload);
    }
    return {
      statusCode,
      ...payload
    };
  };

  const startedAt = new Date().toISOString();
  const runId = `smartwork-e2e-${startedAt.replace(/[:.]/g, "-")}`;
const state = globalThis.__smartworkE2eNativeState = globalThis.__smartworkE2eNativeState || {
    running: false,
    startedAt: null,
    endedAt: null,
    exitCode: null,
    lastError: null,
    lastRunId: null,
    mode: null
  };

  if (state.running) {
    return sendOrReturn(409, {
      ok: false,
      statusCode: 409,
      error: "Runner masih berjalan",
      state: {
        running: true,
        startedAt: state.startedAt,
        endedAt: state.endedAt,
        exitCode: state.exitCode,
        lastError: state.lastError,
        lastRunId: state.lastRunId,
        mode: state.mode
      }
    });
  }

  const ROOT = process.cwd();
  const reportsDir = path.join(ROOT, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const logPath = path.join(reportsDir, "smartwork-siaga-e2e-server-run.log");
  const runnerPath = path.join(ROOT, "scripts", "smartwork-siaga-e2e-runner.mjs");

  const append = (line = "") => {
    try {
      fs.appendFileSync(logPath, line + "\n", "utf8");
    } catch {}
  };

  if (!fs.existsSync(runnerPath)) {
    state.running = false;
    state.startedAt = startedAt;
    state.endedAt = new Date().toISOString();
    state.exitCode = -1;
    state.lastError = `Runner script not found: ${runnerPath}`;
    state.lastRunId = runId;
    state.mode = mode;

    return sendOrReturn(500, {
      ok: false,
      statusCode: 500,
      error: state.lastError,
      runId,
      mode
    });
  }

  state.running = true;
  state.startedAt = startedAt;
  state.endedAt = null;
  state.exitCode = null;
  state.lastError = null;
  state.lastRunId = runId;
  state.mode = mode;

  append("");
  append(`[${startedAt}] START runId=${runId} mode=${mode}`);
  append(`[${startedAt}] COMMAND "${process.execPath}" "${runnerPath}"`);

  let settled = false;
  let watchdog = null;

  const finish = (patch = {}) => {
    if (settled) return;
    settled = true;

    if (watchdog) {
      clearTimeout(watchdog);
      watchdog = null;
    }

    state.running = false;
    state.endedAt = new Date().toISOString();
    state.exitCode = Object.prototype.hasOwnProperty.call(patch, "exitCode") ? patch.exitCode : state.exitCode;
    state.lastError = patch.lastError || null;
    state.lastRunId = runId;
    state.mode = mode;

    append(`[${state.endedAt}] END runId=${runId} mode=${mode} exitCode=${state.exitCode} error=${state.lastError || ""}`);
  };

  let child;
  try {
    child = spawn(process.execPath, [runnerPath], {
      cwd: ROOT,
      env: {
        ...process.env,
        SMARTWORK_E2E_MODE: mode
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false
    });
  } catch (err) {
    finish({
      exitCode: -1,
      lastError: err?.message || String(err)
    });

    return {
      ok: false,
      statusCode: 500,
      error: state.lastError,
      runId,
      mode,
      logPath
    };
  }

  append(`[${new Date().toISOString()}] CHILD pid=${child.pid || ""}`);

  child.stdout.on("data", (chunk) => {
    try {
      fs.appendFileSync(logPath, chunk, "utf8");
    } catch {}
  });

  child.stderr.on("data", (chunk) => {
    try {
      fs.appendFileSync(logPath, chunk, "utf8");
    } catch {}
  });

  child.on("error", (err) => {
    finish({
      exitCode: -1,
      lastError: err?.message || String(err)
    });
  });

  child.on("close", (code, signal) => {
    finish({
      exitCode: typeof code === "number" ? code : null,
      lastError: code === 0 ? null : `child closed with code=${code} signal=${signal || ""}`.trim()
    });
  });

  const timeoutMs = Number(process.env.SMARTWORK_E2E_SERVER_WATCHDOG_MS || 120000);
  watchdog = setTimeout(() => {
    append(`[${new Date().toISOString()}] WATCHDOG_TIMEOUT runId=${runId} timeoutMs=${timeoutMs}`);

    try {
      if (child && !child.killed) child.kill("SIGTERM");
    } catch (err) {
      append(`[${new Date().toISOString()}] WATCHDOG_KILL_ERROR ${err?.message || String(err)}`);
    }

    finish({
      exitCode: -2,
      lastError: "watchdog timeout: child process did not close"
    });
  }, timeoutMs);

  return sendOrReturn(202, {
    ok: true,
    statusCode: 202,
    message: "Runner started",
    runId,
    mode,
    pid: child.pid || null,
    logPath
    });

}
/* END_SMARTWORK_E2E_NATIVE_HTTP_HELPERS_V1 */


const __filename = fileURLToPath(import.meta.url);

/**
 * SMARTWORK_REPORTS_STATIC_ROUTE_PATCH_V1
 * Native Node static file serving for generated SmartWork reports.
 * Do not use Express app.get here because this server is not Express.
 */
const REPORTS_ROOT = path.join(process.cwd(), "reports");

function smartworkSafeJoinReports(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0]);
  const relativePath = decodedPath.replace(/^\/reports\//, "");
  const fullPath = path.normalize(path.join(REPORTS_ROOT, relativePath));

  if (!fullPath.startsWith(REPORTS_ROOT)) {
    return null;
  }

  return fullPath;
}

function smartworkContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") return "application/pdf";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  if (ext === ".html") return "text/html; charset=utf-8";

  return "application/octet-stream";
}

function tryServeSmartworkReports(req, res) {
  if (!req.url || !req.url.startsWith("/reports/")) return false;

  const filePath = smartworkSafeJoinReports(req.url);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: false,
      error: "REPORT_FILE_NOT_FOUND",
      url: req.url
    }));
    return true;
  }

  res.writeHead(200, {
    "Content-Type": smartworkContentType(filePath),
    "Cache-Control": "no-store",
    "X-SmartWork-Static": "reports"
  });

  fs.createReadStream(filePath).pipe(res);
  return true;
}

const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const PORT = Number(process.env.PORT || 3107);

const PUBLIC_DIR = path.join(ROOT, "public");
const REQUEST_DIR = path.join(ROOT, "intake", "requests");
const ACTIVE_INTAKE_PATH = path.join(ROOT, "intake", "smartwork-job-request.sample.json");
const JOB_DIR = path.join(ROOT, "data", "jobs");


function ensureJobDir() {
  fs.mkdirSync(JOB_DIR, { recursive: true });
}

function saveJob(job) {
  ensureJobDir();

  const filePath = path.join(
    JOB_DIR,
    `${job.jobId}.json`
  );

  fs.writeFileSync(
    filePath,
    JSON.stringify(job, null, 2),
    "utf8"
  );

  return filePath;
}

function readJob(jobId) {
  const filePath = path.join(
    JOB_DIR,
    `${jobId}.json`
  );

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendText(res, status, text, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

function safeFileName(input) {
  return String(input || "smartwork-request")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 140);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 2_000_000) {
        reject(new Error("Request terlalu besar."));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function validatePayload(payload) {
  const errors = [];

  if (!payload.jobId) errors.push("jobId wajib diisi.");
  if (!payload.targetMonth) errors.push("targetMonth wajib diisi.");
  if (!payload.targetYear) errors.push("targetYear wajib diisi.");
  if (!["daily", "bulk-monthly"].includes(payload.requestType || "bulk-monthly")) {
    errors.push("requestType tidak valid. Gunakan daily atau bulk-monthly.");
  }
  if ((payload.requestType || "bulk-monthly") === "daily" && !payload.dailyTargetDate) {
    errors.push("dailyTargetDate wajib diisi untuk input harian.");
  }
  if (!payload?.delivery?.email) errors.push("delivery.email wajib diisi.");
  if (!payload?.delivery?.whatsapp) errors.push("delivery.whatsapp wajib diisi.");
  if (!Array.isArray(payload.accounts) || payload.accounts.length === 0) {
    errors.push("Minimal 1 akun guru wajib diisi.");
  }

  for (const [index, account] of (payload.accounts || []).entries()) {
    if (!account.teacherId) errors.push(`accounts[${index}].teacherId wajib diisi.`);
    if (!account.teacherName) errors.push(`accounts[${index}].teacherName wajib diisi.`);
    if (!account.schoolName) errors.push(`accounts[${index}].schoolName wajib diisi.`);
  }

  return errors;
}

function normalizeDateArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizePayload(payload) {
  return {
    jobId: payload.jobId,
    requesterName: payload.requesterName || "",
    service: "siaga",
    mode: "attendance-monthly",
    targetMonth: payload.targetMonth,
    targetYear: payload.targetYear,
    requestType: payload.requestType || "bulk-monthly",
    dailyTargetDate: payload.dailyTargetDate || "",
    schedule: {
      holidayDates: normalizeDateArray(payload?.schedule?.holidayDates),
      globalSkipDates: normalizeDateArray(payload?.schedule?.globalSkipDates),
      globalLeaveDates: normalizeDateArray(payload?.schedule?.globalLeaveDates),
      dailyReportEnabled: payload?.schedule?.dailyReportEnabled !== false,
    },
    delivery: {
      email: payload.delivery.email,
      whatsapp: payload.delivery.whatsapp,
    },
    rules: {
      skipSundays: true,
      autoSave: false,
      autoSubmit: false,
      autoDelete: false,
      sendEmailAutomatically: false,
      sendWhatsAppAutomatically: false,
    },
    accounts: (payload.accounts || []).map((account) => ({
      teacherId: account.teacherId,
      teacherName: account.teacherName,
      schoolName: account.schoolName,
      username: account.username || payload.username || "",
      password: account.password || payload.password || "",
      startDate: account.startDate || payload.startDate || "",
      endDate: account.endDate || payload.endDate || "",
      targetPdfName: account.targetPdfName || "",
      skipDates: Array.isArray(account.skipDates) ? account.skipDates : [],
      leaveDates: Array.isArray(account.leaveDates) ? account.leaveDates : [],
      notes: account.notes || "",
    })),
    notes: payload.notes || "",
    createdAt: new Date().toISOString(),
    source: "smartwork-user-request-form",
  };
}


function findLatestDownloadFile(dir, exts) {
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir)
    .filter((name) => exts.some((ext) => name.toLowerCase().endsWith(ext)))
    .map((name) => {
      const fullPath = path.join(dir, name);
      const stat = fs.statSync(fullPath);
      return {
        name,
        fullPath,
        relativePath: path.relative(ROOT, fullPath).replaceAll("\\", "/"),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

  return files[0] || null;
}

function findLatestJob() {
  const jobsDir = path.join(ROOT, "data", "jobs");
  if (!fs.existsSync(jobsDir)) return null;

  const files = fs.readdirSync(jobsDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const filePath = path.join(jobsDir, name);
      const stat = fs.statSync(filePath);
      const job = readJsonSafe(filePath);
      return { name, filePath, job, modifiedAt: stat.mtime };
    })
    .filter((item) => item.job)
    .sort((a, b) => b.modifiedAt - a.modifiedAt);

  return files[0] || null;
}
function syncLatestJobResultReady({ pdf, proofAnalyzer, proofFile }) {
  const latestJob = findLatestJob();
  if (!latestJob?.filePath || !latestJob?.job) return null;

  const job = latestJob.job;
  const proofStatus = proofAnalyzer?.proof?.status || null;
  proofFile = proofFile || proofAnalyzer?.proof?.file || null;

  const pdfReady = Boolean(pdf);
  const proofReady = Boolean(
    proofFile && (
      proofStatus === "VALID_WORK" ||
      proofFile.status === "VALID_WORK"
    )
  );

  if (job.status === "COMPLETED" && pdfReady && proofReady) {
    job.status = "RESULT_READY";
    job.resultReadyAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();
    job.result = {
      ...(job.result || {}),
      pdfReady: true,
      proofReady: true,
      emailReady: true,
      pdfName: pdf.name,
      proofName: proofFile.name
    };

    fs.writeFileSync(latestJob.filePath, JSON.stringify(job, null, 2), "utf8");
  }

  return job;
}

function handleDownloadsLatest(req, res) {
  const downloadsDir = path.join(ROOT, "reports", "downloads");
  const proofAnalyzerPath = path.join(ROOT, "reports", "proof", "smartwork-proof-analyzer-report.json");
  const siagaProofReportPath = path.join(ROOT, "reports", "proof", "smartwork-siaga-proof-report.json");
  const siagaProofTextPath = path.join(ROOT, "reports", "proof", "smartwork-siaga-proof-report.txt");

  const pdf = findLatestDownloadFile(downloadsDir, [".pdf"]);
  const proofAnalyzer = readJsonSafe(proofAnalyzerPath);
  const siagaProofReport = readJsonSafe(siagaProofReportPath);
  const siagaProofTextStat = fs.existsSync(siagaProofTextPath) ? fs.statSync(siagaProofTextPath) : null;

  const proofFile = siagaProofReport?.status === "SIAGA_PROOF_READY" && siagaProofTextStat ? {
    name: path.basename(siagaProofTextPath),
    relativePath: path.relative(ROOT, siagaProofTextPath).replaceAll("\\", "/"),
    size: siagaProofTextStat.size,
    modifiedAt: siagaProofTextStat.mtime.toISOString(),
    downloadUrl: "/api/download?file=" + encodeURIComponent(path.relative(ROOT, siagaProofTextPath).replaceAll("\\", "/")),
    status: "VALID_WORK",
    label: "Bukti kerja siap",
    tone: "success",
    reason: siagaProofReport.conclusion || "PDF dan laporan bukti SIAGA sudah tersedia."
  } : (proofAnalyzer?.proof?.file || null);
  const syncedJob = syncLatestJobResultReady({ pdf, proofAnalyzer, proofFile });

  sendJson(res, 200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: syncedJob ? {
      jobId: syncedJob.jobId,
      status: syncedJob.status,
      resultReadyAt: syncedJob.resultReadyAt || null,
      result: syncedJob.result || null
    } : null,
    pdf: pdf ? {
      exists: true,
      name: pdf.name,
      size: pdf.size,
      modifiedAt: pdf.modifiedAt,
      downloadUrl: "/api/download?file=" + encodeURIComponent(pdf.relativePath)
    } : { exists: false },
    proof: proofFile ? {
      exists: true,
      name: proofFile.name,
      size: proofFile.size,
      modifiedAt: proofFile.modifiedAt,
      downloadUrl: proofFile.downloadUrl,
      status: proofFile.status || proofAnalyzer?.proof?.status,
      label: proofFile.label || proofAnalyzer?.proof?.label,
      tone: proofFile.tone || proofAnalyzer?.proof?.tone,
      reason: proofFile.reason || proofAnalyzer?.proof?.reason
    } : {
      exists: false,
      status: proofAnalyzer?.proof?.status || "NEEDS_CHECK",
      label: proofAnalyzer?.proof?.label || "Screenshot belum tersedia",
      tone: proofAnalyzer?.proof?.tone || "warning",
      reason: proofAnalyzer?.proof?.reason || "Jalankan proof analyzer setelah screenshot tersedia."
    },
    deliveryPolicy: {
      appDownload: true,
      emailAttachPdfAndProof: true,
      whatsappFileSend: false,
      whatsappNotificationOnly: true
    }
  });
}

function handleDownloadFile(req, res) {
  const url = new URL(req.url, "http://localhost");
  const file = url.searchParams.get("file") || "";
  const normalized = path.normalize(file).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(ROOT, normalized);

  const allowedRoots = [
    path.join(ROOT, "reports", "downloads"),
    path.join(ROOT, "reports", "proof"),
    path.join(ROOT, "shots")
  ];

  const allowed = allowedRoots.some((base) => fullPath.startsWith(base));
  if (!allowed || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    sendJson(res, 404, { ok: false, error: "File tidak ditemukan atau tidak diizinkan." });
    return;
  }

  const name = path.basename(fullPath);
  const ext = path.extname(name).toLowerCase();
  const type =
    ext === ".pdf" ? "application/pdf" :
    ext === ".json" ? "application/json" :
    ext === ".png" ? "image/png" :
    ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" :
    ext === ".webp" ? "image/webp" :
    "text/plain";

  res.writeHead(200, {
    "Content-Type": type,
    "Content-Disposition": `attachment; filename="${name}"`,
    "Cache-Control": "no-store"
  });

  fs.createReadStream(fullPath).pipe(res);
}

function writeLegacyRunnerBridge(normalized) {
  const first = normalized.accounts?.[0] || {};
  const siagaApp = {
    appId: "siaga",
    username: normalized.username || first.username || normalized.siagaUsername || "",
    password: normalized.password || first.password || normalized.siagaPassword || ""
  };

  const accountFile = {
    version: "0.1.0",
    warning: "Generated from SmartWork user request. Do not commit real credentials.",
    parallelLimit: 1,
    teachers: [
      {
        teacherId: first.teacherId || "guru-001",
        name: first.teacherName || normalized.requesterName || "User Request",
        wa: normalized.delivery?.whatsapp || first.wa || "",
        enabled: true,
        apps: [siagaApp]
      }
    ]
  };

  const requestFile = {
    requestId: normalized.jobId,
    appId: normalized.service || "siaga",
    target: {
      month: normalized.targetMonth || "Juni",
      year: Number(normalized.targetYear || new Date().getFullYear())
    },
    parallelLimit: 1,
    mode: "preview",
    rules: {
      userDoesNotProvideTimeRules: true,
      saveRequiresExplicitPermission: true,
      skipSunday: normalized.rules?.skipSundays !== false
    },
    holidays: normalized.schedule?.holidayDates || [],
    leaveDays: first.leaveDates || normalized.schedule?.globalLeaveDates || [],
    startDate: first.startDate || "",
    endDate: first.endDate || ""
  };

  fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, "data", "teacher-accounts.local.json"),
    JSON.stringify(accountFile, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(ROOT, "data", "siaga-attendance-request.local.json"),
    JSON.stringify(requestFile, null, 2),
    "utf8"
  );
}
function createInternalJsonResponse(label = "internal") {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    writeHead(code, headers = {}) {
      this.statusCode = code;
      this.headers = headers;
    },
    end(body = "") {
      try {
        this.payload = body ? JSON.parse(body) : null;
      } catch {
        this.payload = body;
      }
      if (this.statusCode >= 400) {
        console.error(`[${label}] internal response error`, this.statusCode, this.payload);
      }
    }
  };
}
async function handleCreateRequest(req, res) {
  try {
    const raw = await readRequestBody(req);
    const payload = JSON.parse(raw || "{}");

    const errors = validatePayload(payload);
    if (errors.length) {
      sendJson(res, 400, {
        ok: false,
        error: "Request belum valid.",
        errors,
      });
      return;
    }

    const normalized = normalizePayload(payload);

    fs.mkdirSync(REQUEST_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(ACTIVE_INTAKE_PATH), { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${stamp}-${safeFileName(normalized.jobId)}.json`;
    const filePath = path.join(REQUEST_DIR, fileName);

    fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), "utf8");
    fs.writeFileSync(ACTIVE_INTAKE_PATH, JSON.stringify(normalized, null, 2), "utf8");
    writeLegacyRunnerBridge(normalized);

saveJob({
  jobId: normalized.jobId,
  service: normalized.service || "siaga",
  teacherId: normalized.accounts?.[0]?.teacherId || "guru-001",
  targetMonth: normalized.targetMonth || null,
  targetYear: normalized.targetYear || null,
  status: "PENDING",
  autoStart: true,
  autoStartSource: "request_submit",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

setTimeout(() => {
  handleStartJob(null, createInternalJsonResponse("auto-request-runner"))
    .catch((error) => {
      console.error("[auto-request-runner] gagal start job", error);
    });
}, 250);

    sendJson(res, 200, {
      ok: true,
      filePath: path.relative(ROOT, filePath),
      activeIntakePath: path.relative(ROOT, ACTIVE_INTAKE_PATH),
      jobId: normalized.jobId,
      accountCount: normalized.accounts.length,
      nextCommands: [
        "npm run intake:validate",
        "npm run batch:run",
      ],
    });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error?.message || String(error),
    });
  }
}


function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function listJsonFilesSafe(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => {
      const filePath = path.join(dirPath, name);
      return {
        name,
        path: path.relative(ROOT, filePath),
        modifiedAt: fs.statSync(filePath).mtime.toISOString(),
      };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function handleStatus(req, res) {
  const jobManager = readJsonSafe(path.join(ROOT, "reports", "job-manager", "smartwork-job-manager-report.json"));
  const batchPlan = readJsonSafe(path.join(ROOT, "reports", "batch", "smartwork-batch-plan-report.json"));
  const intake = readJsonSafe(ACTIVE_INTAKE_PATH);
  const requestFiles = listJsonFilesSafe(REQUEST_DIR);

  sendJson(res, 200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    intakePath: path.relative(ROOT, ACTIVE_INTAKE_PATH),
    requestQueuePath: path.relative(ROOT, REQUEST_DIR),
    requestFiles,
    job: (jobManager?.job || intake) ? {
      jobId: jobManager?.job?.jobId || intake?.jobId || null,
      service: jobManager?.job?.service || intake?.service || null,
      mode: jobManager?.job?.mode || intake?.mode || null,
      targetMonth: jobManager?.job?.targetMonth || intake?.targetMonth || null,
      targetYear: jobManager?.job?.targetYear || intake?.targetYear || null,
      requestType: jobManager?.job?.requestType || intake?.requestType || null,
      accountCount: jobManager?.job?.accountCount || intake?.accounts?.length || 0,
    } : null,
    decision: jobManager?.decision || null,
    nextSafeStep: jobManager?.nextSafeStep || null,
    plan: (jobManager?.plan || batchPlan) ? {
      status: jobManager?.plan?.status || batchPlan?.status || null,
      counts: jobManager?.plan?.counts || batchPlan?.counts || null,
      accounts: jobManager?.plan?.accounts || batchPlan?.accounts || [],
    } : null,
    reports: {
      jobManagerExists: Boolean(jobManager),
      batchPlanExists: Boolean(batchPlan),
      activeIntakeExists: Boolean(intake),
    }
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === "/") pathname = "/index.html";

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType =
    ext === ".html" ? "text/html; charset=utf-8" :
    ext === ".js" ? "application/javascript; charset=utf-8" :
    ext === ".css" ? "text/css; charset=utf-8" :
    ext === ".json" ? "application/json; charset=utf-8" :
    "application/octet-stream";

  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": body.length,
  });
  res.end(body);
}


function handleHistory(req, res) {
  const requestFiles = listJsonFilesSafe(REQUEST_DIR);
  const downloadsDir = path.join(ROOT, "reports", "downloads");
  const proofAnalyzerPath = path.join(ROOT, "reports", "proof", "smartwork-proof-analyzer-report.json");
  const siagaProofReportPath = path.join(ROOT, "reports", "proof", "smartwork-siaga-proof-report.json");
  const siagaProofTextPath = path.join(ROOT, "reports", "proof", "smartwork-siaga-proof-report.txt");

  const pdf = findLatestDownloadFile(downloadsDir, [".pdf"]);
  const proofAnalyzer = readJsonSafe(proofAnalyzerPath);
  const siagaProofReport = readJsonSafe(siagaProofReportPath);
  const siagaProofTextStat = fs.existsSync(siagaProofTextPath) ? fs.statSync(siagaProofTextPath) : null;

  const proofFile = siagaProofReport?.status === "SIAGA_PROOF_READY" && siagaProofTextStat ? {
    name: path.basename(siagaProofTextPath),
    relativePath: path.relative(ROOT, siagaProofTextPath).replaceAll("\\", "/"),
    size: siagaProofTextStat.size,
    modifiedAt: siagaProofTextStat.mtime.toISOString(),
    downloadUrl: "/api/download?file=" + encodeURIComponent(path.relative(ROOT, siagaProofTextPath).replaceAll("\\", "/")),
    status: "VALID_WORK",
    label: "Bukti kerja siap",
    tone: "success",
    reason: siagaProofReport.conclusion || "PDF dan laporan bukti SIAGA sudah tersedia."
  } : (proofAnalyzer?.proof?.file || null);

  const grouped = new Map();

  for (const file of requestFiles) {
    const requestPath = path.join(REQUEST_DIR, file.name || file);
    const request = readJsonSafe(requestPath) || {};
    const account = Array.isArray(request.accounts) ? request.accounts[0] : null;

    const service = request.service || "siaga";
    const targetMonth = request.targetMonth || "-";
    const targetYear = request.targetYear || "";
    const key = [service, targetMonth, targetYear].join("|");

    if (grouped.has(key)) continue;

    grouped.set(key, {
      file,
      request,
      account
    });
  }

  const items = Array.from(grouped.values()).slice(0, 20).map((entry, index) => {
    const { file, request, account } = entry;
    const isLatest = index === 0;

    const proofStatus = isLatest
      ? (proofAnalyzer?.proof?.status || "NEEDS_CHECK")
      : "ARCHIVED";

    const status =
      proofStatus === "SERVER_ERROR" ? "Gangguan SIAGA" :
      proofStatus === "VALID_WORK" ? "Selesai" :
      proofStatus === "VALID_PREVIEW" ? "Preview Siap" :
      proofStatus === "LOGIN_REQUIRED" ? "Login Diperlukan" :
      proofStatus === "NETWORK_ERROR" ? "Gangguan Koneksi" :
      isLatest ? "Diproses" : "Tersimpan";

    const shouldUseProof =
      proofStatus === "SERVER_ERROR" ||
      proofStatus === "VALID_PREVIEW" ||
      proofStatus === "LOGIN_REQUIRED" ||
      proofStatus === "NETWORK_ERROR" ||
      proofStatus === "NEEDS_CHECK";

    const pdfFile = isLatest && !shouldUseProof && pdf ? {
      exists: true,
      name: pdf.name,
      downloadUrl: "/api/download?file=" + encodeURIComponent(pdf.relativePath)
    } : { exists: false };

    const proofDownload = isLatest && proofFile ? {
      exists: true,
      name: proofFile.name,
      downloadUrl: proofFile.downloadUrl
    } : { exists: false };

    return {
      id: request.jobId || file.name || String(index + 1),
      service: request.service || "siaga",
      title: (request.service || "siaga").toUpperCase() + " Absensi",
      requesterName: request.requesterName || account?.teacherName || "Nazrin",
      teacherId: account?.teacherId || "guru-001",
      targetMonth: request.targetMonth || "-",
      targetYear: request.targetYear || "",
      requestType: request.requestType || "-",
      createdAt: request.createdAt || file.modifiedAt || null,
      status,
      proofStatus,
      proofLabel: isLatest ? (proofAnalyzer?.proof?.label || "Belum dicek") : "Riwayat",
      proofReason: isLatest ? (proofAnalyzer?.proof?.reason || "") : "",
      pdf: pdfFile,
      proof: proofDownload,
      primaryAction: shouldUseProof ? "proof" : "pdf"
    };
  });

  sendJson(res, 200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    counts: {
      total: items.length,
      processing: items.filter((x) => ["Diproses", "Preview Siap", "Gangguan SIAGA", "Gangguan Koneksi", "Login Diperlukan"].includes(x.status)).length,
      done: items.filter((x) => x.status === "Selesai").length
    },
    items
  });
}

function handleLatestJob(req, res) {
  ensureJobDir();

  const files = fs.readdirSync(JOB_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => ({
      name: f,
      path: path.join(JOB_DIR, f),
      time: fs.statSync(path.join(JOB_DIR, f)).mtimeMs
    }))
    .sort((a,b) => b.time - a.time);

  if (files.length === 0) {
    sendJson(res, 200, {
      ok: true,
      exists: false
    });
    return;
  }

  const latest = JSON.parse(
    fs.readFileSync(files[0].path, "utf8")
  );

  sendJson(res, 200, {
    ok: true,
    exists: true,
    job: latest
  });
}


async function handleStartJob(req, res) {

  const latestFiles = fs.readdirSync(JOB_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => ({
      name: f,
      path: path.join(JOB_DIR, f),
      time: fs.statSync(path.join(JOB_DIR, f)).mtimeMs
    }))
    .sort((a,b) => b.time - a.time);

  if (latestFiles.length === 0) {
    sendJson(res, 404, {
      ok: false,
      error: "Job tidak ditemukan"
    });
    return;
  }

  const filePath = latestFiles[0].path;

  const job = JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );

  job.status = "RUNNING";
  job.startedAt = new Date().toISOString();
  job.updatedAt = new Date().toISOString();
  delete job.completedAt;
  delete job.failedAt;
  delete job.error;
  delete job.resultReadyAt;
  delete job.result;
  job.runner = {
    mode: "AUTO_REAL_SAVE_FROM_REQUEST",
    script: "scripts/smartwork-v6-auto-request-pipeline.mjs",
    startedAt: job.startedAt
  };

  fs.writeFileSync(filePath, JSON.stringify(job, null, 2), "utf8");

  const runnerReportPath = path.join(ROOT, "reports", "siaga-job-runner-preview-report.json");
  if (fs.existsSync(runnerReportPath)) {
    fs.unlinkSync(runnerReportPath);
  }

  const child = spawn("node", ["scripts/smartwork-v6-auto-request-pipeline.mjs"], {
    cwd: ROOT,
    shell: true,
    stdio: "ignore",
    env: {
      ...process.env,
      CONFIRM_SAVE: "YES",
      SMARTWORK_RUN_mode: "AUTO_REAL_SAVE_FROM_REQUEST"
    }
  });

  const pollRunner = setInterval(() => {
    const report = readJsonSafe(runnerReportPath);
    if (!report?.endedAt) return;

    const fresh = readJsonSafe(filePath) || job;
    if (fresh.status !== "RUNNING") {
      clearInterval(pollRunner);
      return;
    }

    fresh.updatedAt = new Date().toISOString();
    fresh.runner = {
      ...(fresh.runner || {}),
      reportPath: "reports/siaga-job-runner-preview-report.json",
      reportEndedAt: report.endedAt,
      reportOk: Boolean(report.ok)
    };

    if (report.ok) {
      fresh.status = "COMPLETED";
      fresh.completedAt = fresh.updatedAt;
    } else {
      fresh.status = "FAILED";
      fresh.failedAt = fresh.updatedAt;
      fresh.error = "Runner report gagal. Cek reports/siaga-job-runner-preview-report.json";
    }

    fs.writeFileSync(filePath, JSON.stringify(fresh, null, 2), "utf8");
    clearInterval(pollRunner);
  }, 3000);

  child.on("exit", (code) => {
    const fresh = readJsonSafe(filePath) || job;
    if (fresh.status === "COMPLETED" || fresh.status === "RESULT_READY") {
      return;
    }
    fresh.updatedAt = new Date().toISOString();
    fresh.runner = {
      ...(fresh.runner || {}),
      exitedAt: fresh.updatedAt,
      exitCode: code
    };

    clearInterval(pollRunner);

    if (code === 0) {
      fresh.status = "COMPLETED";
      fresh.completedAt = fresh.updatedAt;
    } else {
      fresh.status = "FAILED";
      fresh.failedAt = fresh.updatedAt;
      fresh.error = "Request runner gagal. Cek report/log runner.";
    }

    fs.writeFileSync(filePath, JSON.stringify(fresh, null, 2), "utf8");
  });

  child.on("error", (error) => {
    const fresh = readJsonSafe(filePath) || job;
    fresh.status = "FAILED";
    fresh.failedAt = new Date().toISOString();
    fresh.updatedAt = fresh.failedAt;
    fresh.error = error.message;
    fs.writeFileSync(filePath, JSON.stringify(fresh, null, 2), "utf8");
  });

  sendJson(res, 200, {
    ok: true,
    message: "Job runner dimulai",
    job
  });
}


async function handleCompleteJob(req, res) {

  const latestFiles = fs.readdirSync(JOB_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => ({
      name: f,
      path: path.join(JOB_DIR, f),
      time: fs.statSync(path.join(JOB_DIR, f)).mtimeMs
    }))
    .sort((a,b) => b.time - a.time);

  if (latestFiles.length === 0) {
    sendJson(res, 404, {
      ok: false,
      error: "Job tidak ditemukan"
    });
    return;
  }

  const filePath = latestFiles[0].path;

  const job = JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );

  job.status = "COMPLETED";
  job.completedAt = new Date().toISOString();
  job.updatedAt = new Date().toISOString();

  fs.writeFileSync(
    filePath,
    JSON.stringify(job, null, 2),
    "utf8"
  );

  sendJson(res, 200, {
    ok: true,
    message: "Job selesai",
    job
  });
}



// SMARTWORK_JOB_PROGRESS_ENDPOINTS_V2 helpers
function smartworkFindProductionQueueJobForApiV2(jobId) {
  const safeId = String(jobId || "").trim();

  if (!safeId || !/^[A-Za-z0-9._:-]+$/.test(safeId)) {
    return null;
  }

  const queueRoot = smartworkJobProgressPath.join(process.cwd(), "data", "production-queue");
  const buckets = ["pending", "running", "completed", "failed"];

  for (const bucket of buckets) {
    const directPath = smartworkJobProgressPath.join(queueRoot, bucket, safeId + ".json");
    try {
      const job = JSON.parse(smartworkJobProgressFs.readFileSync(directPath, "utf8"));
      return {
        bucket,
        path: smartworkJobProgressPath.relative(process.cwd(), directPath),
        job
      };
    } catch {}
  }

  for (const bucket of buckets) {
    const dir = smartworkJobProgressPath.join(queueRoot, bucket);
    let entries = [];
    try {
      entries = smartworkJobProgressFs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

      const candidatePath = smartworkJobProgressPath.join(dir, entry.name);
      try {
        const job = JSON.parse(smartworkJobProgressFs.readFileSync(candidatePath, "utf8"));
        if (job?.id === safeId || job?.jobId === safeId) {
          return {
            bucket,
            path: smartworkJobProgressPath.relative(process.cwd(), candidatePath),
            job
          };
        }
      } catch {}
    }
  }

  return null;
}

function smartworkBuildJobProgressPayloadForApiV2(found) {
  const job = found?.job || {};
  const status = job.status || found?.bucket || "unknown";

  const percent =
    Number.isFinite(Number(job.progress?.percent)) ? Number(job.progress.percent) :
    Number.isFinite(Number(job.progressPercent)) ? Number(job.progressPercent) :
    Number.isFinite(Number(job.percent)) ? Number(job.percent) :
    Number.isFinite(Number(job.percentage)) ? Number(job.percentage) :
    0;

  const stage =
    job.progress?.stage ||
    job.phase ||
    job.state ||
    status;

  return {
    ok: true,
    id: job.id || job.jobId || null,
    jobId: job.id || job.jobId || null,
    status,
    bucket: found?.bucket || null,
    path: found?.path || null,
    module: job.module || job.service || null,
    mode: job.mode || null,
    accountRef: job.accountRef || null,
    requestRange: job.requestRange || {
      startDate: job.startDate || null,
      endDate: job.endDate || null
    },
    requester: job.requester || null,
    delivery: job.delivery || null,
    safety: job.safety || null,
    progress: {
      percent,
      stage,
      status,
      message: job.progress?.message || "",
      ready: Boolean(job.artifacts?.pdfReady || job.artifacts?.proofReady || job.completedAt),
      completed: status === "completed" || found?.bucket === "completed" || stage === "completed"
    },
    summary: job.summary || null,
    artifacts: job.artifacts || null,
    createdAt: job.createdAt || null,
    updatedAt: job.updatedAt || null,
    completedAt: job.completedAt || null,
    job
  };
}

function smartworkSendJobProgressJsonForApiV2(req, res, statusCode, payload) {
  const origin = req?.headers?.origin || "*";
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin"
  });
  res.end(JSON.stringify(payload, null, 2));
}
// SMARTWORK_JOB_PROGRESS_ENDPOINTS_V2 helpers

const server = http.createServer(async (req, res) => {

    // SMARTWORK_JOB_PROGRESS_ENDPOINTS_V2 routes
    if (String(req.method || "").toUpperCase() === "GET") {
      const smartworkProgressUrl = new URL(req.url || "/", "http://localhost");
      const smartworkProgressPath = smartworkProgressUrl.pathname;
      let smartworkProgressJobId = null;

      const jobsProgressMatch = smartworkProgressPath.match(/^\/api\/smartwork\/jobs\/([^/]+)\/progress$/);
      const progressPathMatch = smartworkProgressPath.match(/^\/api\/smartwork\/progress\/([^/]+)$/);
      const jobDetailMatch = smartworkProgressPath.match(/^\/api\/smartwork\/jobs\/([^/]+)$/);

      if (jobsProgressMatch) {
        smartworkProgressJobId = jobsProgressMatch[1];
      } else if (progressPathMatch) {
        smartworkProgressJobId = progressPathMatch[1];
      } else if (smartworkProgressPath === "/api/smartwork/progress" && smartworkProgressUrl.searchParams.get("id")) {
        smartworkProgressJobId = smartworkProgressUrl.searchParams.get("id");
      } else if (smartworkProgressPath === "/api/smartwork/jobs" && smartworkProgressUrl.searchParams.get("id")) {
        smartworkProgressJobId = smartworkProgressUrl.searchParams.get("id");
      } else if (jobDetailMatch && jobDetailMatch[1] !== "health") {
        smartworkProgressJobId = jobDetailMatch[1];
      }

      if (smartworkProgressJobId && smartworkProgressJobId !== "health") {
        const found = smartworkFindProductionQueueJobForApiV2(smartworkProgressJobId);

        if (!found) {
          smartworkSendJobProgressJsonForApiV2(req, res, 404, {
            ok: false,
            status: 404,
            error: "job_not_found",
            jobId: smartworkProgressJobId
          });
          return;
        }

        smartworkSendJobProgressJsonForApiV2(req, res, 200, smartworkBuildJobProgressPayloadForApiV2(found));
        return;
      }
    }
    // SMARTWORK_JOB_PROGRESS_ENDPOINTS_V2 routes


/* SMARTWORK_PRODUCTION_QUEUE_API_INSTALL_V1 */
if (handleSmartWorkProductionQueueApiNative(req, res)) return;

  if (tryServeSmartworkReports(req, res)) return;

  /* SMARTWORK_E2E_NATIVE_HTTP_ROUTES_V1 */
  try {
    const __swNativeUrl = new URL(req.url || "/", "http://localhost");
    const __swNativePath = __swNativeUrl.pathname;
    const __swNativeMethod = String(req.method || "GET").toUpperCase();

    if (__swNativeMethod === "OPTIONS" && __swNativePath.startsWith("/api/smartwork/siaga/e2e")) {
      return __swNativeSendJson(res, 200, { ok: true });
    }

    if (__swNativeMethod === "GET" && __swNativePath === "/api/smartwork/siaga/e2e/ping") {
      return __swNativeSendJson(res, 200, {
        ok: true,
        routeVersion: "SMARTWORK_E2E_NATIVE_HTTP_ROUTES_V1",
        serverType: "native-http"
      });
    }

    if (__swNativeMethod === "GET" && (__swNativePath === "/api/smartwork/siaga/e2e/status" || __swNativePath === "/api/job/latest-progress")) {
      return __swNativeSendJson(res, 200, __swNativeProgressPayload());
    }

    if (__swNativeMethod === "POST" && __swNativePath === "/api/smartwork/siaga/e2e/run") {
      return __swNativeStartRunner(res, false);
    }

    if (__swNativeMethod === "POST" && __swNativePath === "/api/smartwork/siaga/e2e/run-dry") {
      return __swNativeStartRunner(res, true);
    }

    if (__swNativeMethod === "POST" && __swNativePath === "/api/job/run-latest-e2e") {
      return __swNativeStartRunner(res, false);
    }
  } catch (err) {
    if (String(req.url || "").includes("/api/smartwork/siaga/e2e") || String(req.url || "").includes("/api/job/latest-progress")) {
      return __swNativeSendJson(res, 500, {
        ok: false,
        routeVersion: "SMARTWORK_E2E_NATIVE_HTTP_ROUTES_V1",
        error: String(err?.stack || err?.message || err)
      });
    }
  }
  /* END_SMARTWORK_E2E_NATIVE_HTTP_ROUTES_V1 */

  if (req.method === "GET" && req.url === "/api/history") {
    handleHistory(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/job/latest") {
    handleLatestJob(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/job/start") {
    await handleStartJob(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/job/complete") {
    await handleCompleteJob(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/status") {
    handleStatus(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/requests") {
    await handleCreateRequest(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/downloads/latest") {
    handleDownloadsLatest(req, res);
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/download?")) {
    handleDownloadFile(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  sendText(res, 405, "Method not allowed");
});









server.listen(PORT, () => {
  console.log(`SMARTWORK_CONTROL_SERVER=http://localhost:${PORT}`);
  console.log("Open the URL above to submit a SmartWork SIAGA request.");
});








































