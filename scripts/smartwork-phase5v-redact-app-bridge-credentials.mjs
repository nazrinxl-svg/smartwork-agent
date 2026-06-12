import fs from "node:fs";
import path from "node:path";

const files = [
  path.join(process.cwd(), "public", "request.html"),
  path.join(process.cwd(), "scripts", "smartwork-phase5v-connect-app-to-vps-api.mjs")
];

const bridgeStart = "<!-- SMARTWORK_PHASE5V_VPS_API_BRIDGE_START -->";
const bridgeEnd = "<!-- SMARTWORK_PHASE5V_VPS_API_BRIDGE_END -->";

const cleanBridge = `${bridgeStart}
<script id="smartwork-phase5v-vps-api-bridge">
(() => {
  const PHASE = "5V";
  const DEFAULT_API_BASE = "http://103.152.242.193:3107";
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

  function safeCopy(input) {
    const out = {};
    for (const [key, value] of Object.entries(input || {})) {
      const k = String(key).toLowerCase();
      if (k.includes("pass") || k.includes("secret") || k.includes("token")) continue;
      out[key] = value;
    }
    out.redacted = true;
    return out;
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
    const safeRequest = safeCopy(merged);
    const startDate = merged.startDate || merged.dariTanggal || merged.fromDate || merged.tanggalMulai || merged["start-date"] || "";
    const endDate = merged.endDate || merged.keTanggal || merged.toDate || merged.tanggalSelesai || merged["end-date"] || "";
    const accountRef = merged.accountId || merged.teacherId || "guru-001";
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
      request: {
        ...safeRequest,
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
          id: accountRef,
          name: merged.name || merged.nama || merged.requesterName || "Nazrin",
          email: merged.email || "",
          whatsapp: merged.whatsapp || merged.wa || "",
          accountRef,
          credentialRef: accountRef,
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

    for (const apiPath of SUBMIT_PATHS) {
      try {
        const res = await fetch(API_BASE + apiPath, {
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

        if (res.ok) return { ok: true, path: apiPath, status: res.status, json, text };
        lastError = new Error(apiPath + " returned HTTP " + res.status + " " + text.slice(0, 300));
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

  window.SmartWorkVpsApi = { base: API_BASE, health: readHealth, submitDryRun };

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    submitDryRun(form).catch((err) => {
      console.error("[SmartWork Phase 5V] VPS submit failed", err);
      status("VPS submit gagal: " + err.message, false);
    });
  }, true);

  document.addEventListener("DOMContentLoaded", () => status("VPS API ready: " + API_BASE));
})();
</script>
${bridgeEnd}`;

const htmlFile = files[0];
let html = fs.readFileSync(htmlFile, "utf8");
const re = new RegExp(`${bridgeStart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${bridgeEnd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");
if (!re.test(html)) throw new Error("Phase 5V bridge marker not found in public/request.html");
html = html.replace(re, cleanBridge);
fs.writeFileSync(htmlFile, html);

const scriptFile = files[1];
let script = fs.readFileSync(scriptFile, "utf8");
script = script
  .replace(/username:\s*merged\.username\s*\|\|\s*merged\.siagaUsername\s*\|\|\s*"DRY_RUN_ONLY",?\n/g, "")
  .replace(/password:\s*merged\.password\s*\|\|\s*merged\.siagaPassword\s*\|\|\s*"DRY_RUN_ONLY",?\n/g, "")
  .replace(/const SUBMIT_PATHS = \[\s*"\/api\/smartwork\/jobs",\s*"\/api\/smartwork\/jobs\/submit",\s*"\/api\/smartwork\/jobs\/enqueue"\s*\];/g, 'const SUBMIT_PATHS = ["/api/smartwork/jobs"];');

fs.writeFileSync(scriptFile, script);

console.log(JSON.stringify({
  ok: true,
  patched: ["public/request.html", "scripts/smartwork-phase5v-connect-app-to-vps-api.mjs"],
  credentialRedaction: "raw credential fields removed from app bridge payload"
}, null, 2));
