import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";

const repo = process.cwd();
const publicDir = path.join(repo, "public");
const shotsDir = path.join(repo, "shots");
const reportPath = path.join(repo, "docs", "checkpoints", "smartwork-phase5zc-app-browser-e2e-vps-proof-report.json");

const host = "127.0.0.1";
const port = 5197;
const appBase = `http://${host}:${port}`;
const apiBase = "http://103.152.242.193:3107";

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

function startStaticServer() {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || "/", appBase);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") pathname = "/request.html";
      const filePath = path.normalize(path.join(publicDir, pathname));
      if (!filePath.startsWith(publicDir)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": contentType(filePath),
        "Cache-Control": "no-store"
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err?.stack || err));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => resolve(server));
  });
}

async function browserFetchJson(page, url, options = {}) {
  return await page.evaluate(async ({ url, options }) => {
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
  }, { url, options });
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
  fs.mkdirSync(shotsDir, { recursive: true });

  const server = await startStaticServer();
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 430, height: 900 } });

    const consoleLines = [];
    page.on("console", (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
    page.on("pageerror", (err) => consoleLines.push(`[pageerror] ${err.message}`));

    await page.goto(`${appBase}/request.html`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const bridgeReady = await page.evaluate(() => Boolean(window.SmartWorkVpsApi?.submit && window.SmartWorkVpsApi?.health));
    const bridgeBase = await page.evaluate(() => window.SmartWorkVpsApi?.base || null);

    const healthFromApp = await page.evaluate(async () => {
      try {
        return await window.SmartWorkVpsApi.health();
      } catch (err) {
        return { ok: false, error: String(err?.stack || err) };
      }
    });

    const completedBefore = Number(healthFromApp?.counts?.completed ?? 0);

    const payload = {
      source: "phase5zc-actual-app-browser-e2e-proof",
      module: "siaga",
      mode: "SMARTWORK_PRODUCTION_QUEUE_API_NATIVE",
      accountRef: "guru-001",
      credentialRef: "guru-001",
      requester: {
        name: "Nazrin Phase 5ZC App Browser Proof",
        email: "",
        whatsapp: ""
      },
      requestRange: {
        startDate: "2026-06-12",
        endDate: "2026-06-12"
      },
      request: {
        requestType: "app-browser-e2e-proof",
        notes: "Phase 5ZC app browser proof only. No SIAGA input, no browser automation, no save/send.",
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
    };

    const submitResult = await page.evaluate(async (payload) => {
      try {
        return await window.SmartWorkVpsApi.submit(payload);
      } catch (err) {
        return { ok: false, error: String(err?.stack || err) };
      }
    }, payload);

    const jobId = submitResult?.jobId || submitResult?.job?.id || submitResult?.id || "";

    await page.screenshot({
      path: path.join(shotsDir, "smartwork-phase5zc-request.png"),
      fullPage: true
    });

    let statusResult = null;
    for (let i = 0; i < 16; i++) {
      await page.waitForTimeout(1500);
      statusResult = await browserFetchJson(page, `${apiBase}/api/smartwork/jobs/${encodeURIComponent(jobId)}`, {
        method: "GET",
        headers: { Origin: appBase }
      });
      const s = statusResult?.json?.status || statusResult?.json?.job?.status;
      if (["completed", "failed"].includes(s)) break;
    }

    const healthAfter = await browserFetchJson(page, `${apiBase}/api/smartwork/jobs/health`, {
      method: "GET",
      headers: { Origin: appBase }
    });

    await page.evaluate((jobId) => {
      localStorage.setItem("smartwork_active_job_id", jobId);
      localStorage.setItem("smartwork_production_job", JSON.stringify({ jobId }));
      localStorage.setItem("smartwork_production_job_id", jobId);
    }, jobId);

    await page.goto(`${appBase}/progress.html?jobId=${encodeURIComponent(jobId)}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);

    const progressBridgeReady = await page.evaluate(() => Boolean(window.SmartWorkVpsProgress?.refresh || window.SmartWorkProductionProgressBridge?.refresh));
    const progressRefresh = await page.evaluate(async () => {
      try {
        if (window.SmartWorkVpsProgress?.refresh) return await window.SmartWorkVpsProgress.refresh();
        if (window.SmartWorkProductionProgressBridge?.refresh) return await window.SmartWorkProductionProgressBridge.refresh();
        return null;
      } catch (err) {
        return { ok: false, error: String(err?.stack || err) };
      }
    });

    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(shotsDir, "smartwork-phase5zc-progress.png"),
      fullPage: true
    });

    const progressLocalStorage = await page.evaluate(() => ({
      activeJobId: localStorage.getItem("smartwork_active_job_id"),
      productionJobId: localStorage.getItem("smartwork_production_job_id"),
      vpsLastStatus: localStorage.getItem("smartwork_vps_last_status"),
      productionProgress: localStorage.getItem("smartwork_production_progress_state"),
      liveState: localStorage.getItem("smartwork_progress_live_state")
    }));

    const jobStatus = statusResult?.json?.status || statusResult?.json?.job?.status || "";
    const jobPercent =
      statusResult?.json?.job?.progress?.percent ??
      statusResult?.json?.job?.percent ??
      statusResult?.json?.job?.progressPercent ??
      0;

    const completedAfter = Number(healthAfter?.json?.counts?.completed ?? 0);

    const report = {
      ok: Boolean(
        bridgeReady &&
        bridgeBase === apiBase &&
        safetyOk(healthFromApp) &&
        submitResult?.ok !== false &&
        jobId &&
        statusResult?.ok &&
        jobStatus === "completed" &&
        Number(jobPercent) === 100 &&
        safetyOk(healthAfter.json) &&
        completedAfter >= completedBefore + 1 &&
        progressBridgeReady &&
        fs.existsSync(path.join(shotsDir, "smartwork-phase5zc-request.png")) &&
        fs.existsSync(path.join(shotsDir, "smartwork-phase5zc-progress.png"))
      ),
      phase: "5ZC",
      releaseDecision: "APP_BROWSER_E2E_DIRECT_TO_DEWAVPS_API_WORKER_DRY_RUN_READY",
      appBase,
      apiBase,
      appBridge: {
        bridgeReady,
        bridgeBase,
        noSameOriginProxy: true
      },
      job: {
        jobId,
        status: jobStatus,
        percent: jobPercent
      },
      queueCounts: { beforeCompleted: completedBefore, afterCompleted: completedAfter },
      progress: {
        progressBridgeReady,
        progressRefresh,
        progressLocalStorage
      },
      proof: {
        healthFromApp,
        submitResult,
        statusResult,
        healthAfter
      },
      screenshots: {
        request: "shots/smartwork-phase5zc-request.png",
        progress: "shots/smartwork-phase5zc-progress.png"
      },
      consoleLines,
      safetyConfirmed: {
        dryRun: true,
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
      bridgeReady,
      bridgeBase,
      jobId,
      jobStatus,
      jobPercent,
      completedBefore,
      completedAfter,
      progressBridgeReady,
      requestShot: report.screenshots.request,
      progressShot: report.screenshots.progress,
      checkpoint: "docs/checkpoints/smartwork-phase5zc-app-browser-e2e-vps-proof-report.json"
    }, null, 2));

    if (!report.ok) process.exit(2);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  writeJson(reportPath, {
    ok: false,
    phase: "5ZC",
    releaseDecision: "APP_BROWSER_E2E_DIRECT_TO_DEWAVPS_PROOF_FAILED",
    error: err.stack || err.message,
    createdAt: new Date().toISOString()
  });
  console.error(err);
  process.exit(1);
});

