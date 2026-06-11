import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const INTAKE_DIR = path.join(ROOT, "intake", "requests");
const REPORTS_DIR = path.join(ROOT, "reports");
const STATE_PATH = path.join(REPORTS_DIR, "smartwork-autopilot-watch-state.json");
const REPORT_PATH = path.join(REPORTS_DIR, "smartwork-autopilot-watch-report.json");
const POLL_MS = Number(process.env.SMARTWORK_WATCH_POLL_MS || 5000);
const PROCESS_EXISTING = process.env.SMARTWORK_PROCESS_EXISTING === "YES";

fs.mkdirSync(REPORTS_DIR, { recursive: true });

function now() {
  return new Date().toISOString();
}

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function listRequestFiles() {
  if (!fs.existsSync(INTAKE_DIR)) return [];
  return fs.readdirSync(INTAKE_DIR)
    .filter((name) => /\.json$/i.test(name))
    .map((name) => {
      const full = path.join(INTAKE_DIR, name);
      const stat = fs.statSync(full);
      return { name, full, mtimeMs: stat.mtimeMs, size: stat.size };
    })
    .filter((item) => item.size > 5)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function getLatestValidRequest() {
  for (const file of listRequestFiles()) {
    const data = readJson(file.full, null);
    if (!data) continue;

    const account = Array.isArray(data.accounts) ? data.accounts[0] || {} : {};
    const startDate = data.startDate || account.startDate || null;
    const endDate = data.endDate || account.endDate || null;
    const teacherId = data.teacherId || account.teacherId || "guru-001";
    const teacherName = data.teacherName || account.teacherName || account.name || "Nazrin";
    const requestId = data.requestId || data.id || path.basename(file.name, ".json");

    if (!startDate || !endDate) continue;

    return {
      file: file.full,
      fileName: file.name,
      mtimeMs: file.mtimeMs,
      requestId,
      teacherId,
      teacherName,
      startDate,
      endDate,
      requestRange: `${startDate}..${endDate}`,
      signature: `${file.name}|${Math.round(file.mtimeMs)}|${teacherId}|${startDate}|${endDate}`
    };
  }

  return null;
}

function runStep(label, command, args) {
  const startedAt = now();
  console.log(`\n=== ${label} ===`);
  console.log([command, ...args].join(" "));

  const result = spawnSync(command, args, {
    cwd: ROOT,
    shell: true,
    stdio: "inherit",
    env: { ...process.env, CONFIRM_SAVE: "YES" }
  });

  const endedAt = now();
  const ok = result.status === 0;

  return {
    label,
    command: [command, ...args].join(" "),
    startedAt,
    endedAt,
    ok,
    exitCode: result.status
  };
}

function runPipeline(request) {
  const steps = [];

  steps.push(runStep("AUTOPILOT_USER_REQUEST", "node", ["scripts/smartwork-autopilot-user-request-test.mjs"]));

  if (steps.every((step) => step.ok)) {
    steps.push(runStep("FINALIZE_PROGRESS_AFTER_PDF", "node", ["scripts/smartwork-finalize-progress-after-pdf.mjs"]));
  }

  const ok = steps.every((step) => step.ok);

  const report = {
    ok,
    mode: "SMARTWORK_AUTOPILOT_WATCH_RUN",
    generatedAt: now(),
    request,
    steps,
    safety: {
      watcherOnly: true,
      manualSiagaWork: false,
      realSendEmailWhatsapp: false
    }
  };

  writeJson(REPORT_PATH, report);
  return report;
}

let state = readJson(STATE_PATH, {
  initialized: false,
  startedAt: now(),
  lastSeenSignature: null,
  processed: {},
  runs: []
});

let inFlight = false;

function saveState() {
  writeJson(STATE_PATH, state);
}

function tick() {
  if (inFlight) return;

  const request = getLatestValidRequest();
  if (!request) {
    console.log(`[${now()}] WATCH=no_valid_request`);
    return;
  }

  const ageMs = Date.now() - request.mtimeMs;
  if (ageMs < 1500) {
    console.log(`[${now()}] WATCH=request_still_writing ${request.fileName}`);
    return;
  }

  if (!state.initialized) {
    state.initialized = true;
    state.startedAt = state.startedAt || now();

    if (!PROCESS_EXISTING) {
      state.lastSeenSignature = request.signature;
      state.processed[request.signature] = {
        ok: true,
        skippedInitialExisting: true,
        at: now(),
        fileName: request.fileName,
        requestRange: request.requestRange
      };
      saveState();

      console.log(`[${now()}] WATCH=ready_waiting_new_request`);
      console.log(`INITIAL_EXISTING_SKIPPED=${request.requestRange}`);
      return;
    }
  }

  if (state.processed[request.signature]) {
    console.log(`[${now()}] WATCH=idle latest=${request.requestRange}`);
    return;
  }

  inFlight = true;

  console.log(`\n=== SMARTWORK WATCHER DETECTED NEW REQUEST ===`);
  console.log(`REQUEST=${request.teacherName} ${request.requestRange}`);
  console.log(`FILE=${request.fileName}`);

  const run = runPipeline(request);

  state.lastSeenSignature = request.signature;
  state.processed[request.signature] = {
    ok: run.ok,
    at: now(),
    fileName: request.fileName,
    requestRange: request.requestRange,
    report: path.relative(ROOT, REPORT_PATH).replaceAll("\\", "/")
  };

  state.runs = [
    {
      at: now(),
      ok: run.ok,
      requestRange: request.requestRange,
      fileName: request.fileName
    },
    ...(state.runs || [])
  ].slice(0, 20);

  saveState();
  inFlight = false;

  console.log(`SMARTWORK_WATCHER_RUN_DONE=${run.ok ? "OK" : "FAILED"}`);
}

console.log("SMARTWORK_AUTOPILOT_WATCHER=START");
console.log("MODE=WATCH_NEW_UI_REQUESTS_THEN_RUN_AUTOPILOT");
console.log("INTAKE_DIR=" + INTAKE_DIR);
console.log("POLL_MS=" + POLL_MS);
console.log("PROCESS_EXISTING=" + PROCESS_EXISTING);
console.log("RULE=NO_MANUAL_SIAGA_WORK_AFTER_REQUEST_DETECTED");

tick();
setInterval(tick, POLL_MS);
