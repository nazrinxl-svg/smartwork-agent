
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const intervalMs = Number(process.env.SMARTWORK_WORKER_INTERVAL_MS || 10000);
const workerScript = path.join(root, "scripts/smartwork-production-worker.mjs");

const runtimeDirs = [
  "data/production-queue/pending",
  "data/production-queue/running",
  "data/production-queue/completed",
  "data/production-queue/failed",
  "data/jobs",
  "intake/requests",
  "reports",
  "reports/downloads",
  "reports/proof"
];

for (const dir of runtimeDirs) {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
}

const safeEnv = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || "production",
  SMARTWORK_DRY_RUN: "true",
  SMARTWORK_NO_SIAGA_INPUT: "true",
  SMARTWORK_NO_BROWSER_OPEN: "true",
  SMARTWORK_NO_REAL_SAVE: "true",
  SMARTWORK_NO_REAL_SEND: "true",
  SMARTWORK_REAL_SAVE_ENABLED: "false",
  SMARTWORK_EMAIL_ENABLED: "false",
  SMARTWORK_WHATSAPP_ENABLED: "false"
};

function now() {
  return new Date().toISOString();
}

function runOnce() {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [workerScript, "--once", "--dry-run"],
      {
        cwd: root,
        env: safeEnv,
        stdio: "inherit"
      }
    );

    child.on("error", (error) => {
      console.error(JSON.stringify({
        ok: false,
        mode: "SMARTWORK_PRODUCTION_WORKER_DAEMON",
        error: String(error?.message || error),
        generatedAt: now()
      }, null, 2));
      resolve(false);
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve(true);
        return;
      }

      console.error(JSON.stringify({
        ok: false,
        mode: "SMARTWORK_PRODUCTION_WORKER_DAEMON",
        childExitCode: code,
        childSignal: signal,
        generatedAt: now(),
        safety: {
          dryRun: true,
          noSiagaInput: true,
          noBrowserOpen: true,
          noRealSave: true,
          noRealSend: true
        }
      }, null, 2));
      resolve(false);
    });
  });
}

let stopping = false;

process.on("SIGTERM", () => {
  stopping = true;
  console.log("SMARTWORK_PRODUCTION_WORKER_DAEMON=SIGTERM");
});

process.on("SIGINT", () => {
  stopping = true;
  console.log("SMARTWORK_PRODUCTION_WORKER_DAEMON=SIGINT");
});

console.log(JSON.stringify({
  ok: true,
  mode: "SMARTWORK_PRODUCTION_WORKER_DAEMON",
  status: "started",
  intervalMs,
  generatedAt: now(),
  safety: {
    dryRun: true,
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true
  }
}, null, 2));

while (!stopping) {
  await runOnce();

  if (stopping) break;

  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

console.log(JSON.stringify({
  ok: true,
  mode: "SMARTWORK_PRODUCTION_WORKER_DAEMON",
  status: "stopped",
  generatedAt: now()
}, null, 2));
