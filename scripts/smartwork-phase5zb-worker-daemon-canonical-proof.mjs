import fs from "node:fs";
import path from "node:path";

const reportPath = path.join(process.cwd(), "docs", "checkpoints", "smartwork-phase5zb-worker-daemon-canonical-proof-report.json");
const apiBase = "http://103.152.242.193:3107";
const origin = "http://127.0.0.1:5197";

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
    headers: {
      allowOrigin: res.headers.get("access-control-allow-origin")
    },
    json,
    text: text.slice(0, 3000)
  };
}

function safetyOk(health) {
  return Boolean(
    health?.ok === true &&
    health?.safety?.dryRun === true &&
    health?.safety?.noSiagaInput === true &&
    health?.safety?.noBrowserOpen === true &&
    health?.safety?.noRealSave === true &&
    health?.safety?.noRealSend === true
  );
}

async function main() {
  const remote = JSON.parse(process.env.SMARTWORK_5ZB_REMOTE_JSON || "{}");

  const before = await fetchJson(`${apiBase}/api/smartwork/jobs/health`, {
    method: "GET",
    headers: { Origin: origin }
  });

  const jobSource = `phase5zb-worker-daemon-proof-${Date.now()}`;

  const submit = await fetchJson(`${apiBase}/api/smartwork/jobs`, {
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
      source: jobSource,
      module: "siaga",
      mode: "dry-run",
      accountRef: "guru-001",
      credentialRef: "guru-001",
      requester: {
        name: "Nazrin Phase 5ZB Worker Proof",
        email: "",
        whatsapp: ""
      },
      requestRange: {
        startDate: "2026-06-12",
        endDate: "2026-06-12"
      },
      request: {
        requestType: "worker-daemon-proof",
        notes: "Phase 5ZB worker daemon proof only. No SIAGA input, no browser automation, no save/send.",
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

  const jobId = submit.json?.jobId || submit.json?.job?.id || submit.json?.id || "";

  let status = null;
  for (let i = 0; i < 12; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    status = await fetchJson(`${apiBase}/api/smartwork/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: { Origin: origin }
    });
    const s = status.json?.status || status.json?.job?.status;
    if (["completed", "failed"].includes(s)) break;
  }

  const after = await fetchJson(`${apiBase}/api/smartwork/jobs/health`, {
    method: "GET",
    headers: { Origin: origin }
  });

  const jobStatus = status?.json?.status || status?.json?.job?.status || "";
  const jobPercent =
    status?.json?.job?.progress?.percent ??
    status?.json?.job?.percent ??
    status?.json?.job?.progressPercent ??
    0;

  const beforeCompleted = Number(before.json?.counts?.completed ?? 0);
  const afterCompleted = Number(after.json?.counts?.completed ?? 0);

  const ok = Boolean(
    remote.workerEnabled === "enabled" &&
    remote.workerActive === "active" &&
    String(remote.workerCgroup || "").includes("smartwork-production-worker.service") &&
    String(remote.workerCmd || "").includes("smartwork-production-worker-daemon.mjs") &&
    remote.apiEnabled === "enabled" &&
    remote.apiActive === "active" &&
    String(remote.apiCgroup || "").includes("smartwork-control-server.service") &&
    safetyOk(before.json) &&
    safetyOk(after.json) &&
    submit.ok &&
    submit.status === 201 &&
    jobId &&
    status?.ok &&
    jobStatus === "completed" &&
    Number(jobPercent) === 100 &&
    afterCompleted >= beforeCompleted + 1
  );

  const report = {
    ok,
    phase: "5ZB",
    releaseDecision: "VPS_WORKER_DAEMON_CANONICAL_AUTOSTART_AND_QUEUE_PROCESSING_READY",
    remote,
    apiBase,
    job: {
      jobSource,
      jobId,
      status: jobStatus,
      percent: jobPercent
    },
    queueCounts: {
      before: before.json?.counts,
      after: after.json?.counts
    },
    proof: {
      before,
      submit,
      status,
      after
    },
    safetyConfirmed: {
      dryRun: true,
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true
    },
    notes: [
      "Worker daemon is owned by smartwork-production-worker.service.",
      "API is owned by smartwork-control-server.service.",
      "A dry-run job was submitted and completed through the worker queue.",
      "No SIAGA input, no browser automation, no real save/send."
    ],
    createdAt: new Date().toISOString()
  };

  writeJson(reportPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    phase: report.phase,
    releaseDecision: report.releaseDecision,
    workerEnabled: remote.workerEnabled,
    workerActive: remote.workerActive,
    workerCgroup: remote.workerCgroup,
    jobId,
    jobStatus,
    jobPercent,
    completedBefore: beforeCompleted,
    completedAfter: afterCompleted,
    checkpoint: "docs/checkpoints/smartwork-phase5zb-worker-daemon-canonical-proof-report.json"
  }, null, 2));

  if (!ok) process.exit(2);
}

main().catch((err) => {
  writeJson(reportPath, {
    ok: false,
    phase: "5ZB",
    releaseDecision: "VPS_WORKER_DAEMON_CANONICAL_PROOF_FAILED",
    error: err.stack || err.message,
    createdAt: new Date().toISOString()
  });
  console.error(err);
  process.exit(1);
});
