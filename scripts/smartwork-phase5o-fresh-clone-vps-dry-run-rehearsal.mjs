import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";

const root = process.cwd();
const reportPath = path.join(root, "reports", "phase5o-fresh-clone-vps-dry-run-rehearsal-report.json");

const repoUrl = "https://github.com/nazrinxl-svg/smartwork-agent.git";
const branch = "test/ui-request-next-20260611-004522";
const expectedTag = "smartwork-vps-dry-run-ready-phase5n";
const tempRoot = path.join(os.tmpdir(), `smartwork-vps-dry-run-rehearsal-${Date.now()}`);

function resolveCommand(command, args = []) {
  if (process.platform === "win32" && command === "npm") {
    return { command: "cmd.exe", args: ["/d", "/s", "/c", "npm", ...args] };
  }
  if (process.platform === "win32" && command === "git") {
    return { command: "git.exe", args };
  }
  if (process.platform === "win32" && command === "node") {
    return { command: "node.exe", args };
  }
  return { command, args };
}

function run(name, command, args, cwd = root, env = {}) {
  const resolved = resolveCommand(command, args);
  const startedAt = new Date().toISOString();

  const result = spawnSync(resolved.command, resolved.args, {
    cwd,
    env: {
      ...process.env,
      SMARTWORK_DRY_RUN: "true",
      SMARTWORK_NO_SIAGA_INPUT: "true",
      SMARTWORK_NO_BROWSER_OPEN: "true",
      SMARTWORK_NO_REAL_SAVE: "true",
      SMARTWORK_NO_REAL_SEND: "true",
      SMARTWORK_REAL_SAVE_ENABLED: "false",
      SMARTWORK_WORKER_INTERVAL_MS: "1000",
      ...env
    },
    encoding: "utf8",
    shell: false
  });

  return {
    name,
    command: [command, ...args].join(" "),
    resolvedCommand: [resolved.command, ...resolved.args].join(" "),
    cwd,
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    error: result.error ? String(result.error?.message || result.error) : null,
    startedAt,
    finishedAt: new Date().toISOString(),
    stdoutTail: String(result.stdout || "").split(/\r?\n/).slice(-100),
    stderrTail: String(result.stderr || "").split(/\r?\n/).slice(-100)
  };
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function exists(rel, cwd = root) {
  return fs.existsSync(path.join(cwd, rel));
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.rmSync(tempRoot, { recursive: true, force: true });

const runs = [];

runs.push(run("git-clone-branch", "git", [
  "clone",
  "--branch",
  branch,
  repoUrl,
  tempRoot
]));

if (runs.at(-1).ok) {
  runs.push(run("git-fetch-tags", "git", ["fetch", "--tags", "--force"], tempRoot));
  runs.push(run("git-head", "git", ["rev-parse", "--short", "HEAD"], tempRoot));
  runs.push(run("git-branch", "git", ["branch", "--show-current"], tempRoot));
  runs.push(run("git-tags-at-head", "git", ["tag", "--points-at", "HEAD"], tempRoot));
  runs.push(run("npm-ci", "npm", ["ci"], tempRoot));
}

if (runs.at(-1)?.ok) {
  runs.push(run("deployment-pack-verify", "npm", ["run", "prod:deployment-pack:verify"], tempRoot));
}

if (runs.at(-1)?.ok) {
  runs.push(run("clean-release-gate", "npm", ["run", "prod:release-clean:gate"], tempRoot));
}

const head = runs.find((item) => item.name === "git-head")?.stdoutTail?.join("\n")?.trim() || "";
const branchOut = runs.find((item) => item.name === "git-branch")?.stdoutTail?.join("\n")?.trim() || "";
const tagsAtHead = runs.find((item) => item.name === "git-tags-at-head")?.stdoutTail?.join("\n") || "";

const clonedReport5N = readJson(path.join(tempRoot, "reports", "phase5n-clean-release-gate-ready-tag-report.json"));
const clonedReport5M = readJson(path.join(tempRoot, "reports", "phase5m-release-vps-dry-run-final-gate-report.json"));

const fileChecks = {
  packageJson: exists("package.json", tempRoot),
  deploymentPack: exists("deploy/production-pack/README.md", tempRoot),
  envDryRunExample: exists("deploy/production-pack/.env.production.dry-run.example", tempRoot),
  pm2Pack: exists("deploy/production-pack/pm2.ecosystem.config.cjs", tempRoot),
  systemdServer: exists("deploy/production-pack/smartwork-control-server.service", tempRoot),
  systemdWorker: exists("deploy/production-pack/smartwork-production-worker.service", tempRoot),
  phase5mScript: exists("scripts/smartwork-phase5m-release-vps-dry-run-final-gate.mjs", tempRoot),
  phase5nScript: exists("scripts/smartwork-phase5n-clean-release-gate-ready-tag.mjs", tempRoot)
};

const checks = {
  cloneOk: runs.find((item) => item.name === "git-clone-branch")?.ok === true,
  branchOk: branchOut === branch,
  expectedTagAtHead: tagsAtHead.includes(expectedTag),
  npmCiOk: runs.find((item) => item.name === "npm-ci")?.ok === true,
  deploymentPackOk: runs.find((item) => item.name === "deployment-pack-verify")?.ok === true,
  cleanReleaseGateOk: runs.find((item) => item.name === "clean-release-gate")?.ok === true,
  clonedPhase5nOk: clonedReport5N?.ok === true &&
    clonedReport5N?.releaseDecision === "CLEAN_READY_FOR_VPS_DRY_RUN_DEPLOYMENT",
  clonedPhase5mOk: clonedReport5M?.ok === true &&
    clonedReport5M?.releaseDecision === "READY_FOR_VPS_DRY_RUN_DEPLOYMENT",
  allRequiredFilesPresent: Object.values(fileChecks).every(Boolean),
  noDep0190Warning: !JSON.stringify(runs).includes("DEP0190")
};

const ok = Object.values(checks).every(Boolean);

const report = {
  ok,
  phase: "5O",
  name: "Fresh Clone VPS Dry-Run Rehearsal",
  repoUrl,
  branch,
  expectedTag,
  tempRoot,
  head,
  tagsAtHead: tagsAtHead.split(/\r?\n/).filter(Boolean),
  checks,
  fileChecks,
  runs,
  clonedReports: {
    phase5n: clonedReport5N
      ? {
          ok: clonedReport5N.ok,
          phase: clonedReport5N.phase,
          releaseDecision: clonedReport5N.releaseDecision,
          checks: clonedReport5N.checks
        }
      : null,
    phase5m: clonedReport5M
      ? {
          ok: clonedReport5M.ok,
          phase: clonedReport5M.phase,
          releaseDecision: clonedReport5M.releaseDecision,
          staticOk: clonedReport5M.staticOk,
          runOk: clonedReport5M.runOk,
          reportsOk: clonedReport5M.reportsOk
        }
      : null
  },
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    dryRunOnly: true,
    freshCloneOnly: true,
    noRealDeploy: true
  },
  releaseDecision: ok
    ? "FRESH_CLONE_READY_FOR_VPS_DRY_RUN"
    : "NOT_READY_FIX_FRESH_CLONE_REHEARSAL",
  next: ok
    ? "Proceed to actual VPS dry-run setup using tag smartwork-vps-dry-run-ready-phase5n. Keep real SIAGA/save/send disabled."
    : "Fix fresh clone rehearsal before actual VPS setup.",
  generatedAt: new Date().toISOString()
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok,
  phase: "5O",
  releaseDecision: report.releaseDecision,
  tempRoot,
  head,
  tagsAtHead: report.tagsAtHead,
  checks,
  runSummary: runs.map((item) => ({
    name: item.name,
    ok: item.ok,
    status: item.status,
    error: item.error
  })),
  reportPath
}, null, 2));

if (!ok) process.exitCode = 1;
