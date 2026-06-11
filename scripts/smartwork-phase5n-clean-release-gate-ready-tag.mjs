import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const root = process.cwd();
const reportPath = path.join(root, "reports", "phase5n-clean-release-gate-ready-tag-report.json");

function readJson(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function resolveSpawnCommand(command, args = []) {
  // SMARTWORK_PHASE5N_WINDOWS_SAFE_SPAWN_V2
  if (process.platform === "win32" && command === "npm") {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", "npm", ...args] };
  }
  if (process.platform === "win32" && command === "node") {
    return { command: "node.exe", args };
  }
  if (process.platform === "win32" && command === "git") {
    return { command: "git.exe", args };
  }
  return { command, args };
}

function run(command, args, env = {}) {
  const resolved = resolveSpawnCommand(command, args);

  const result = spawnSync(resolved.command, resolved.args, {
    cwd: root,
    env: {
      ...process.env,
      SMARTWORK_DRY_RUN: "true",
      SMARTWORK_NO_SIAGA_INPUT: "true",
      SMARTWORK_NO_BROWSER_OPEN: "true",
      SMARTWORK_NO_REAL_SAVE: "true",
      SMARTWORK_NO_REAL_SEND: "true",
      SMARTWORK_REAL_SAVE_ENABLED: "false",
      ...env
    },
    encoding: "utf8",
    shell: false
  });

  return {
    command: [command, ...args].join(" "),
    resolvedCommand: [resolved.command, ...resolved.args].join(" "),
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    error: result.error ? String(result.error?.message || result.error) : null,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || "")
  };
}

const phase5mScript = fs.readFileSync(
  path.join(root, "scripts", "smartwork-phase5m-release-vps-dry-run-final-gate.mjs"),
  "utf8"
);

const syntax5m = run("node", ["--check", "scripts/smartwork-phase5m-release-vps-dry-run-final-gate.mjs"]);
const finalGate = run("npm", ["run", "prod:release-vps:final-gate"]);

const combinedOutput = `${finalGate.stdout}\n${finalGate.stderr}`;
const phase5mReport = readJson("reports/phase5m-release-vps-dry-run-final-gate-report.json");

const oldShellRegex = /shell:\s*process\.platform\s*={2,3}\s*["']win32["']/;

const checks = {
  phase5mSyntaxOk: syntax5m.ok,
  finalGateOk: finalGate.ok,
  noDep0190Warning: !combinedOutput.includes("DEP0190"),
  noOldShellPattern: !oldShellRegex.test(phase5mScript),
  hasSafeSpawnMarker: phase5mScript.includes("SMARTWORK_PHASE5N_WINDOWS_SAFE_SPAWN_V2"),
  phase5mReady: phase5mReport?.ok === true &&
    phase5mReport?.releaseDecision === "READY_FOR_VPS_DRY_RUN_DEPLOYMENT",
  staticOk: phase5mReport?.staticOk === true,
  runOk: phase5mReport?.runOk === true,
  reportsOk: phase5mReport?.reportsOk === true
};

const ok = Object.values(checks).every(Boolean);

const report = {
  ok,
  phase: "5N",
  name: "Clean Release Gate and VPS Dry-Run Ready Tag",
  checks,
  releaseDecision: ok
    ? "CLEAN_READY_FOR_VPS_DRY_RUN_DEPLOYMENT"
    : "NOT_READY_FIX_CLEAN_GATE",
  next: ok
    ? "Create git checkpoint/tag for VPS dry-run readiness. Real SIAGA/save/send remains disabled."
    : "Fix clean final gate before creating release-ready tag.",
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    dryRunOnly: true,
    noRealDeploy: true
  },
  finalGate: {
    command: finalGate.command,
    resolvedCommand: finalGate.resolvedCommand,
    status: finalGate.status,
    error: finalGate.error
  },
  finalGateTail: {
    stdoutTail: finalGate.stdout.split(/\r?\n/).slice(-80),
    stderrTail: finalGate.stderr.split(/\r?\n/).slice(-80)
  },
  generatedAt: new Date().toISOString()
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok,
  phase: "5N",
  releaseDecision: report.releaseDecision,
  checks,
  finalGate: report.finalGate,
  reportPath
}, null, 2));

if (!ok) process.exitCode = 1;
