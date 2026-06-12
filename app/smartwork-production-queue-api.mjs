import fs from "fs";
import path from "path";

const root = process.cwd();

const queue = {
  pending: "data/production-queue/pending",
  running: "data/production-queue/running",
  completed: "data/production-queue/completed",
  failed: "data/production-queue/failed"
};

function ensureDir(rel) {
  fs.mkdirSync(path.join(root, rel), { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function safeSegment(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function readJsonFile(full) {
  try {
    return JSON.parse(fs.readFileSync(full, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function writeJson(rel, data) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function listJobs(status = null) {
  const statuses = status && queue[status] ? [status] : Object.keys(queue);
  const items = [];

  for (const st of statuses) {
    ensureDir(queue[st]);
    const dir = path.join(root, queue[st]);
    const names = fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort();

    for (const name of names) {
      const full = path.join(dir, name);
      const job = readJsonFile(full);
      if (!job) continue;

      items.push({
        id: job.id,
        status: st,
        module: job.module,
        mode: job.mode,
        accountRef: job.accountRef,
        requestRange: job.requestRange,
        delivery: job.delivery,
        safety: job.safety,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        path: path.join(queue[st], name).replaceAll("\\", "/")
      });
    }
  }

  return items.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function findJob(id) {
  const safeId = safeSegment(id);
  for (const [status, dirRel] of Object.entries(queue)) {
    const full = path.join(root, dirRel, `${safeId}.json`);
    if (!fs.existsSync(full)) continue;

    return {
      status,
      path: path.join(dirRel, `${safeId}.json`).replaceAll("\\", "/"),
      full,
      job: readJsonFile(full)
    };
  }

  return null;
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function buildJobFromPayload(payload = {}) {
  const account = Array.isArray(payload.accounts) ? payload.accounts[0] : null;

  const startDate =
    normalizeDate(payload?.requestRange?.startDate) ||
    normalizeDate(payload?.startDate) ||
    normalizeDate(account?.startDate);

  const endDate =
    normalizeDate(payload?.requestRange?.endDate) ||
    normalizeDate(payload?.endDate) ||
    normalizeDate(account?.endDate);

  const moduleName = safeSegment(payload.module || payload.agent || "siaga").toLowerCase() || "siaga";
  const createdAt = nowIso();
  const id = safeSegment(payload.id || payload.jobId || `job-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);

  return {
    id,
    schema: "SMARTWORK_PRODUCTION_JOB_SCHEMA_V1",
    source: payload.source || "smartwork-backend-api",
    module: moduleName,
    mode: "dry-run",
    status: "pending",
    accountRef: payload.accountRef || payload.teacherId || account?.id || "guru-001",
    credentialRef: payload.credentialRef || payload.accountRef || payload.teacherId || account?.id || "guru-001",
    requester: {
      name: payload.requesterName || payload.teacherName || "",
      email: payload.email || payload.requesterEmail || "",
      whatsapp: payload.whatsapp || payload.requesterWhatsapp || ""
    },
    requestRange: {
      startDate,
      endDate
    },
    delivery: {
      mode: "app_download_only"
    },
    request: {
      requestType: payload.requestType || "bulk-monthly",
      notes: payload.notes || payload.note || "",
      holidays: payload.holidays || payload.holidayDates || payload.holidayRanges || [],
      redacted: true
    },
    safety: {
      dryRun: true,
      noRealSave: true,
      noRealSend: true,
      noSiagaInput: true,
      noBrowserOpen: true,
      rawPasswordStored: false
    },
    progress: {
      percent: 0,
      stage: "queued",
      message: "Job diterima backend queue. Menunggu worker dry-run."
    },
    createdAt,
    updatedAt: createdAt
  };
}

function validateJob(job) {
  const errors = [];

  if (!job.id) errors.push("missing_id");
  if (!job.module) errors.push("missing_module");
  if (!["siaga", "ekinerja"].includes(job.module)) errors.push("unsupported_module");
  if (!job.requestRange?.startDate) errors.push("missing_startDate");
  if (!job.requestRange?.endDate) errors.push("missing_endDate");
  if (job.safety?.dryRun !== true) errors.push("dryRun_required");
  if (job.safety?.noRealSave !== true) errors.push("noRealSave_required");
  if (job.safety?.noSiagaInput !== true) errors.push("noSiagaInput_required");

  return {
    ok: errors.length === 0,
    errors
  };
}

function createJob(payload) {
  for (const dir of Object.values(queue)) ensureDir(dir);

  const job = buildJobFromPayload(payload);
  const validation = validateJob(job);

  if (!validation.ok) {
    return { ok: false, status: 400, validation, job };
  }

  const rel = path.join(queue.pending, `${safeSegment(job.id)}.json`).replaceAll("\\", "/");
  writeJson(rel, job);

  return {
    ok: true,
    status: 201,
    jobId: job.id,
    statusText: "pending",
    job,
    path: rel,
    validation
  };
}

function moveJob(id, targetStatus, patch = {}) {
  const found = findJob(id);

  if (!found?.job) {
    return { ok: false, status: 404, error: "job_not_found" };
  }

  const targetDir = queue[targetStatus];
  if (!targetDir) {
    return { ok: false, status: 400, error: "invalid_target_status" };
  }

  const updated = {
    ...found.job,
    ...patch,
    status: targetStatus,
    updatedAt: nowIso(),
    safety: {
      ...(found.job.safety || {}),
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true
    }
  };

  const targetRel = path.join(targetDir, `${safeSegment(updated.id)}.json`).replaceAll("\\", "/");
  writeJson(targetRel, updated);

  try {
    fs.unlinkSync(found.full);
  } catch {}

  return {
    ok: true,
    jobId: updated.id,
    from: found.status,
    to: targetStatus,
    job: updated,
    path: targetRel
  };
}


/* SMARTWORK_PHASE5X_NATIVE_CORS_START */
function smartworkPhase5xAllowedOrigin(req) {
  const allowedOrigins = String(
    process.env.SMARTWORK_CORS_ORIGINS ||
    "http://127.0.0.1:5197,http://localhost:5197,http://103.152.242.193:3107"
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const origin = req.headers?.origin || "";
  if (allowedOrigins.includes("*")) return "*";
  if (origin && allowedOrigins.includes(origin)) return origin;
  return allowedOrigins[0] || "*";
}

function smartworkPhase5xApplyCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", smartworkPhase5xAllowedOrigin(req));
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-SmartWork-Dry-Run, X-SmartWork-No-Siaga-Input, X-SmartWork-No-Browser-Open, X-SmartWork-No-Real-Save, X-SmartWork-No-Real-Send"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Cache-Control", "no-store");
}

function smartworkPhase5xHandleOptions(req, res) {
  if (String(req.method || "").toUpperCase() !== "OPTIONS") return false;
  res.statusCode = 204;
  res.end();
  return true;
}
/* SMARTWORK_PHASE5X_NATIVE_CORS_END */

export function installSmartWorkProductionQueueApi(app) {
  if (!app || app.__smartworkProductionQueueApiInstalled) return;

  app.__smartworkProductionQueueApiInstalled = true;

  for (const dir of Object.values(queue)) ensureDir(dir);

  app.use("/api/smartwork/jobs", (req, res, next) => {
    smartworkPhase5xApplyCors(req, res);
    if (smartworkPhase5xHandleOptions(req, res)) return;
    next();
  });

  app.get("/api/smartwork/jobs/health", (_req, res) => {
    res.json({
      ok: true,
      mode: "SMARTWORK_PRODUCTION_QUEUE_API",
      queue,
      counts: {
        pending: listJobs("pending").length,
        running: listJobs("running").length,
        completed: listJobs("completed").length,
        failed: listJobs("failed").length
      },
      safety: {
        dryRun: true,
        noSiagaInput: true,
        noBrowserOpen: true,
        noRealSave: true,
        noRealSend: true
      }
    });
  });

  app.post("/api/smartwork/jobs", (req, res) => {
    const result = createJob(req.body || {});
    res.status(result.status).json(result);
  });

  app.get("/api/smartwork/jobs", (req, res) => {
    const status = req.query?.status ? String(req.query.status) : null;
    const items = listJobs(status);
    res.json({
      ok: true,
      count: items.length,
      items,
      safety: {
        noSiagaInput: true,
        noBrowserOpen: true
      }
    });
  });

  app.get("/api/smartwork/jobs/pending", (_req, res) => {
    const items = listJobs("pending");
    res.json({
      ok: true,
      count: items.length,
      items,
      safety: {
        noSiagaInput: true,
        noBrowserOpen: true
      }
    });
  });

  app.get("/api/smartwork/jobs/:id", (req, res) => {
    const found = findJob(req.params.id);
    if (!found?.job) {
      res.status(404).json({ ok: false, error: "job_not_found", id: req.params.id });
      return;
    }

    res.json({
      ok: true,
      id: req.params.id,
      status: found.status,
      path: found.path,
      job: found.job,
      safety: {
        noSiagaInput: true,
        noBrowserOpen: true
      }
    });
  });

  app.post("/api/smartwork/jobs/ack", (req, res) => {
    const jobId = req.body?.jobId || req.body?.id;
    const result = moveJob(jobId, "running", {
      startedAt: nowIso(),
      worker: {
        id: req.body?.workerId || "smartwork-worker-dry-run",
        mode: "dry-run"
      },
      progress: {
        percent: 5,
        stage: "running",
        message: "Worker dry-run mengambil job."
      }
    });
    res.status(result.status || 200).json(result);
  });

  app.post("/api/smartwork/jobs/complete", (req, res) => {
    const jobId = req.body?.jobId || req.body?.id;
    const result = moveJob(jobId, "completed", {
      completedAt: nowIso(),
      progress: {
        percent: 100,
        stage: "completed",
        message: "Job dry-run selesai. Artifact bridge akan dipasang di phase berikutnya."
      },
      result: req.body?.result || {
        mode: "dry-run",
        artifactBridge: "pending-phase-5D"
      }
    });
    res.status(result.status || 200).json(result);
  });

  app.post("/api/smartwork/jobs/fail", (req, res) => {
    const jobId = req.body?.jobId || req.body?.id;
    const result = moveJob(jobId, "failed", {
      failedAt: nowIso(),
      error: {
        message: req.body?.message || "Worker marked job as failed."
      },
      progress: {
        percent: 0,
        stage: "failed",
        message: "Job gagal di dry-run."
      }
    });
    res.status(result.status || 200).json(result);
  });
}

export default installSmartWorkProductionQueueApi;


/* SMARTWORK_PRODUCTION_QUEUE_NATIVE_HANDLER_V1 */
function sendNativeJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data, null, 2));
}

function readNativeBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) req.destroy();
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export function handleSmartWorkProductionQueueApiNative(req, res) {
  const requestUrl = new URL(req.url || "/", "http://localhost");
  const pathname = requestUrl.pathname;
  const method = String(req.method || "GET").toUpperCase();

  if (!pathname.startsWith("/api/smartwork/jobs")) return false;

  smartworkPhase5xApplyCors(req, res);
  if (smartworkPhase5xHandleOptions(req, res)) return true;

  Promise.resolve().then(async () => {
    for (const dir of Object.values(queue)) ensureDir(dir);

    if (method === "GET" && pathname === "/api/smartwork/jobs/health") {
      sendNativeJson(res, 200, {
        ok: true,
        mode: "SMARTWORK_PRODUCTION_QUEUE_API_NATIVE",
        queue,
        counts: {
          pending: listJobs("pending").length,
          running: listJobs("running").length,
          completed: listJobs("completed").length,
          failed: listJobs("failed").length
        },
        safety: {
          dryRun: true,
          noSiagaInput: true,
          noBrowserOpen: true,
          noRealSave: true,
          noRealSend: true
        }
      });
      return;
    }

    if (method === "POST" && pathname === "/api/smartwork/jobs") {
      const body = await readNativeBody(req);
      const result = createJob(body || {});
      sendNativeJson(res, result.status || 201, result);
      return;
    }

    if (method === "GET" && pathname === "/api/smartwork/jobs") {
      const status = requestUrl.searchParams.get("status");
      const items = listJobs(status);
      sendNativeJson(res, 200, {
        ok: true,
        count: items.length,
        items,
        safety: { noSiagaInput: true, noBrowserOpen: true }
      });
      return;
    }

    if (method === "GET" && pathname === "/api/smartwork/jobs/pending") {
      const items = listJobs("pending");
      sendNativeJson(res, 200, {
        ok: true,
        count: items.length,
        items,
        safety: { noSiagaInput: true, noBrowserOpen: true }
      });
      return;
    }

    if (method === "POST" && pathname === "/api/smartwork/jobs/ack") {
      const body = await readNativeBody(req);
      const result = moveJob(body.jobId || body.id, "running", {
        startedAt: nowIso(),
        worker: {
          id: body.workerId || "smartwork-worker-dry-run",
          mode: "dry-run"
        },
        progress: {
          percent: 5,
          stage: "running",
          message: "Worker dry-run mengambil job."
        }
      });
      sendNativeJson(res, result.status || 200, result);
      return;
    }

    if (method === "POST" && pathname === "/api/smartwork/jobs/complete") {
      const body = await readNativeBody(req);
      const result = moveJob(body.jobId || body.id, "completed", {
        completedAt: nowIso(),
        progress: {
          percent: 100,
          stage: "completed",
          message: "Job dry-run selesai. Artifact bridge akan dipasang di phase berikutnya."
        },
        result: body.result || {
          mode: "dry-run",
          artifactBridge: "pending-phase-5D"
        }
      });
      sendNativeJson(res, result.status || 200, result);
      return;
    }

    if (method === "POST" && pathname === "/api/smartwork/jobs/fail") {
      const body = await readNativeBody(req);
      const result = moveJob(body.jobId || body.id, "failed", {
        failedAt: nowIso(),
        error: {
          message: body.message || "Worker marked job as failed."
        },
        progress: {
          percent: 0,
          stage: "failed",
          message: "Job gagal di dry-run."
        }
      });
      sendNativeJson(res, result.status || 200, result);
      return;
    }

    const idMatch = pathname.match(new RegExp("^/api/smartwork/jobs/([^/]+)$"));
    if (method === "GET" && idMatch?.[1]) {
      const found = findJob(idMatch[1]);
      if (!found?.job) {
        sendNativeJson(res, 404, { ok: false, error: "job_not_found", id: idMatch[1] });
        return;
      }

      sendNativeJson(res, 200, {
        ok: true,
        id: idMatch[1],
        status: found.status,
        path: found.path,
        job: found.job,
        safety: { noSiagaInput: true, noBrowserOpen: true }
      });
      return;
    }

    sendNativeJson(res, 404, {
      ok: false,
      error: "smartwork_job_route_not_found",
      path: pathname
    });
  }).catch((error) => {
    sendNativeJson(res, 500, {
      ok: false,
      error: "smartwork_queue_api_error",
      message: error?.message || String(error),
      safety: { noSiagaInput: true, noBrowserOpen: true }
    });
  });

  return true;
}
