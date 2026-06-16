import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const markerBlocked = path.join(ROOT, "reports", "guarded-runner-should-not-run.txt");
const markerPassed = path.join(ROOT, "reports", "guarded-runner-safe-ran.txt");
const out = path.join(ROOT, "reports", "smartwork-guarded-command-runner-test-report.json");

for (const f of [markerBlocked, markerPassed]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

function run(args) {
  return spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false
  });
}

const block = run([
  "scripts/smartwork-guarded-command-runner.mjs",
  "--intent",
  "Saya mau input ulang SIAGA tanggal 2026-06-22 pakai npm run siaga:job:save-confirmed",
  "--",
  process.execPath,
  "-e",
  `require('fs').writeFileSync('reports/guarded-runner-should-not-run.txt','BAD')`
]);

const pass = run([
  "scripts/smartwork-guarded-command-runner.mjs",
  "--intent",
  "Validasi Progress UI aman saja. No SIAGA input. No save.",
  "--",
  process.execPath,
  "-e",
  `require('fs').writeFileSync('reports/guarded-runner-safe-ran.txt','OK')`
]);

const report = {
  ok: block.status !== 0 && !fs.existsSync(markerBlocked) && pass.status === 0 && fs.existsSync(markerPassed),
  mode: "SMARTWORK_GUARDED_COMMAND_RUNNER_TEST",
  generatedAt: new Date().toISOString(),
  tests: {
    blockDangerousCommand: {
      ok: block.status !== 0 && !fs.existsSync(markerBlocked),
      exitCode: block.status,
      markerCreated: fs.existsSync(markerBlocked),
      stdoutTail: String(block.stdout || "").slice(-1600),
      stderrTail: String(block.stderr || "").slice(-1600)
    },
    passSafeCommand: {
      ok: pass.status === 0 && fs.existsSync(markerPassed),
      exitCode: pass.status,
      markerCreated: fs.existsSync(markerPassed),
      stdoutTail: String(pass.stdout || "").slice(-1600),
      stderrTail: String(pass.stderr || "").slice(-1600)
    }
  },
  safety: {
    noSiagaLogin: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSubmit: true,
    noDelete: true,
    commandBlockProvenByMissingMarker: true
  }
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
