import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const PORT = Number(process.env.PORT || 3107);

const PUBLIC_DIR = path.join(ROOT, "public");
const REQUEST_DIR = path.join(ROOT, "intake", "requests");
const ACTIVE_INTAKE_PATH = path.join(ROOT, "intake", "smartwork-job-request.sample.json");

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

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/requests") {
    await handleCreateRequest(req, res);
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
