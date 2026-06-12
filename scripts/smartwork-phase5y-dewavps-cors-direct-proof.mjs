import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const apiBase = "http://103.152.242.193:3107";
const reportPath = path.join(repo, "docs", "checkpoints", "smartwork-phase5y-dewavps-cors-direct-browser-proof-report.json");

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return {
    ok: res.ok,
    status: res.status,
    url,
    headers: {
      allowOrigin: res.headers.get("access-control-allow-origin"),
      allowMethods: res.headers.get("access-control-allow-methods"),
      allowHeaders: res.headers.get("access-control-allow-headers")
    },
    json,
    text: text.slice(0, 3000)
  };
}

function counts(health) {
  return health?.counts || health?.queueCounts || health?.queue?.counts || {};
}

function assertSafe(health) {
  const safety = health?.safety || {};
  const required = ["dryRun", "noSiagaInput", "noBrowserOpen", "noRealSave", "noRealSend"];
  const bad = required.filter((k) => safety[k] !== true);
  if (bad.length) throw new Error("Safety failed: " + bad.join(", "));
  return Object.fromEntries(required.map((k) => [k, true]));
}

async function main() {
  const origin = "http://127.0.0.1:5197";

  const healthBefore = await fetchJson(`${apiBase}/api/smartwork/jobs/health`);
  if (!healthBefore.ok) throw new Error("Health before failed HTTP " + healthBefore.status);
  const safetyBefore = assertSafe(healthBefore.json);

  const optionsSmoke = await fetchJson(`${apiBase}/api/smartwork/jobs/health`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Content-Type"
    }
  });

  const getSmoke = await fetchJson(`${apiBase}/api/smartwork/jobs/health`, {
    method: "GET",
    headers: { Origin: origin }
  });

  const requestedJobId = "phase5y-direct-browser-dry-run-" + Date.now();

  const submitSmoke = await fetchJson(`${apiBase}/api/smartwork/jobs`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-SmartWork-Dry-Run": "true",
      "X-SmartWork-No-Siaga-Input": "true",
      "X-SmartWork-No-Browser-Open": "true",
      "X-SmartWork-No-Real-Save": "true",
      "X-SmartWork-No-Real-Send": "true"
    },
    body: JSON.stringify({
      source: "smartwork-app-request-form",
      module: "siaga",
      mode: "dry-run",
      accountRef: "guru-001",
      credentialRef: "guru-001",
      requester: {
        name: "Nazrin Phase 5Y Direct Browser Proof",
        email: "",
        whatsapp: ""
      },
      requestRange: {
        startDate: "2026-06-12",
        endDate: "2026-06-12"
      },
      request: {
        requestType: "bulk-monthly",
        notes: "Phase 5Y direct CORS proof only. No SIAGA input, no browser automation, no save/send.",
        holidays: [],
        redacted: true
      },
      safety: {
        dryRun: true,
        noRealSave: true,
        noRealSend: true,
        noSiagaInput: true,
        noBrowserOpen: true,
        rawPasswordStored: false
      }
    })
  });

  const returnedJobId =
    submitSmoke.json?.jobId ||
    submitSmoke.json?.job?.id ||
    submitSmoke.json?.id ||
    "";

  await new Promise((resolve) => setTimeout(resolve, 3000));

  const statusSmoke = returnedJobId
    ? await fetchJson(`${apiBase}/api/smartwork/jobs/${encodeURIComponent(returnedJobId)}`, {
        method: "GET",
        headers: { Origin: origin }
      })
    : { ok: false, status: 0, headers: {}, json: null, text: "missing returnedJobId" };

  const healthAfter = await fetchJson(`${apiBase}/api/smartwork/jobs/health`);
  if (!healthAfter.ok) throw new Error("Health after failed HTTP " + healthAfter.status);
  const safetyAfter = assertSafe(healthAfter.json);

  const jobStatus = statusSmoke.json?.status || statusSmoke.json?.job?.status || "";
  const jobPercent =
    statusSmoke.json?.job?.progress?.percent ??
    statusSmoke.json?.job?.percent ??
    statusSmoke.json?.job?.progressPercent ??
    statusSmoke.json?.job?.percentage ??
    0;

  const corsOk = Boolean(
    optionsSmoke.status === 204 &&
    optionsSmoke.headers.allowOrigin &&
    getSmoke.ok &&
    getSmoke.headers.allowOrigin &&
    submitSmoke.ok &&
    submitSmoke.headers.allowOrigin &&
    returnedJobId &&
    statusSmoke.ok &&
    statusSmoke.headers.allowOrigin &&
    healthAfter.ok
  );

  const safetyOk = Boolean(
    safetyBefore.dryRun &&
    safetyAfter.dryRun &&
    safetyBefore.noSiagaInput &&
    safetyAfter.noSiagaInput &&
    safetyBefore.noBrowserOpen &&
    safetyAfter.noBrowserOpen &&
    safetyBefore.noRealSave &&
    safetyAfter.noRealSave &&
    safetyBefore.noRealSend &&
    safetyAfter.noRealSend
  );

  const report = {
    ok: corsOk && safetyOk,
    phase: "5Y",
    releaseDecision: "DEWAVPS_CORS_DEPLOYED_DIRECT_BROWSER_SUBMIT_SAFE",
    apiBase,
    directBrowserCors: {
      origin,
      noSameOriginProxy: true,
      optionsStatus: optionsSmoke.status,
      optionsAllowOrigin: optionsSmoke.headers.allowOrigin,
      getStatus: getSmoke.status,
      getAllowOrigin: getSmoke.headers.allowOrigin,
      submitStatus: submitSmoke.status,
      submitAllowOrigin: submitSmoke.headers.allowOrigin,
      statusStatus: statusSmoke.status,
      statusAllowOrigin: statusSmoke.headers.allowOrigin || null
    },
    job: {
      requestedJobId,
      returnedJobId,
      status: jobStatus,
      percent: jobPercent
    },
    queueCounts: {
      before: counts(healthBefore.json),
      after: counts(healthAfter.json)
    },
    checks: {
      corsOk,
      safetyOk
    },
    proof: {
      optionsSmoke,
      getSmoke,
      submitSmoke,
      statusSmoke,
      healthBefore: healthBefore.json,
      healthAfter: healthAfter.json
    },
    safetyConfirmed: {
      before: safetyBefore,
      after: safetyAfter,
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true
    },
    createdAt: new Date().toISOString()
  };

  writeJson(reportPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    phase: report.phase,
    releaseDecision: report.releaseDecision,
    optionsStatus: optionsSmoke.status,
    optionsAllowOrigin: optionsSmoke.headers.allowOrigin,
    getAllowOrigin: getSmoke.headers.allowOrigin,
    submitStatus: submitSmoke.status,
    submitAllowOrigin: submitSmoke.headers.allowOrigin,
    statusStatus: statusSmoke.status,
    statusAllowOrigin: statusSmoke.headers.allowOrigin || null,
    requestedJobId,
    returnedJobId,
    jobStatus,
    jobPercent,
    checks: report.checks,
    queueCountsBefore: report.queueCounts.before,
    queueCountsAfter: report.queueCounts.after,
    checkpoint: "docs/checkpoints/smartwork-phase5y-dewavps-cors-direct-browser-proof-report.json"
  }, null, 2));

  if (!report.ok) process.exit(2);
}

main().catch((err) => {
  const fail = {
    ok: false,
    phase: "5Y",
    releaseDecision: "DEWAVPS_CORS_DIRECT_BROWSER_PROOF_FAILED",
    error: err.stack || err.message,
    apiBase,
    createdAt: new Date().toISOString()
  };
  writeJson(reportPath, fail);
  console.error(err);
  process.exit(1);
});
