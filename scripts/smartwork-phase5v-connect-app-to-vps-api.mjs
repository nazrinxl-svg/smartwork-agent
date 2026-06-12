import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const VPS_API_BASE = (process.env.SMARTWORK_VPS_API_BASE || "http://103.152.242.193:3107").replace(/\/+$/, "");
const reportPath = path.join(repo, "reports", "smartwork-phase5v-vps-app-submit-report.json");
const checkpointPath = path.join(repo, "docs", "checkpoints", "smartwork-phase5v-vps-app-submit-report.json");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function exists(file) {
  return fs.existsSync(file);
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if ([".git", "node_modules", "backup-code", "reports"].includes(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(repo, file).replaceAll("\\", "/");
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, url, json, text: text.slice(0, 2000) };
}

function getQueueCounts(health) {
  return health?.queueCounts || health?.counts || health?.queue?.counts || {};
}

function getSafety(health) {
  return health?.safety || health || {};
}

function assertSafeHealth(health) {
  const safety = getSafety(health);
  const required = ["dryRun", "noSiagaInput", "noBrowserOpen", "noRealSave", "noRealSend"];
  const missing = required.filter((k) => safety[k] !== true);
  if (missing.length) {
    throw new Error(`VPS safety guard failed. Missing true flags: ${missing.join(", ")}`);
  }
}

function findHtml(name) {
  return walk(repo).filter((f) => path.basename(f).toLowerCase() === name.toLowerCase());
}

function pickRequestHtml() {
  const candidates = findHtml("request.html");
  if (!candidates.length) throw new Error("request.html tidak ditemukan.");
  return candidates
    .map((f) => ({ file: f, score: read(f).includes("smartwork_request") ? 10 : 0 }))
    .sort((a, b) => b.score - a.score)[0].file;
}

function injectRequestBridge(file) {
  const start = "<!-- SMARTWORK_PHASE5V_VPS_API_BRIDGE_START -->";
  const end = "<!-- SMARTWORK_PHASE5V_VPS_API_BRIDGE_END -->";
  let html = read(file);

  const backup = path.join(repo, "backup-code", "phase5v", `${path.basename(file)}.${Date.now()}.bak`);
  write(backup, html);

  const bridge = `${start}
<script id="smartwork-phase5v-vps-api-bridge">
(() => {
  const PHASE = "5V";
  const DEFAULT_API_BASE = "${VPS_API_BASE}";
  const API_BASE = (localStorage.getItem("smartwork_vps_api_base") || DEFAULT_API_BASE).replace(/\\/+$/, "");
  localStorage.setItem("smartwork_vps_api_base", API_BASE);

  const HEALTH_PATH = "/api/smartwork/jobs/health";
  const SUBMIT_PATHS = ["/api/smartwork/jobs"];

  function status(message, ok = true) {
    console.log("[SmartWork Phase 5V]", message);
    let el = document.getElementById("smartwork-phase5v-vps-status");
    if (!el) {
      el = document.createElement("div");
      el.id = "smartwork-phase5v-vps-status";
      el.style.cssText = "margin:10px 0;padding:8px 10px;border-radius:12px;border:1px solid #dbeafe;background:#eff6ff;color:#1e40af;font:12px/1.4 system-ui;";
      const btn = document.querySelector("button[type='submit'],button");
      (btn?.parentElement || document.body).appendChild(el);
    }
    el.textContent = message;
    el.dataset.ok = ok ? "true" : "false";
  }

  function formObject(form) {
    const obj = {};
    if (form) {
      const fd = new FormData(form);
      for (const [key, value] of fd.entries()) obj[key] = value;
    }

    let saved = {};
    try { saved = JSON.parse(localStorage.getItem("smartwork_request") || "{}"); } catch {}

    const merged = { ...saved, ...obj };
    const startDate = merged.startDate || merged.dariTanggal || merged.fromDate || merged.tanggalMulai || merged["start-date"] || "";
    const endDate = merged.endDate || merged.keTanggal || merged.toDate || merged.tanggalSelesai || merged["end-date"] || "";

    const jobId = merged.jobId || "phase5v-app-dry-run-" + Date.now();

    return {
      jobId,
      type: "siaga-attendance",
      source: "smartwork-app-request-form",
      phase: PHASE,
      mode: "SMARTWORK_PRODUCTION_QUEUE_API_NATIVE",
      dryRun: true,
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true,
      requestedAt: new Date().toISOString(),
      request: {
        ...merged,
        jobId,
        startDate,
        endDate,
        dryRun: true,
        noSiagaInput: true,
        noBrowserOpen: true,
        noRealSave: true,
        noRealSend: true
      },
      accounts: [
        {
          id: merged.accountId || merged.teacherId || "guru-001",
          name: merged.name || merged.nama || merged.requesterName || "Nazrin",
          email: merged.email || "",
          whatsapp: merged.whatsapp || merged.wa || "",
                              startDate,
          endDate,
          dryRun: true
        }
      ],
      safety: {
        dryRun: true,
        noSiagaInput: true,
        noBrowserOpen: true,
        noRealSave: true,
        noRealSend: true
      }
    };
  }

  async function readHealth() {
    const res = await fetch(API_BASE + HEALTH_PATH, { method: "GET", mode: "cors" });
    const json = await res.json();
    const safety = json.safety || json;
    const required = ["dryRun", "noSiagaInput", "noBrowserOpen", "noRealSave", "noRealSend"];
    const bad = required.filter((k) => safety[k] !== true);
    if (bad.length) throw new Error("VPS safety guard failed: " + bad.join(", "));
    return json;
  }

  async function postToVps(payload) {
    let lastError = null;

    for (const path of SUBMIT_PATHS) {
      try {
        const res = await fetch(API_BASE + path, {
          method: "POST",
          mode: "cors",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            "X-SmartWork-Dry-Run": "true",
            "X-SmartWork-No-Siaga-Input": "true",
            "X-SmartWork-No-Browser-Open": "true",
            "X-SmartWork-No-Real-Save": "true",
            "X-SmartWork-No-Real-Send": "true"
          },
          body: JSON.stringify(payload)
        });

        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch {}

        if (res.ok) {
          return { ok: true, path, status: res.status, json, text };
        }

        lastError = new Error(path + " returned HTTP " + res.status + " " + text.slice(0, 300));
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error("All VPS submit endpoints failed.");
  }

  async function submitDryRun(form) {
    status("Mengirim request dry-run ke VPS queue...");
    const healthBefore = await readHealth();
    const payload = formObject(form);
    localStorage.setItem("smartwork_request", JSON.stringify(payload.request));
    localStorage.setItem("smartwork_active_job_id", payload.jobId);

    const submit = await postToVps(payload);

    const proof = {
      ok: true,
      phase: PHASE,
      apiBase: API_BASE,
      jobId: payload.jobId,
      submit,
      healthBefore,
      submittedAt: new Date().toISOString(),
      safety: payload.safety
    };

    localStorage.setItem("smartwork_vps_last_submit", JSON.stringify(proof));
    status("Request dry-run masuk VPS queue: " + payload.jobId);
    window.dispatchEvent(new CustomEvent("smartwork:vps-submit-ok", { detail: proof }));
    return proof;
  }

  window.SmartWorkVpsApi = {
    base: API_BASE,
    health: readHealth,
    submitDryRun
  };

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    submitDryRun(form).catch((err) => {
      console.error("[SmartWork Phase 5V] VPS submit failed", err);
      status("VPS submit gagal: " + err.message, false);
    });
  }, true);

  document.addEventListener("DOMContentLoaded", () => {
    status("VPS API ready: " + API_BASE);
  });
})();
</script>
${end}`;

  const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  html = html.replace(new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, "g"), "");

  if (html.includes("</body>")) html = html.replace("</body>", `${bridge}\n</body>`);
  else html += `\n${bridge}\n`;

  write(file, html);
  return { file: rel(file), backup: rel(backup), bridgeInjected: true };
}

async function submitSmoke() {
  const jobId = `phase5v-terminal-dry-run-${Date.now()}`;

  const payload = {
    jobId,
    type: "siaga-attendance",
    source: "smartwork-phase5v-terminal-smoke",
    phase: "5V",
    mode: "SMARTWORK_PRODUCTION_QUEUE_API_NATIVE",
    dryRun: true,
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    requestedAt: new Date().toISOString(),
    request: {
      requesterName: "Nazrin Phase 5V Dry Run",
      email: "nazrinxl@gmail.com",
      whatsapp: "DRY_RUN_ONLY",
      module: "SIAGA",
      startDate: "2026-06-12",
      endDate: "2026-06-12",
      note: "Phase 5V dry-run queue submit proof only. No SIAGA input, no browser, no real save, no real send."
    },
    accounts: [
      {
        id: "guru-001",
        name: "Nazrin",
        username: "DRY_RUN_ONLY",
        password: "DRY_RUN_ONLY",
        startDate: "2026-06-12",
        endDate: "2026-06-12",
        dryRun: true
      }
    ],
    safety: {
      dryRun: true,
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true
    }
  };

  const paths = ["/api/smartwork/jobs", "/api/smartwork/jobs/submit", "/api/smartwork/jobs/enqueue"];
  let last = null;

  for (const p of paths) {
    const res = await fetchJson(`${VPS_API_BASE}${p}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SmartWork-Dry-Run": "true",
        "X-SmartWork-No-Siaga-Input": "true",
        "X-SmartWork-No-Browser-Open": "true",
        "X-SmartWork-No-Real-Save": "true",
        "X-SmartWork-No-Real-Send": "true"
      },
      body: JSON.stringify(payload)
    });

    last = res;
    if (res.ok) {
      return { ok: true, jobId, endpoint: p, response: res };
    }
  }

  return { ok: false, jobId, last };
}

async function main() {
  const healthBefore = await fetchJson(`${VPS_API_BASE}/api/smartwork/jobs/health`);
  if (!healthBefore.ok) throw new Error(`Health failed: HTTP ${healthBefore.status}`);
  assertSafeHealth(healthBefore.json);

  const requestHtml = pickRequestHtml();
  const patch = injectRequestBridge(requestHtml);

  const submit = await submitSmoke();

  await new Promise((resolve) => setTimeout(resolve, 1500));

  const healthAfter = await fetchJson(`${VPS_API_BASE}/api/smartwork/jobs/health`);
  if (!healthAfter.ok) throw new Error(`Health after submit failed: HTTP ${healthAfter.status}`);
  assertSafeHealth(healthAfter.json);

  let jobStatus = null;
  if (submit.ok) {
    jobStatus = await fetchJson(`${VPS_API_BASE}/api/smartwork/jobs/${submit.jobId}`).catch((err) => ({
      ok: false,
      error: err.message
    }));
  }

  const beforeCounts = getQueueCounts(healthBefore.json);
  const afterCounts = getQueueCounts(healthAfter.json);

  const report = {
    ok: Boolean(submit.ok),
    phase: "5V",
    releaseDecision: submit.ok ? "APP_CONNECTED_TO_DEWAVPS_DRY_RUN_QUEUE_SAFE" : "SUBMIT_ENDPOINT_NEEDS_CHECK",
    apiBase: VPS_API_BASE,
    healthUrl: `${VPS_API_BASE}/api/smartwork/jobs/health`,
    patch,
    submit,
    jobStatus,
    healthBefore: healthBefore.json,
    healthAfter: healthAfter.json,
    queueCountsBefore: beforeCounts,
    queueCountsAfter: afterCounts,
    safetyConfirmed: {
      dryRun: true,
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true
    },
    proofFiles: {
      report: "reports/smartwork-phase5v-vps-app-submit-report.json",
      checkpoint: "docs/checkpoints/smartwork-phase5v-vps-app-submit-report.json"
    },
    createdAt: new Date().toISOString()
  };

  write(reportPath, JSON.stringify(report, null, 2));
  write(checkpointPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({
    ok: report.ok,
    phase: report.phase,
    releaseDecision: report.releaseDecision,
    patched: patch.file,
    submitEndpoint: submit.endpoint || null,
    jobId: submit.jobId,
    queueCountsBefore: beforeCounts,
    queueCountsAfter: afterCounts,
    safetyConfirmed: report.safetyConfirmed,
    reportPath: rel(reportPath),
    checkpointPath: rel(checkpointPath)
  }, null, 2));

  if (!report.ok) process.exit(2);
}

main().catch((err) => {
  const fail = {
    ok: false,
    phase: "5V",
    releaseDecision: "PHASE5V_FAILED_BEFORE_SAFE_PROOF",
    apiBase: VPS_API_BASE,
    error: err.message,
    createdAt: new Date().toISOString()
  };
  write(reportPath, JSON.stringify(fail, null, 2));
  console.error(err);
  process.exit(1);
});
