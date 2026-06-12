import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const args = process.argv.slice(2);

function nowId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function readText(file) {
  try {
    return fs.readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "");
  } catch {
    return "";
  }
}

function readJson(file, fallback = {}) {
  try {
    const raw = readText(file);
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeText(file, text) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text, "utf8");
}

function sh(cmd, options = {}) {
  const startedAt = new Date().toISOString();

  try {
    const out = execSync(cmd, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeout || 120000
    });

    return {
      ok: true,
      cmd,
      startedAt,
      endedAt: new Date().toISOString(),
      output: String(out || "").trim(),
      error: ""
    };
  } catch (err) {
    return {
      ok: false,
      cmd,
      startedAt,
      endedAt: new Date().toISOString(),
      status: err.status ?? null,
      signal: err.signal ?? null,
      output: String(err.stdout || "").trim(),
      error: String(err.stderr || err.message || "").trim()
    };
  }
}

function pkgScripts() {
  return readJson("package.json", {}).scripts || {};
}

function hasScript(name) {
  return Object.prototype.hasOwnProperty.call(pkgScripts(), name);
}

function parse(raw) {
  const out = {
    mode: "auto",
    task: []
  };

  const modes = new Set(["auto", "error", "bug", "fitur", "ui", "vps", "release", "doctor", "progress"]);

  for (const a of raw) {
    const lower = String(a).toLowerCase();
    if (modes.has(lower)) out.mode = lower;
    else out.task.push(a);
  }

  return out;
}

function latestFiles(dir, n = 10) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];

  return fs.readdirSync(full)
    .map(name => {
      const p = path.join(full, name);
      const s = fs.statSync(p);
      return { name: `${dir}/${name}`, size: s.size, mtime: s.mtime.toISOString() };
    })
    .filter(x => x.size > 0)
    .sort((a, b) => b.mtime.localeCompare(a.mtime))
    .slice(0, n);
}

function planChecks(mode, task) {
  const checks = [];
  const q = `${mode} ${task}`.toLowerCase();

  if (hasScript("brain")) checks.push(["npm run brain", 180000]);

  if (hasScript("brain:smartwork-guard")) checks.push(["npm run brain:smartwork-guard", 180000]);
  else if (hasScript("guard")) checks.push(["npm run guard", 180000]);

  if (hasScript("doctor")) checks.push(["npm run doctor", 180000]);

  if (mode === "progress" || q.includes("progress") || q.includes("stuck") || q.includes("finalizer")) {
    for (const s of [
      "prod:progress-bridge:check",
      "prod:progress-runtime-smoke",
      "prod:request-progress:e2e-smoke",
      "prod:app-bridge:check",
      "prod:server-worker-progress:smoke"
    ]) {
      if (hasScript(s)) checks.push([`npm run ${s}`, 180000]);
    }
  }

  if (mode === "vps" || q.includes("vps") || q.includes("cloud")) {
    for (const s of [
      "prod:vps-dry-run:setup-pack-check",
      "prod:vps-dry-run:first-run-checklist",
      "prod:vps-dry-run:fresh-clone-rehearsal",
      "prod:release-vps:final-gate"
    ]) {
      if (hasScript(s)) checks.push([`npm run ${s}`, 240000]);
    }
  }

  if (mode === "ui" || q.includes("screenshot")) {
    if (hasScript("shot")) checks.push(["npm run shot", 180000]);
  }

  return checks;
}

function summarizeResult(r) {
  const text = `${r.output}\n${r.error || ""}`.trim();
  const lastLines = text.split(/\r?\n/).filter(Boolean).slice(-25).join("\n");

  return {
    cmd: r.cmd,
    ok: r.ok,
    status: r.status ?? null,
    signal: r.signal ?? null,
    lastLines
  };
}

const opt = parse(args);
const fallbackTask = readText("reports/smartdev-team-last.md").slice(0, 2000);
const task = opt.task.join(" ").trim() || fallbackTask || "Auto safe runner.";
const runId = `smartdev-auto-${nowId()}`;

const before = {
  branch: sh("git rev-parse --abbrev-ref HEAD").output,
  commit: sh("git log -1 --oneline").output,
  status: sh("git status --short").output,
  latestReports: latestFiles("reports", 12),
  latestShots: latestFiles("shots", 8)
};

const checks = planChecks(opt.mode, task);

const results = [];

for (const [cmd, timeout] of checks) {
  console.log(`\n=== RUN: ${cmd} ===`);
  const r = sh(cmd, { timeout });
  results.push(r);

  console.log(r.ok ? "OK" : "FAILED");

  const text = `${r.output}\n${r.error || ""}`.trim();
  if (text) {
    console.log(text.split(/\r?\n/).slice(-25).join("\n"));
  }
}

const after = {
  status: sh("git status --short").output,
  latestReports: latestFiles("reports", 15),
  latestShots: latestFiles("shots", 10)
};

const ok = results.every(r => r.ok);
const failed = results.filter(r => !r.ok);

const report = {
  runId,
  at: new Date().toISOString(),
  mode: opt.mode,
  task,
  safety: {
    autoPatch: false,
    realSaveSendDelete: false,
    onlySafeChecks: true
  },
  before,
  plannedChecks: checks.map(x => x[0]),
  ok,
  failed: failed.map(summarizeResult),
  results: results.map(summarizeResult),
  after
};

writeText(`reports/${runId}.json`, JSON.stringify(report, null, 2));

const md = [
  "# SMARTDEV AUTO RUNNER REPORT",
  "",
  `Run ID: ${runId}`,
  `Mode: ${opt.mode}`,
  `OK: ${ok}`,
  "",
  "## Safety",
  "- Auto patch: false",
  "- Real save/send/delete: false",
  "- Only safe checks: true",
  "",
  "## Task",
  task,
  "",
  "## Before",
  `- Branch: ${before.branch || "(unknown)"}`,
  `- Commit: ${before.commit || "(unknown)"}`,
  "",
  "## Planned Checks",
  checks.length ? checks.map(x => `- ${x[0]}`).join("\n") : "- no checks planned",
  "",
  "## Result Summary",
  results.length ? results.map(r => `- ${r.ok ? "OK" : "FAILED"}: ${r.cmd}`).join("\n") : "- no command executed",
  "",
  "## Failed Details",
  failed.length ? failed.map(r => `### ${r.cmd}\n${summarizeResult(r).lastLines}`).join("\n\n") : "- none",
  "",
  "## Latest Reports After Run",
  after.latestReports.map(x => `- ${x.name}`).join("\n"),
  "",
  "## Latest Screenshots After Run",
  after.latestShots.map(x => `- ${x.name}`).join("\n"),
  "",
  "## Next Prompt",
  "BRO, AKTIFKAN SMARTDEV TEAM ORCHESTRATOR.",
  "",
  `Auto runner sudah menjalankan safe checks untuk mode ${opt.mode}. Gunakan report:`,
  `- reports/${runId}.json`,
  `- reports/${runId}.md`,
  "",
  "Jika ada FAILED, diagnosis root cause dari failed details dulu. Jika semua OK, lanjut patch kecil sesuai request. Guard tetap aktif: no real save/send/delete, jangan ulang input SIAGA tanggal verified/filled, backup dulu, verify dengan report/screenshot."
].join("\n");

writeText(`reports/${runId}.md`, md);
writeText("reports/smartdev-auto-last.md", md);

console.log("\n=== SMARTDEV AUTO RUNNER DONE ===");
console.log(`OK: ${ok}`);
console.log(`Report JSON: reports/${runId}.json`);
console.log(`Report MD: reports/${runId}.md`);
console.log("Latest: reports/smartdev-auto-last.md");

process.exit(0);