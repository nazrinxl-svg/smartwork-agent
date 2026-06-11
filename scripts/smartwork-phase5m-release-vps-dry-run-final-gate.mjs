import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const root = process.cwd();
const reportPath = path.join(root, "reports", "phase5m-release-vps-dry-run-final-gate-report.json");

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

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

function run(name, command, args, env = {}) {
  const startedAt = new Date().toISOString();
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
    name,
    command: [command, ...args].join(" "),
    resolvedCommand: [resolved.command, ...resolved.args].join(" "),
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    error: result.error ? String(result.error?.message || result.error) : null,
    startedAt,
    finishedAt: new Date().toISOString(),
    stdoutTail: String(result.stdout || "").split(/\r?\n/).slice(-80),
    stderrTail: String(result.stderr || "").split(/\r?\n/).slice(-80)
  };
}
function git(args) {
  const resolved = resolveSpawnCommand("git", args);

  const result = spawnSync(resolved.command, resolved.args, {
    cwd: root,
    encoding: "utf8",
    shell: false
  });

  return {
    ok: result.status === 0,
    status: result.status,
    error: result.error ? String(result.error?.message || result.error) : null,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim()
  };
}
const pkg = readJson("package.json") || {};
const scripts = pkg.scripts || {};

const requiredFiles = {
  controlServer: "app/smartwork-control-server.mjs",
  queueApi: "app/smartwork-production-queue-api.mjs",
  productionWorker: "scripts/smartwork-production-worker.mjs",
  progressHtml: "public/progress.html",
  requestHtml: "public/request.html",
  phase5i: "scripts/smartwork-phase5i-real-server-worker-to-progress-smoke.mjs",
  phase5j: "scripts/smartwork-phase5j-production-daemon-readiness-smoke.mjs",
  phase5k: "scripts/smartwork-phase5k-vps-cloud-service-simulation-smoke.mjs",
  phase5l: "scripts/smartwork-phase5l-production-deployment-pack-finalizer.mjs",
  deployReadme: "deploy/production-pack/README.md",
  deployEnv: "deploy/production-pack/.env.production.dry-run.example",
  deployPm2: "deploy/production-pack/pm2.ecosystem.config.cjs",
  deployServerSystemd: "deploy/production-pack/smartwork-control-server.service",
  deployWorkerSystemd: "deploy/production-pack/smartwork-production-worker.service",
  deployFirstRun: "deploy/production-pack/first-run-dry-run.sh"
};

const requiredScripts = {
  serverWorkerProgress: "prod:server-worker-progress:smoke",
  daemonReadiness: "prod:daemon-readiness:smoke",
  cloudServiceSimulation: "prod:cloud-service:simulation",
  deploymentPackVerify: "prod:deployment-pack:verify"
};

const fileChecks = Object.fromEntries(
  Object.entries(requiredFiles).map(([key, rel]) => [key, exists(rel)])
);

const scriptChecks = Object.fromEntries(
  Object.entries(requiredScripts).map(([key, script]) => [key, typeof scripts[script] === "string" && scripts[script].length > 0])
);

const gitBranch = git(["branch", "--show-current"]);
const gitStatus = git(["status", "--short"]);
const gitLog = git(["log", "-8", "--oneline"]);

const staticOk =
  Object.values(fileChecks).every(Boolean) &&
  Object.values(scriptChecks).every(Boolean) &&
  gitBranch.stdout === "test/ui-request-next-20260611-004522";

const runs = [];

if (staticOk) {
  runs.push(run("deployment-pack-verify", "npm", ["run", "prod:deployment-pack:verify"]));
  runs.push(run("real-server-worker-progress-smoke", "npm", ["run", "prod:server-worker-progress:smoke"], {
    SMARTWORK_PHASE5I_PORT: "8891"
  }));
  runs.push(run("daemon-readiness-smoke", "npm", ["run", "prod:daemon-readiness:smoke"], {
    SMARTWORK_PHASE5J_PORT: "8892"
  }));
  runs.push(run("cloud-service-simulation", "npm", ["run", "prod:cloud-service:simulation"], {
    SMARTWORK_PHASE5K_PORT: "8893"
  }));
}

const reports = {
  phase5i: readJson("reports/phase5i-real-server-worker-to-progress-smoke-report.json"),
  phase5j: readJson("reports/phase5j-production-daemon-readiness-smoke-report.json"),
  phase5k: readJson("reports/phase5k-vps-cloud-service-simulation-smoke-report.json"),
  phase5l: readJson("reports/phase5l-production-deployment-pack-finalizer-report.json")
};

const reportChecks = {
  phase5iOk: reports.phase5i?.ok === true,
  phase5jOk: reports.phase5j?.ok === true,
  phase5kOk: reports.phase5k?.ok === true,
  phase5lOk: reports.phase5l?.ok === true,
  phase5iSafety: reports.phase5i?.safetyKept === true || reports.phase5i?.safety?.noSiagaInput === true,
  phase5jSafety: reports.phase5j?.safetyKept === true,
  phase5kSafety: reports.phase5k?.safetyKept === true,
  phase5lSafety: reports.phase5l?.safety?.noSiagaInput === true
};

const runOk = runs.length === 4 && runs.every((item) => item.ok);
const reportsOk = Object.values(reportChecks).every(Boolean);

const ok = Boolean(staticOk && runOk && reportsOk);

const report = {
  ok,
  phase: "5M",
  name: "Release VPS Dry-Run Final Gate",
  branch: gitBranch.stdout,
  staticOk,
  runOk,
  reportsOk,
  fileChecks,
  scriptChecks,
  reportChecks,
  runs,
  git: {
    branch: gitBranch,
    status: gitStatus,
    log: gitLog
  },
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    dryRunOnly: true,
    noRealDeploy: true,
    finalGateOnly: true
  },
  releaseDecision: ok
    ? "READY_FOR_VPS_DRY_RUN_DEPLOYMENT"
    : "NOT_READY_FIX_FAILED_GATE",
  next: ok
    ? "Proceed to VPS dry-run deployment only. Keep real SIAGA/save/send disabled."
    : "Fix failed final gate before any VPS deployment.",
  generatedAt: new Date().toISOString()
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok,
  phase: "5M",
  branch: report.branch,
  staticOk,
  runOk,
  reportsOk,
  releaseDecision: report.releaseDecision,
  runSummary: runs.map((item) => ({
    name: item.name,
    ok: item.ok,
    status: item.status
  })),
  reportChecks,
  reportPath
}, null, 2));

if (!ok) process.exitCode = 1;
