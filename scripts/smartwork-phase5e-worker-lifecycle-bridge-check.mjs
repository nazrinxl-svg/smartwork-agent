import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const root = process.cwd();

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function readText(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return "";
  return fs.readFileSync(full, "utf8");
}

function writeJson(rel, data) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function syntaxOk(file) {
  try {
    execSync(`node --check "${file}"`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const bridge = readText("scripts/smartwork-phase5e-worker-lifecycle-bridge.mjs");
const pkg = JSON.parse(readText("package.json"));

const checks = {
  bridgeScriptExists: exists("scripts/smartwork-phase5e-worker-lifecycle-bridge.mjs"),
  bridgeSyntaxOk: syntaxOk("scripts/smartwork-phase5e-worker-lifecycle-bridge.mjs"),
  usesHealthEndpoint: bridge.includes("/api/smartwork/jobs/health"),
  usesPendingEndpoint: bridge.includes("/api/smartwork/jobs/pending"),
  usesAckEndpoint: bridge.includes("/api/smartwork/jobs/ack"),
  usesCompleteEndpoint: bridge.includes("/api/smartwork/jobs/complete"),
  noSiagaInputGuard: bridge.includes("noSiagaInput: true"),
  noBrowserOpenGuard: bridge.includes("noBrowserOpen: true"),
  noRealSaveGuard: bridge.includes("noRealSave: true"),
  noRealSendGuard: bridge.includes("noRealSend: true"),
  packageHasSmokeScript: pkg.scripts?.["prod:worker:lifecycle:smoke"] === "node scripts/smartwork-phase5e-worker-lifecycle-bridge.mjs --start-server --smoke",
  brainDoesNotRunRuntimeSmoke: !String(pkg.scripts?.brain || "").includes("smartwork-phase5e-worker-lifecycle-bridge.mjs --start-server --smoke")
};

const ok = Object.values(checks).every(Boolean);

const report = {
  ok,
  mode: "SMARTWORK_PHASE5E_WORKER_LIFECYCLE_BRIDGE_CHECK",
  generatedAt: new Date().toISOString(),
  checks,
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    staticCheckOnly: true
  },
  next: ok
    ? "Phase 5E worker lifecycle bridge static check passed. Run runtime smoke next."
    : "Fix Phase 5E worker lifecycle bridge."
};

writeJson("reports/production-worker/phase5e-worker-lifecycle-bridge-check-report.json", report);
console.log(JSON.stringify(report, null, 2));

if (!ok) process.exit(2);
