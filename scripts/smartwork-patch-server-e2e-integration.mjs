import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const serverPath = path.join(ROOT, "app", "smartwork-control-server.mjs");

if (!fs.existsSync(serverPath)) {
  throw new Error("app/smartwork-control-server.mjs tidak ditemukan.");
}

let src = fs.readFileSync(serverPath, "utf8");

if (src.includes("SMARTWORK_E2E_SERVER_INTEGRATION_V1")) {
  console.log("SERVER_E2E_INTEGRATION=already_present");
  process.exit(0);
}

if (!src.includes("app.") || !src.match(/\.listen\s*\(/)) {
  throw new Error("Server file tidak terlihat seperti Express app dengan listen(). Stop supaya tidak patch ngawur.");
}

const block = `

/* SMARTWORK_E2E_SERVER_INTEGRATION_V1 */
const __smartworkE2eState = globalThis.__smartworkE2eState || {
  running: false,
  startedAt: null,
  endedAt: null,
  exitCode: null,
  lastError: null,
  lastRunId: null
};
globalThis.__smartworkE2eState = __smartworkE2eState;

async function __smartworkReadJsonSafe(file, fallback = null) {
  try {
    const fsMod = await import("fs");
    if (!fsMod.existsSync(file)) return fallback;
    return JSON.parse(fsMod.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function __smartworkWriteTextAppend(file, text) {
  const fsMod = await import("fs");
  const pathMod = await import("path");
  fsMod.mkdirSync(pathMod.dirname(file), { recursive: true });
  fsMod.appendFileSync(file, text, "utf8");
}

async function __smartworkLatestProgressPayload() {
  const pathMod = await import("path");
  const root = process.cwd();

  const finalProgressPath = pathMod.join(root, "reports", "smartwork-final-progress-report.json");
  const runnerReportPath = pathMod.join(root, "reports", "smartwork-siaga-e2e-runner-report.json");
  const syncReportPath = pathMod.join(root, "reports", "smartwork-sync-latest-request-report.json");

  const finalProgress = await __smartworkReadJsonSafe(finalProgressPath, null);
  const runnerReport = await __smartworkReadJsonSafe(runnerReportPath, null);
  const syncReport = await __smartworkReadJsonSafe(syncReportPath, null);

  return {
    ok: true,
    state: __smartworkE2eState,
    finalProgress,
    runnerReport,
    syncReport,
    files: {
      finalProgress: "reports/smartwork-final-progress-report.json",
      runnerReport: "reports/smartwork-siaga-e2e-runner-report.json",
      syncReport: "reports/smartwork-sync-latest-request-report.json"
    }
  };
}

async function __smartworkStartSiagaE2e(req, res) {
  if (__smartworkE2eState.running) {
    return res.status(409).json({
      ok: false,
      message: "SmartWork SIAGA E2E runner masih berjalan.",
      state: __smartworkE2eState
    });
  }

  const pathMod = await import("path");
  const { spawn } = await import("child_process");
  const root = process.cwd();

  const runId = "smartwork-e2e-" + new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = pathMod.join(root, "reports", "smartwork-siaga-e2e-server-run.log");

  __smartworkE2eState.running = true;
  __smartworkE2eState.startedAt = new Date().toISOString();
  __smartworkE2eState.endedAt = null;
  __smartworkE2eState.exitCode = null;
  __smartworkE2eState.lastError = null;
  __smartworkE2eState.lastRunId = runId;

  await __smartworkWriteTextAppend(logFile, "\\n\\n=== " + runId + " START " + __smartworkE2eState.startedAt + " ===\\n");

  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCmd, ["run", "smartwork:siaga:e2e"], {
    cwd: root,
    shell: false,
    env: {
      ...process.env,
      SMARTWORK_E2E_TRIGGER: "server",
      SMARTWORK_E2E_RUN_ID: runId
    }
  });

  child.stdout.on("data", async (buf) => {
    const s = String(buf);
    process.stdout.write(s);
    await __smartworkWriteTextAppend(logFile, s);
  });

  child.stderr.on("data", async (buf) => {
    const s = String(buf);
    process.stderr.write(s);
    await __smartworkWriteTextAppend(logFile, s);
  });

  child.on("error", async (err) => {
    __smartworkE2eState.running = false;
    __smartworkE2eState.endedAt = new Date().toISOString();
    __smartworkE2eState.exitCode = -1;
    __smartworkE2eState.lastError = String(err?.stack || err?.message || err);
    await __smartworkWriteTextAppend(logFile, "\\nERROR: " + __smartworkE2eState.lastError + "\\n");
  });

  child.on("close", async (code) => {
    __smartworkE2eState.running = false;
    __smartworkE2eState.endedAt = new Date().toISOString();
    __smartworkE2eState.exitCode = code;
    await __smartworkWriteTextAppend(logFile, "\\n=== " + runId + " END exit=" + code + " " + __smartworkE2eState.endedAt + " ===\\n");
  });

  return res.json({
    ok: true,
    message: "SmartWork SIAGA E2E runner started.",
    runId,
    state: __smartworkE2eState,
    statusUrl: "/api/smartwork/siaga/e2e/status",
    logFile: "reports/smartwork-siaga-e2e-server-run.log"
  });
}

app.post("/api/smartwork/siaga/e2e/run", __smartworkStartSiagaE2e);
app.post("/api/job/run-latest-e2e", __smartworkStartSiagaE2e);

app.get("/api/smartwork/siaga/e2e/status", async (req, res) => {
  res.json(await __smartworkLatestProgressPayload());
});

app.get("/api/job/latest-progress", async (req, res) => {
  res.json(await __smartworkLatestProgressPayload());
});
/* END_SMARTWORK_E2E_SERVER_INTEGRATION_V1 */

`;

const listenMatch = src.match(/\n\s*(?:const\s+\w+\s*=\s*)?(?:server|app)\.listen\s*\(/);
if (!listenMatch || listenMatch.index == null) {
  throw new Error("Tidak menemukan anchor listen().");
}

src = src.slice(0, listenMatch.index) + block + src.slice(listenMatch.index);

fs.writeFileSync(serverPath, src, "utf8");

console.log(JSON.stringify({
  ok: true,
  patched: "app/smartwork-control-server.mjs",
  endpoints: [
    "POST /api/smartwork/siaga/e2e/run",
    "POST /api/job/run-latest-e2e",
    "GET /api/smartwork/siaga/e2e/status",
    "GET /api/job/latest-progress"
  ]
}, null, 2));
