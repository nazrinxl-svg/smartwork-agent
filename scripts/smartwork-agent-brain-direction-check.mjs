import fs from "fs";
import path from "path";

const root = process.cwd();

function readJson(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return null;
  }
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function pick(j) {
  if (!j) return null;
  return {
    ok: j.ok ?? null,
    ready: j.ready ?? null,
    verifyComplete: j.verifyComplete ?? null,
    status: j.status ?? null,
    requestRange: j.requestRange ?? j.range ?? null,
    total: j.total ?? j.totals?.total ?? j.summary?.total ?? null,
    terisi: j.terisi ?? j.totals?.terisi ?? j.summary?.terisi ?? null,
    alreadyFilled: j.alreadyFilled ?? j.totals?.alreadyFilled ?? j.summary?.alreadyFilled ?? null,
    needsPlan: j.needsPlan ?? j.totals?.needsPlan ?? j.summary?.needsPlan ?? null,
    percent: j.percent ?? j.progressPercent ?? j.completionPercent ?? j.progress?.percent ?? j.summary?.percent ?? null,
    pdfReady: j.artifacts?.pdfReady ?? j.pdfReady ?? null,
    proofReady: j.artifacts?.proofReady ?? j.proofReady ?? null
  };
}

const lockMd = "memory/SMARTWORK_AGENT_BRAIN_DIRECTION_LOCK.md";
const lockJson = "memory/smartwork-agent-brain-direction-lock.json";

const directionOk = exists(lockMd) && exists(lockJson);
const app = pick(readJson("reports/smartwork-app-artifacts-report.json"));
const finalProgress = pick(readJson("reports/smartwork-final-progress-report.json"));
const watch = pick(readJson("reports/smartwork-autopilot-watch-report.json"));
const activeRequest = pick(readJson("data/siaga-attendance-request.local.json"));

const diagnosis = {
  brainDirectionLock: directionOk ? "OK" : "MISSING",
  finalTarget: "24/7 server/cloud/VPS worker, not local laptop script",
  currentStage: "local_end_to_end_proven_but_canonical_report_needs_range_totals_cleanup",
  noSiagaInputForActiveRange: true,
  activeRange: "2026-06-22..2026-06-27",
  reports: {
    appArtifacts: app,
    finalProgress,
    watchReport: watch,
    activeRequest
  },
  nextSafeStep: [
    "finalize canonical report for 2026-06-22..2026-06-27 only",
    "ensure total 6, terisi 6, percent 100, pdfReady true, proofReady true",
    "commit checkpoint",
    "continue Production Worker/VPS 24/7"
  ]
};

console.log("\n=== SMARTWORK AGENT BRAIN DIRECTION LOCK ===");
console.log(JSON.stringify(diagnosis, null, 2));

if (!directionOk) {
  console.error("Brain direction lock missing.");
  process.exit(2);
}
