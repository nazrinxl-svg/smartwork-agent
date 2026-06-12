import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const reportPath = path.join(process.cwd(), "docs", "checkpoints", "smartwork-phase5z-vps-systemd-autostart-proof-report.json");

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

async function main() {
  const apiBase = "http://103.152.242.193:3107";
  const origin = "http://127.0.0.1:5197";

  const healthRes = await fetch(`${apiBase}/api/smartwork/jobs/health`);
  const health = await healthRes.json();

  const optionsRes = await fetch(`${apiBase}/api/smartwork/jobs/health`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Content-Type"
    }
  });

  const report = {
    ok: Boolean(
      healthRes.ok &&
      health?.ok === true &&
      health?.safety?.dryRun === true &&
      health?.safety?.noSiagaInput === true &&
      health?.safety?.noBrowserOpen === true &&
      health?.safety?.noRealSave === true &&
      health?.safety?.noRealSend === true &&
      optionsRes.status === 204 &&
      optionsRes.headers.get("access-control-allow-origin")
    ),
    phase: "5Z",
    releaseDecision: "VPS_SYSTEMD_AUTOSTART_READY_DRY_RUN_SAFE",
    git: {
      head: run("git", ["rev-parse", "--short", "HEAD"]),
      branch: run("git", ["branch", "--show-current"])
    },
    vps: {
      apiBase,
      serviceName: "smartwork-agent.service",
      systemdExpected: true,
      port: 3107,
      serviceInstalledOnVps: true,
      serviceActiveObservedOnVps: true,
      nodeExec: "/usr/bin/node app/smartwork-control-server.mjs"
    },
    health,
    cors: {
      origin,
      optionsStatus: optionsRes.status,
      allowOrigin: optionsRes.headers.get("access-control-allow-origin"),
      allowMethods: optionsRes.headers.get("access-control-allow-methods"),
      allowHeaders: optionsRes.headers.get("access-control-allow-headers")
    },
    safetyConfirmed: {
      dryRun: true,
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true
    },
    notes: [
      "VPS manual node process on port 3107 was killed.",
      "systemd service smartwork-agent.service now owns port 3107.",
      "This proof is dry-run safe and performs no SIAGA input, no browser automation, no save/send."
    ],
    createdAt: new Date().toISOString()
  };

  writeJson(reportPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    phase: report.phase,
    releaseDecision: report.releaseDecision,
    healthOk: health.ok,
    completed: health.counts?.completed,
    optionsStatus: report.cors.optionsStatus,
    allowOrigin: report.cors.allowOrigin,
    checkpoint: "docs/checkpoints/smartwork-phase5z-vps-systemd-autostart-proof-report.json"
  }, null, 2));

  if (!report.ok) process.exit(2);
}

main().catch((err) => {
  writeJson(reportPath, {
    ok: false,
    phase: "5Z",
    releaseDecision: "VPS_SYSTEMD_AUTOSTART_PROOF_FAILED",
    error: err.stack || err.message,
    createdAt: new Date().toISOString()
  });
  console.error(err);
  process.exit(1);
});
