import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "reports", "smartwork-autonomous-control-loop-state.json");

function run(command, args = []) {
  const exe =
    process.platform === "win32" && command === "npm" ? "npm.cmd" :
    process.platform === "win32" && command === "npx" ? "npx.cmd" :
    command;

  const r = spawnSync(exe, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false
  });

  return {
    ok: r.status === 0,
    status: typeof r.status === "number" ? r.status : 1,
    stdout: String(r.stdout || ""),
    stderr: String(r.stderr || ""),
    error: r.error ? r.error.message : null
  };
}

function readJson(rel, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

function tail(text, n = 1600) {
  return String(text || "").slice(-n);
}

function decide({ gitStatus, noRepeatReport, guardedReport }) {
  const dirty = gitStatus.trim().length > 0;

  const noRepeatOk =
    noRepeatReport?.ok === true &&
    Number(noRepeatReport?.passed || 0) >= 9 &&
    Number(noRepeatReport?.failed || 0) === 0;

  const guardedOk =
    guardedReport?.ok === true &&
    guardedReport?.tests?.blockDangerousCommand?.ok === true &&
    guardedReport?.tests?.blockDangerousCommand?.markerCreated === false &&
    guardedReport?.tests?.passSafeCommand?.ok === true &&
    guardedReport?.tests?.passSafeCommand?.markerCreated === true;

  const recommendations = [];

  if (!noRepeatOk) {
    recommendations.push({
      priority: "HIGH",
      action: "FIX_NO_REPEAT_AGENT",
      message: "No-repeat test belum valid. Jangan lanjut kerja besar sebelum test kembali hijau."
    });
  }

  if (!guardedOk) {
    recommendations.push({
      priority: "HIGH",
      action: "FIX_GUARDED_RUNNER",
      message: "Guarded runner belum valid. Jangan jalankan command berisiko."
    });
  }

  if (dirty) {
    recommendations.push({
      priority: "MEDIUM",
      action: "REVIEW_WORKTREE_BEFORE_NEXT_STEP",
      message: "Working tree sedang dirty. Review diff dulu; jangan patch bertumpuk."
    });
  }

  if (noRepeatOk && guardedOk && !dirty) {
    recommendations.push({
      priority: "LOW",
      action: "SAFE_IDLE",
      message: "Agent guard valid dan repo clean. Posisi aman; lanjut hanya patch kecil bila ada task baru."
    });
  }

  return {
    ok: noRepeatOk && guardedOk,
    dirty,
    noRepeatOk,
    guardedOk,
    mode:
      !noRepeatOk ? "STOP_FIX_NO_REPEAT" :
      !guardedOk ? "STOP_FIX_GUARDED_RUNNER" :
      dirty ? "CAUTION_REVIEW_DIRTY_WORKTREE" :
      "SAFE_IDLE",
    recommendations
  };
}

function cycle() {
  const startedAt = new Date().toISOString();

  const noRepeat = run("npm", ["run", "smartwork:norepeat:test"]);
  const guarded = run("npm", ["run", "smartwork:guarded:test"]);
  const git = run("git", ["status", "--short"]);
  const log = run("git", ["log", "-3", "--oneline", "--decorate"]);

  const noRepeatReport = readJson("reports/smartwork-no-repeat-control-agent-test-suite-report.json", {});
  const guardedReport = readJson("reports/smartwork-guarded-command-runner-test-report.json", {});
  const decision = decide({
    gitStatus: git.stdout,
    noRepeatReport,
    guardedReport
  });

  const state = {
    ok: decision.ok,
    mode: "SMARTWORK_AUTONOMOUS_CONTROL_LOOP",
    loopDecision: decision.mode,
    generatedAt: new Date().toISOString(),
    startedAt,
    repo: {
      gitStatusShort: git.stdout.trim(),
      lastCommits: log.stdout.trim()
    },
    checks: {
      noRepeat: {
        ok: noRepeat.ok,
        status: noRepeat.status,
        summary: noRepeatReport
          ? {
              total: noRepeatReport.total,
              passed: noRepeatReport.passed,
              failed: noRepeatReport.failed
            }
          : null,
        stdoutTail: tail(noRepeat.stdout),
        stderrTail: tail(noRepeat.stderr)
      },
      guarded: {
        ok: guarded.ok,
        status: guarded.status,
        summary: guardedReport
          ? {
              ok: guardedReport.ok,
              blockDangerousCommand: guardedReport.tests?.blockDangerousCommand,
              passSafeCommand: guardedReport.tests?.passSafeCommand
            }
          : null,
        stdoutTail: tail(guarded.stdout),
        stderrTail: tail(guarded.stderr)
      }
    },
    decision,
    safety: {
      readOnlyControlLoop: true,
      noSiagaLogin: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSubmit: true,
      noDelete: true,
      noAutoCommit: true,
      noAutoPush: true,
      noAutoPatchApply: true
    }
  };

  writeJson(REPORT, state);

  console.log(JSON.stringify({
    ok: state.ok,
    loopDecision: state.loopDecision,
    generatedAt: state.generatedAt,
    gitStatusShort: state.repo.gitStatusShort,
    recommendations: state.decision.recommendations
  }, null, 2));

  return state;
}

const loop = process.argv.includes("--loop");
const intervalMsArg = process.argv.find((a) => a.startsWith("--interval-ms="));
const intervalMs = Math.max(30000, Number(intervalMsArg?.split("=")[1] || 120000));

cycle();

if (loop) {
  setInterval(() => {
    try {
      cycle();
    } catch (err) {
      writeJson(REPORT, {
        ok: false,
        mode: "SMARTWORK_AUTONOMOUS_CONTROL_LOOP",
        loopDecision: "LOOP_ERROR",
        generatedAt: new Date().toISOString(),
        error: String(err?.stack || err),
        safety: {
          readOnlyControlLoop: true,
          noSiagaLogin: true,
          noRealSave: true,
          noDelete: true
        }
      });
      console.error(err);
    }
  }, intervalMs);
}
