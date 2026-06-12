import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const repo = process.cwd();
const publicDir = path.join(repo, "public");
const apiBase = "http://103.152.242.193:3107";
const localBase = "http://127.0.0.1:5197";
const proxyBase = `${localBase}/__smartwork_vps_proxy`;
const phase = "5W";

const reportPath = path.join(repo, "reports", "smartwork-phase5w-app-runtime-vps-proof-report.json");
const checkpointPath = path.join(repo, "docs", "checkpoints", "smartwork-phase5w-app-runtime-vps-proof-report.json");
const requestShot = path.join(repo, "shots", "smartwork-phase5w-runtime-request.png");
const progressShot = path.join(repo, "shots", "smartwork-phase5w-runtime-progress.png");

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, url, json, text: text.slice(0, 2000) };
}

function counts(health) {
  return health?.counts || health?.queueCounts || health?.queue?.counts || {};
}

function assertSafe(health) {
  const safety = health?.safety || {};
  const required = ["dryRun", "noSiagaInput", "noBrowserOpen", "noRealSave", "noRealSend"];
  const bad = required.filter((key) => safety[key] !== true);
  if (bad.length) throw new Error("VPS safety failed: " + bad.join(", "));
  return Object.fromEntries(required.map((key) => [key, true]));
}

function patchProgressBridge() {
  const file = path.join(publicDir, "progress.html");
  if (!fs.existsSync(file)) throw new Error("public/progress.html not found.");

  const start = "<!-- SMARTWORK_PHASE5W_PROGRESS_VPS_STATUS_BRIDGE_START -->";
  const end = "<!-- SMARTWORK_PHASE5W_PROGRESS_VPS_STATUS_BRIDGE_END -->";

  const bridge = `${start}
<script id="smartwork-phase5w-progress-vps-status-bridge">
(() => {
  const PHASE = "5W";
  const DEFAULT_API_BASE = "http://103.152.242.193:3107";
  const API_BASE = (localStorage.getItem("smartwork_vps_api_base") || DEFAULT_API_BASE).replace(/\\/+$/, "");
  localStorage.setItem("smartwork_vps_api_base", API_BASE);

  function getJobId() {
    const direct = localStorage.getItem("smartwork_active_job_id");
    if (direct) return direct;
    try {
      return JSON.parse(localStorage.getItem("smartwork_vps_last_submit") || "{}").jobId || "";
    } catch {
      return "";
    }
  }

  function box() {
    let el = document.getElementById("smartwork-phase5w-vps-progress");
    if (!el) {
      el = document.createElement("section");
      el.id = "smartwork-phase5w-vps-progress";
      el.style.cssText = "margin:12px;padding:12px;border:1px solid #dbeafe;background:#eff6ff;border-radius:16px;color:#1e3a8a;font:12px/1.45 system-ui;";
      el.innerHTML = "<div style='font-weight:700;margin-bottom:4px'>VPS Queue Status</div><div data-smartwork-vps-text>Menunggu job VPS...</div>";
      (document.querySelector("main,.container,.app") || document.body).appendChild(el);
    }
    return el;
  }

  function render(message, ok = true) {
    const el = box();
    const text = el.querySelector("[data-smartwork-vps-text]") || el;
    text.textContent = message;
    el.dataset.ok = ok ? "true" : "false";
  }

  async function readStatus() {
    const jobId = getJobId();
    if (!jobId) {
      render("Belum ada job VPS aktif dari request app.", false);
      return null;
    }

    const res = await fetch(API_BASE + "/api/smartwork/jobs/" + encodeURIComponent(jobId), {
      method: "GET",
      mode: "cors"
    });

    const json = await res.json();
    const job = json.job || json;
    const percent = job.progress?.percent ?? job.percent ?? job.progressPercent ?? job.percentage ?? 0;
    const status = json.status || job.status || job.state || "unknown";
    const stage = job.progress?.stage || job.phase || status;
    const message = job.progress?.message || "Status job VPS terbaca dari app.";

    const proof = {
      ok: Boolean(json.ok),
      phase: PHASE,
      apiBase: API_BASE,
      jobId,
      status,
      stage,
      percent,
      message,
      safety: json.safety || job.safety || {},
      readAt: new Date().toISOString()
    };

    localStorage.setItem("smartwork_vps_last_status", JSON.stringify(proof));
    render("Job " + jobId + " — " + status + " — " + percent + "% — " + message, Boolean(json.ok));
    window.dispatchEvent(new CustomEvent("smartwork:vps-status-ok", { detail: proof }));
    return proof;
  }

  window.SmartWorkVpsProgress = { base: API_BASE, readStatus };

  document.addEventListener("DOMContentLoaded", () => {
    render("Membaca status VPS queue...");
    readStatus().catch((err) => render("Gagal membaca VPS status: " + err.message, false));
    setInterval(() => readStatus().catch((err) => render("Gagal membaca VPS status: " + err.message, false)), 5000);
  });
})();
</script>
${end}`;

  let html = fs.readFileSync(file, "utf8");
  const re = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`, "g");
  html = html.replace(re, "");
  html = html.includes("</body>") ? html.replace("</body>", `${bridge}\n</body>`) : html + "\n" + bridge;
  fs.writeFileSync(file, html);
  return "public/progress.html";
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function startStaticServerWithProxy() {
  const server = http.createServer(async (req, res) => {
    try {
      const rawUrl = new URL(req.url || "/", localBase);

      if (rawUrl.pathname.startsWith("/__smartwork_vps_proxy/")) {
        const targetPath = rawUrl.pathname.replace("/__smartwork_vps_proxy", "");
        const targetUrl = apiBase + targetPath + rawUrl.search;

        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;

        const headers = { ...req.headers };
        delete headers.host;
        delete headers.origin;
        delete headers.referer;
        delete headers.connection;
        delete headers["content-length"];

        const upstream = await fetch(targetUrl, {
          method: req.method,
          headers,
          body: ["GET", "HEAD"].includes(req.method || "GET") ? undefined : body
        });

        const text = await upstream.text();

        res.writeHead(upstream.status, {
          "Content-Type": upstream.headers.get("content-type") || "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, X-SmartWork-Dry-Run, X-SmartWork-No-Siaga-Input, X-SmartWork-No-Browser-Open, X-SmartWork-No-Real-Save, X-SmartWork-No-Real-Send",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        });
        res.end(text);
        return;
      }

      let pathname = decodeURIComponent(rawUrl.pathname);
      if (pathname === "/") pathname = "/request.html";

      const file = path.normalize(path.join(publicDir, pathname));
      if (!file.startsWith(publicDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      res.writeHead(200, { "Content-Type": contentType(file), "Cache-Control": "no-store" });
      fs.createReadStream(file).pipe(res);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(err.stack || err.message);
    }
  });

  return new Promise((resolve) => server.listen(5197, "127.0.0.1", () => resolve(server)));
}

async function main() {
  const healthBefore = await fetchJson(`${apiBase}/api/smartwork/jobs/health`);
  if (!healthBefore.ok) throw new Error("Direct VPS health from Node failed: HTTP " + healthBefore.status);
  const safetyBefore = assertSafe(healthBefore.json);

  const patchedProgress = patchProgressBridge();

  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (err) {
    throw new Error("Playwright belum tersedia untuk runtime app proof: " + err.message);
  }

  const server = await startStaticServerWithProxy();
  const browser = await chromium.launch({ headless: true }).catch(() => chromium.launch({ headless: true, channel: "chrome" }));

  let directBrowserCorsCheck = null;
  let submitProof = null;
  let progressProof = null;

  try {
    const page = await browser.newPage({ viewport: { width: 430, height: 900 } });

    await page.addInitScript((base) => {
      localStorage.setItem("smartwork_vps_api_base", base);
    }, proxyBase);

    await page.goto(`${localBase}/request.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.SmartWorkVpsApi?.submitDryRun), null, { timeout: 10000 });

    directBrowserCorsCheck = await page.evaluate(async (directBase) => {
      try {
        const res = await fetch(directBase + "/api/smartwork/jobs/health", { method: "GET", mode: "cors" });
        return { ok: true, status: res.status, corsDirectWorks: true };
      } catch (err) {
        return { ok: false, corsDirectWorks: false, error: err.message };
      }
    }, apiBase);

    submitProof = await page.evaluate(async () => {
      const form = document.querySelector("form") || document.body.appendChild(document.createElement("form"));

      const values = {
        requesterName: "Nazrin Phase 5W Runtime UI",
        name: "Nazrin",
        email: "nazrinxl@gmail.com",
        whatsapp: "DRY_RUN_ONLY",
        accountId: "guru-001",
        startDate: "2026-06-12",
        endDate: "2026-06-12",
        requestType: "bulk-monthly",
        notes: "Phase 5W app runtime proof via same-origin VPS proxy. No SIAGA input, no worker browser, no real save, no real send."
      };

      for (const [name, value] of Object.entries(values)) {
        let input = form.querySelector("[name='" + name + "']");
        if (!input) {
          input = document.createElement("input");
          input.name = name;
          input.type = "hidden";
          form.appendChild(input);
        }
        input.value = value;
      }

      return await window.SmartWorkVpsApi.submitDryRun(form);
    });

    await page.screenshot({ path: requestShot, fullPage: true });

    if (!submitProof?.jobId) throw new Error("Runtime app submit did not return jobId.");

    await page.waitForTimeout(2000);
    await page.goto(`${localBase}/progress.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.SmartWorkVpsProgress?.readStatus), null, { timeout: 10000 });

    progressProof = await page.evaluate(async () => window.SmartWorkVpsProgress.readStatus());
    await page.waitForTimeout(500);
    await page.screenshot({ path: progressShot, fullPage: true });
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }

  const jobStatus = await fetchJson(`${apiBase}/api/smartwork/jobs/${encodeURIComponent(submitProof.jobId)}`);
  const healthAfter = await fetchJson(`${apiBase}/api/smartwork/jobs/health`);
  if (!healthAfter.ok) throw new Error("Health after failed: HTTP " + healthAfter.status);
  const safetyAfter = assertSafe(healthAfter.json);

  const job = jobStatus.json?.job || {};
  const status = jobStatus.json?.status || job.status || "";
  const percent = job.progress?.percent ?? job.percent ?? job.progressPercent ?? job.percentage ?? 0;

  const report = {
    ok: Boolean(
      submitProof?.ok &&
      submitProof?.jobId &&
      jobStatus.ok &&
      ["pending", "running", "completed"].includes(String(status)) &&
      progressProof?.ok &&
      progressProof?.jobId === submitProof.jobId
    ),
    phase,
    releaseDecision: "APP_RUNTIME_SUBMIT_TO_DEWAVPS_QUEUE_AND_PROGRESS_STATUS_SAFE_PROXY_PROOF",
    apiBase,
    runtimeTransport: {
      browserDirectToVps: directBrowserCorsCheck,
      usedSameOriginProofProxy: true,
      proxyBase,
      note: "Direct browser fetch is expected to fail until Phase 5X enables production CORS/HTTPS. This proof still submits from app runtime through same-origin proxy to VPS API."
    },
    patched: { progress: patchedProgress },
    runtime: {
      appUrl: `${localBase}/request.html`,
      progressUrl: `${localBase}/progress.html`,
      appBrowserOnly: true,
      noSiagaBrowserAutomation: true,
      submitProof,
      progressProof
    },
    jobStatus: jobStatus.json,
    statusSummary: {
      jobId: submitProof?.jobId || "",
      status,
      percent,
      queueCountsBefore: counts(healthBefore.json),
      queueCountsAfter: counts(healthAfter.json)
    },
    safetyConfirmed: {
      before: safetyBefore,
      after: safetyAfter,
      noSiagaInput: true,
      noWorkerBrowserOpen: true,
      noRealSave: true,
      noRealSend: true
    },
    screenshots: {
      request: "shots/smartwork-phase5w-runtime-request.png",
      progress: "shots/smartwork-phase5w-runtime-progress.png"
    },
    proofFiles: {
      report: "reports/smartwork-phase5w-app-runtime-vps-proof-report.json",
      checkpoint: "docs/checkpoints/smartwork-phase5w-app-runtime-vps-proof-report.json"
    },
    nextPhase: "Phase 5X: enable production CORS/HTTPS or serve app same-origin with VPS API for real HP submit.",
    createdAt: new Date().toISOString()
  };

  writeJson(reportPath, report);
  writeJson(checkpointPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    phase: report.phase,
    releaseDecision: report.releaseDecision,
    jobId: report.statusSummary.jobId,
    status: report.statusSummary.status,
    percent: report.statusSummary.percent,
    queueCountsBefore: report.statusSummary.queueCountsBefore,
    queueCountsAfter: report.statusSummary.queueCountsAfter,
    browserDirectToVps: report.runtimeTransport.browserDirectToVps,
    usedSameOriginProofProxy: report.runtimeTransport.usedSameOriginProofProxy,
    screenshots: report.screenshots,
    checkpoint: "docs/checkpoints/smartwork-phase5w-app-runtime-vps-proof-report.json"
  }, null, 2));

  if (!report.ok) process.exit(2);
}

main().catch((err) => {
  const fail = {
    ok: false,
    phase,
    releaseDecision: "PHASE5W_RUNTIME_PROXY_PROOF_FAILED",
    error: err.stack || err.message,
    apiBase,
    createdAt: new Date().toISOString()
  };
  writeJson(reportPath, fail);
  writeJson(checkpointPath, fail);
  console.error(err);
  process.exit(1);
});
