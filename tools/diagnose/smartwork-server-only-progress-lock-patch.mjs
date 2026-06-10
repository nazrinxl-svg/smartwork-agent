import fs from "fs";
import path from "path";

const ROOT = process.cwd();

const serverPath = path.join(ROOT, "app", "smartwork-control-server.mjs");
const requestPath = path.join(ROOT, "public", "request.html");
const progressPath = path.join(ROOT, "public", "progress.html");

function read(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function patchServer() {
  let s = read(serverPath);

  if (!s.includes("const RUNNER_LOCK_PATH")) {
    s = s.replace(
      'const JOB_DIR = path.join(ROOT, "data", "jobs");',
      'const JOB_DIR = path.join(ROOT, "data", "jobs");\nconst RUNNER_LOCK_PATH = path.join(ROOT, "data", "smartwork-runner.lock.json");'
    );
  }

  if (!s.includes("function removeRunnerLock")) {
    const insertAfter = `function saveJob(job) {
  ensureJobDir();

  const filePath = path.join(
    JOB_DIR,
    \`\${job.jobId}.json\`
  );

  fs.writeFileSync(
    filePath,
    JSON.stringify(job, null, 2),
    "utf8"
  );

  return filePath;
}
`;

    const lockHelpers = `
function readRunnerLock() {
  if (!fs.existsSync(RUNNER_LOCK_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(RUNNER_LOCK_PATH, "utf8").replace(/^\\uFEFF/, ""));
  } catch {
    return null;
  }
}

function writeRunnerLock(job) {
  fs.mkdirSync(path.dirname(RUNNER_LOCK_PATH), { recursive: true });
  fs.writeFileSync(
    RUNNER_LOCK_PATH,
    JSON.stringify({
      locked: true,
      jobId: job?.jobId || null,
      status: job?.status || null,
      startedAt: new Date().toISOString(),
      reason: "SmartWork runner sedang berjalan. Mencegah double-run."
    }, null, 2),
    "utf8"
  );
}

function removeRunnerLock() {
  try {
    if (fs.existsSync(RUNNER_LOCK_PATH)) fs.unlinkSync(RUNNER_LOCK_PATH);
  } catch {}
}

function isRunnerLockActive(maxAgeMinutes = 45) {
  const lock = readRunnerLock();
  if (!lock?.startedAt) return false;
  const ageMs = Date.now() - new Date(lock.startedAt).getTime();
  return ageMs >= 0 && ageMs < maxAgeMinutes * 60 * 1000;
}

`;

    if (!s.includes(insertAfter)) {
      throw new Error("Tidak menemukan blok saveJob untuk insert runner lock helpers.");
    }
    s = s.replace(insertAfter, insertAfter + lockHelpers);
  }

  if (!s.includes("function generateProgressIntelligence")) {
    const marker = "function handleDownloadsLatest(req, res) {";
    const progressFunctions = `
function generateProgressIntelligence() {
  const scriptPath = path.join(ROOT, "scripts", "smartwork-progress-intelligence-agent.mjs");
  if (!fs.existsSync(scriptPath)) return null;

  return new Promise((resolve) => {
    const child = spawn("node", [scriptPath], {
      cwd: ROOT,
      shell: true,
      stdio: "ignore"
    });

    child.on("exit", () => resolve(true));
    child.on("error", () => resolve(false));
  });
}

async function handleProgressIntelligence(req, res) {
  await generateProgressIntelligence();

  const progressPath = path.join(ROOT, "reports", "progress", "smartwork-progress-intelligence-report.json");
  const progress = readJsonSafe(progressPath);

  if (!progress) {
    sendJson(res, 200, {
      ok: false,
      stage: "UNKNOWN",
      stageText: "Progress intelligence belum tersedia.",
      tone: "warning",
      progressSteps: []
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    progress,
    runnerLock: readRunnerLock()
  });
}

`;
    if (!s.includes(marker)) {
      throw new Error("Tidak menemukan marker handleDownloadsLatest untuk insert progress intelligence handler.");
    }
    s = s.replace(marker, progressFunctions + marker);
  }

  if (!s.includes('if (req.method === "GET" && req.url === "/api/progress/intelligence")')) {
    const routeMarker = `  if (req.method === "GET" && req.url === "/api/downloads/latest") {
    handleDownloadsLatest(req, res);
    return;
  }`;

    const newRoute = `  if (req.method === "GET" && req.url === "/api/progress/intelligence") {
    await handleProgressIntelligence(req, res);
    return;
  }

${routeMarker}`;

    if (!s.includes(routeMarker)) {
      throw new Error("Tidak menemukan route marker /api/downloads/latest.");
    }
    s = s.replace(routeMarker, newRoute);
  }

  if (!s.includes("DOUBLE_RUN_PROTECTED_BY_LOCK")) {
    const startMarker = `async function handleStartJob(req, res) {

  const latestFiles = fs.readdirSync(JOB_DIR)`;

    const replacement = `async function handleStartJob(req, res) {
  // DOUBLE_RUN_PROTECTED_BY_LOCK
  if (isRunnerLockActive()) {
    sendJson(res, 409, {
      ok: false,
      error: "Runner SmartWork sedang berjalan. Tunggu proses selesai agar tidak double-run.",
      runnerLock: readRunnerLock()
    });
    return;
  }

  const latestFiles = fs.readdirSync(JOB_DIR)`;

    if (!s.includes(startMarker)) {
      throw new Error("Tidak menemukan awal handleStartJob.");
    }
    s = s.replace(startMarker, replacement);
  }

  if (!s.includes("writeRunnerLock(job);")) {
    const spawnMarker = `  const child = spawn("node", ["scripts/smartwork-v6-auto-request-pipeline.mjs"], {`;
    if (!s.includes(spawnMarker)) {
      throw new Error("Tidak menemukan spawn runner marker.");
    }
    s = s.replace(spawnMarker, `  writeRunnerLock(job);\n\n${spawnMarker}`);
  }

  if (!s.includes("removeRunnerLock();\n    if (fresh.status === \"COMPLETED\"")) {
    s = s.replace(
      `    if (fresh.status === "COMPLETED" || fresh.status === "RESULT_READY") {
      return;
    }`,
      `    if (fresh.status === "COMPLETED" || fresh.status === "RESULT_READY") {
      removeRunnerLock();
      return;
    }`
    );
  }

  if (!s.includes("removeRunnerLock();\n    if (code === 0)")) {
    s = s.replace(
      `    if (code === 0) {
      fresh.status = "COMPLETED";`,
      `    removeRunnerLock();

    if (code === 0) {
      fresh.status = "COMPLETED";`
    );
  }

  if (!s.includes("removeRunnerLock();\n    fs.writeFileSync(filePath, JSON.stringify(fresh, null, 2), \"utf8\");\n  });\n\n  sendJson")) {
    s = s.replace(
      `    fs.writeFileSync(filePath, JSON.stringify(fresh, null, 2), "utf8");
  });

  sendJson(res, 200, {`,
      `    removeRunnerLock();
    fs.writeFileSync(filePath, JSON.stringify(fresh, null, 2), "utf8");
  });

  sendJson(res, 200, {`
    );
  }

  write(serverPath, s);
}

function patchRequestNoLocalStorage() {
  let html = read(requestPath);

  if (!html.includes("SMARTWORK_SERVER_ONLY_MODE")) {
    html = html.replace(
      /localStorage\.setItem\s*\(/g,
      'console.info("SMARTWORK_SERVER_ONLY_MODE: skip localStorage.setItem", '
    );

    html = html.replace(
      "</body>",
      `
<script>
  window.SMARTWORK_SERVER_ONLY_MODE = true;
  console.info("SmartWork server-only mode aktif: request dikirim ke server, tidak disimpan di localStorage.");
</script>
</body>`
    );
  }

  write(requestPath, html);
}

function patchProgressUi() {
  let html = read(progressPath);

  if (html.includes("smartwork-progress-intelligence-panel")) {
    write(progressPath, html);
    return;
  }

  const panel = `
<section id="smartwork-progress-intelligence-panel" style="margin:12px 12px 90px;padding:14px;border:1px solid #dbeafe;border-radius:18px;background:#ffffff;box-shadow:0 8px 24px rgba(15,23,42,.06);font-family:'Plus Jakarta Sans',system-ui,sans-serif;">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
    <div>
      <div style="font-size:11px;color:#64748b;">SmartWork Agent</div>
      <div id="swpi-stage" style="font-size:14px;font-weight:700;color:#0f172a;">Memuat progress...</div>
    </div>
    <span id="swpi-badge" style="font-size:10px;padding:5px 8px;border-radius:999px;background:#eff6ff;color:#2563eb;">SYNC</span>
  </div>

  <div id="swpi-meta" style="margin-top:8px;font-size:11px;color:#475569;line-height:1.5;"></div>
  <div id="swpi-steps" style="margin-top:12px;display:grid;gap:8px;"></div>
  <div id="swpi-actions" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;"></div>
</section>

<script>
(function(){
  async function loadProgressIntelligence(){
    const stageEl = document.getElementById("swpi-stage");
    const badgeEl = document.getElementById("swpi-badge");
    const metaEl = document.getElementById("swpi-meta");
    const stepsEl = document.getElementById("swpi-steps");
    const actionsEl = document.getElementById("swpi-actions");
    if (!stageEl || !stepsEl) return;

    try {
      const res = await fetch("/api/progress/intelligence", { cache: "no-store" });
      const data = await res.json();
      const p = data.progress || data;

      stageEl.textContent = p.stageText || "Progress belum tersedia";
      badgeEl.textContent = p.stage || "UNKNOWN";

      const toneBg = p.tone === "success" ? "#dcfce7" : p.tone === "danger" ? "#fee2e2" : "#eff6ff";
      const toneFg = p.tone === "success" ? "#166534" : p.tone === "danger" ? "#991b1b" : "#2563eb";
      badgeEl.style.background = toneBg;
      badgeEl.style.color = toneFg;

      const job = p.job || {};
      metaEl.innerHTML =
        "<b>" + (job.service || "SIAGA").toUpperCase() + "</b>" +
        " · " + (job.teacherName || job.teacherId || "-") +
        " · " + (job.targetMonth || "-") + " " + (job.targetYear || "") +
        "<br>Rentang: " + (job.startDate || "-") + " s.d. " + (job.endDate || "-");

      stepsEl.innerHTML = (p.progressSteps || []).map(function(step){
        const mark = step.done ? "✓" : "•";
        const bg = step.done ? "#f0fdf4" : "#f8fafc";
        const color = step.done ? "#166534" : "#64748b";
        return '<div style="display:flex;gap:8px;align-items:flex-start;padding:9px 10px;border:1px solid #e2e8f0;border-radius:14px;background:'+bg+';">' +
          '<div style="width:20px;height:20px;border-radius:999px;background:#fff;display:grid;place-items:center;font-size:11px;color:'+color+';border:1px solid #cbd5e1;">'+mark+'</div>' +
          '<div style="min-width:0;">' +
            '<div style="font-size:12px;color:#0f172a;">'+(step.label || "-")+'</div>' +
            '<div style="font-size:10px;color:#64748b;word-break:break-word;">'+(step.detail || "")+'</div>' +
          '</div>' +
        '</div>';
      }).join("");

      const pdf = p.summaries && p.summaries.pdfDownload;
      const proof = p.summaries && p.summaries.proofReport;
      const buttons = [];

      if (pdf && pdf.savedAs) {
        buttons.push('<a href="/api/download?file='+encodeURIComponent(pdf.savedAs.replace(/\\\\/g,"/"))+'" style="text-decoration:none;font-size:11px;padding:8px 10px;border-radius:12px;background:#2563eb;color:white;">Download PDF</a>');
      }

      if (proof && proof.pdfFound) {
        buttons.push('<button type="button" style="font-size:11px;padding:8px 10px;border-radius:12px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;">Bukti siap</button>');
      }

      actionsEl.innerHTML = buttons.join("");
    } catch (error) {
      stageEl.textContent = "Progress belum bisa dimuat";
      badgeEl.textContent = "ERROR";
      metaEl.textContent = error.message || String(error);
    }
  }

  loadProgressIntelligence();
  setInterval(loadProgressIntelligence, 5000);
})();
</script>
`;

  html = html.replace("</body>", panel + "\n</body>");
  write(progressPath, html);
}

patchServer();
patchRequestNoLocalStorage();
patchProgressUi();

console.log(JSON.stringify({
  ok: true,
  patched: [
    "app/smartwork-control-server.mjs",
    "public/request.html",
    "public/progress.html"
  ],
  policy: "SERVER_ONLY_REQUEST_NO_LOCALSTORAGE",
  added: [
    "GET /api/progress/intelligence",
    "runner lock",
    "progress intelligence panel"
  ]
}, null, 2));
