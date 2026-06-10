import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports");

function readText(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, "");
}

function readJsonSafe(file) {
  try {
    const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (error) {
    return { __error: error.message };
  }
}

function listFiles(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .map((name) => {
      const full = path.join(abs, name);
      const stat = fs.statSync(full);
      return {
        name,
        full,
        rel: path.relative(ROOT, full).replaceAll("\\", "/"),
        mtimeMs: stat.mtimeMs,
        modifiedAt: stat.mtime.toISOString(),
        size: stat.size
      };
    })
    .filter((x) => fs.statSync(x.full).isFile())
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function findMatches(text, regex) {
  const out = [];
  let match;
  while ((match = regex.exec(text)) !== null) out.push(match[0]);
  return [...new Set(out)];
}

function pickDateFields(obj) {
  if (!obj || typeof obj !== "object") return {};
  const firstAccount = Array.isArray(obj.accounts) ? obj.accounts[0] : null;
  return {
    rootStartDate: obj.startDate || obj.start_date || null,
    rootEndDate: obj.endDate || obj.end_date || null,
    accountStartDate: firstAccount?.startDate || firstAccount?.start_date || null,
    accountEndDate: firstAccount?.endDate || firstAccount?.end_date || null,
    targetMonth: obj.targetMonth || firstAccount?.targetMonth || null,
    targetYear: obj.targetYear || firstAccount?.targetYear || null,
    teacherId: obj.teacherId || firstAccount?.teacherId || null,
    service: obj.service || firstAccount?.service || null
  };
}

fs.mkdirSync(REPORT_DIR, { recursive: true });

const requestHtml = readText("public/request.html");
const progressHtml = readText("public/progress.html");
const historyHtml = readText("public/history.html");
const server = readText("app/smartwork-control-server.mjs");
const jobManager = readText("scripts/smartwork-job-manager-agent.mjs");

const requestFiles = listFiles("intake/requests");
const jobFiles = listFiles("data/jobs");
const reportFiles = listFiles("reports");

const latestRequestFile = requestFiles[0] || null;
const latestJobFile = jobFiles[0] || null;

const latestRequest = latestRequestFile ? readJsonSafe(latestRequestFile.full) : null;
const latestJob = latestJobFile ? readJsonSafe(latestJobFile.full) : null;

const requestFetches = findMatches(requestHtml, /fetch\((`[^`]+`|'[^']+'|"[^"]+")/g);

const expressRoutes = findMatches(server, /app\.(get|post|put|delete)\(["'`][^"'`]+["'`]/g);
const nativeHttpRoutes = findMatches(
  server,
  /req\.method\s*===\s*["'`](GET|POST|PUT|DELETE)["'`]\s*&&\s*req\.url(?:\.startsWith\([^)]+\)|\s*===\s*["'`][^"'`]+["'`])/g
);

const serverRoutes = [...expressRoutes, ...nativeHttpRoutes];

const localStorageUsage = {
  requestHtml: findMatches(requestHtml, /localStorage\.[a-zA-Z]+|localStorage/g),
  progressHtml: findMatches(progressHtml, /localStorage\.[a-zA-Z]+|localStorage/g),
  historyHtml: findMatches(historyHtml, /localStorage\.[a-zA-Z]+|localStorage/g)
};

const requestRouteSignals = {
  hasNativeHttpServer: server.includes("http.createServer"),
  hasPostApiRequests: server.includes('req.method === "POST" && req.url === "/api/requests"') ||
    server.includes("req.method === 'POST' && req.url === '/api/requests'"),
  hasHandleCreateRequest: server.includes("handleCreateRequest"),
  handleCreateRequestCalls: findMatches(server, /handleCreateRequest\([^)]*\)/g)
};

const runnerSignals = {
  jobManagerExists: Boolean(jobManager),
  readsIntakeRequests: jobManager.includes("intake") || jobManager.includes("requests"),
  mentionsStartDate: jobManager.includes("startDate") || jobManager.includes("start_date"),
  mentionsEndDate: jobManager.includes("endDate") || jobManager.includes("end_date"),
  mentionsTargetLimit: jobManager.includes("TARGET_LIMIT")
};

const issues = [];

if (!requestHtml) issues.push("public/request.html tidak ditemukan atau kosong.");
if (!server) issues.push("app/smartwork-control-server.mjs tidak ditemukan atau kosong.");
if (requestFetches.length === 0) issues.push("request.html belum jelas mengirim request via fetch ke server.");
if (!requestRouteSignals.hasPostApiRequests) issues.push("server belum punya POST /api/requests.");
if (!requestRouteSignals.hasHandleCreateRequest) issues.push("server belum punya handleCreateRequest.");
if (requestFiles.length === 0) issues.push("Belum ada file intake/requests yang terbaca.");

if (latestRequest && !latestRequest.__error) {
  const d = pickDateFields(latestRequest);
  if (!d.rootStartDate && !d.accountStartDate) issues.push("Request terbaru belum punya startDate yang jelas.");
  if (!d.rootEndDate && !d.accountEndDate) issues.push("Request terbaru belum punya endDate yang jelas.");
}

if (latestRequest?.__error) issues.push(`Request terbaru gagal parse JSON: ${latestRequest.__error}`);
if (latestJob?.__error) issues.push(`Job terbaru gagal parse JSON: ${latestJob.__error}`);
if (runnerSignals.mentionsTargetLimit) issues.push("Job manager/runner masih terindikasi memakai TARGET_LIMIT. Ini bisa membuat rentang user diabaikan.");

const report = {
  ok: issues.length === 0,
  mode: "SMARTWORK_REQUEST_PIPELINE_DIAGNOSE",
  generatedAt: new Date().toISOString(),
  goal: "User submit request, server creates job, SmartWork Agent processes automatically, admin only monitors.",
  files: {
    requestHtml: Boolean(requestHtml),
    progressHtml: Boolean(progressHtml),
    historyHtml: Boolean(historyHtml),
    server: Boolean(server),
    jobManager: Boolean(jobManager)
  },
  requestSubmit: {
    fetchCallsFound: requestFetches
  },
  server: {
    routesFound: serverRoutes,
    requestRouteSignals
  },
  storage: {
    localStorageUsage,
    requestFilesCount: requestFiles.length,
    jobFilesCount: jobFiles.length,
    reportFilesCount: reportFiles.length
  },
  latestRequest: latestRequestFile ? {
    file: latestRequestFile.rel,
    modifiedAt: latestRequestFile.modifiedAt,
    dates: pickDateFields(latestRequest),
    parseError: latestRequest?.__error || null
  } : null,
  latestJob: latestJobFile ? {
    file: latestJobFile.rel,
    modifiedAt: latestJobFile.modifiedAt,
    status: latestJob?.status || null,
    jobId: latestJob?.jobId || null,
    parseError: latestJob?.__error || null
  } : null,
  runnerSignals,
  issues,
  nextDecision: issues.length === 0
    ? "Pipeline dasar request sudah valid. Lanjut inspect handleCreateRequest dan auto-run job."
    : "Patch titik issue di atas dulu sebelum test real."
};

const out = path.join(REPORT_DIR, "smartwork-request-pipeline-diagnose-report.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify({
  ok: report.ok,
  mode: report.mode,
  issues: report.issues.length,
  hasPostApiRequests: requestRouteSignals.hasPostApiRequests,
  hasHandleCreateRequest: requestRouteSignals.hasHandleCreateRequest,
  latestRequest: report.latestRequest?.file || null,
  latestJob: report.latestJob?.file || null,
  reportPath: path.relative(ROOT, out).replaceAll("\\", "/")
}, null, 2));
