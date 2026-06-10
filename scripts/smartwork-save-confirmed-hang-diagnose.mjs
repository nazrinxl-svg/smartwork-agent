import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports");
fs.mkdirSync(REPORT_DIR, { recursive: true });

const reportPath = path.join(REPORT_DIR, "smartwork-save-confirmed-hang-diagnose.json");

const startedAt = new Date().toISOString();
const child = spawn(process.execPath, ["scripts/smartwork-siaga-job-save-confirmed.mjs"], {
  cwd: ROOT,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    SMARTWORK_EXIT_DIAGNOSE: "1",
    CONFIRM_SAVE: "YES",
    TARGET_TEACHER_ID: "guru-001",
    TARGET_DATE: "2026-06-20",
    SMARTWORK_DISABLE_TIMEOUT_GUARD: "1"
  }
});

let stdout = "";
let stderr = "";
let exited = false;

child.stdout.on("data", d => {
  const s = d.toString();
  stdout += s;
  process.stdout.write(s);
});

child.stderr.on("data", d => {
  const s = d.toString();
  stderr += s;
  process.stderr.write(s);
});

child.on("exit", (code, signal) => {
  exited = true;
  const report = {
    ok: true,
    cleanExit: true,
    businessExitOk: code === 0,
    note: code === 0
      ? "Process exited cleanly and business result was OK."
      : "Process exited cleanly. Non-zero code came from business/report status, not Node/browser hang.",
    mode: "SMARTWORK_SAVE_CONFIRMED_HANG_DIAGNOSE",
    startedAt,
    endedAt: new Date().toISOString(),
    exited,
    code,
    signal,
    stdoutTail: stdout.slice(-6000),
    stderrTail: stderr.slice(-6000)
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nDIAGNOSE_REPORT=${reportPath}`);
});

setTimeout(() => {
  if (!exited) {
    const report = {
      ok: false,
      mode: "SMARTWORK_SAVE_CONFIRMED_HANG_DIAGNOSE",
      issue: "CHILD_STILL_RUNNING_AFTER_SUCCESS_WINDOW",
      startedAt,
      checkedAt: new Date().toISOString(),
      childPid: child.pid,
      stdoutTail: stdout.slice(-8000),
      stderrTail: stderr.slice(-8000),
      likelyCauses: [
        "Playwright browser/context/page not closed",
        "CDP persistent browser connection left open",
        "HTTP server/listener still alive",
        "setInterval/setTimeout watcher still referenced",
        "child process still referenced"
      ]
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nHANG_CONFIRMED_REPORT=${reportPath}`);
    child.kill("SIGTERM");
    setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      process.exit(2);
    }, 2500).unref();
  }
}, 15000).unref();


