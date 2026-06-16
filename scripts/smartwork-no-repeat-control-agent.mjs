#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "reports", "smartwork-no-repeat-control-agent-report.json");

function now() {
  return new Date().toISOString();
}

function exists(p) {
  return fs.existsSync(path.join(ROOT, p));
}

function readJson(rel, fallback = null) {
  try {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return fallback;
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(relOrAbs, value) {
  const full = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ROOT, relOrAbs);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(value, null, 2) + "\n");
}

function parseArgs(argv) {
  const out = { intent: "", command: "", allowRealSave: false, testName: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--intent") out.intent = argv[++i] || "";
    else if (a.startsWith("--intent=")) out.intent = a.slice("--intent=".length);
    else if (a === "--command") out.command = argv[++i] || "";
    else if (a.startsWith("--command=")) out.command = a.slice("--command=".length);
    else if (a === "--allow-real-save") out.allowRealSave = true;
    else if (a === "--test") out.testName = argv[++i] || "unnamed";
    else out.intent += (out.intent ? " " : "") + a;
  }
  return out;
}

function gitStatusShort() {
  try {
    return execSync("git status --short", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch (err) {
    return `GIT_STATUS_FAILED: ${err.message}`;
  }
}

function collectJsonReports() {
  const dir = path.join(ROOT, "reports");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((x) => x.isFile() && x.name.endsWith(".json"))
    .map((x) => path.join("reports", x.name));

  const out = [];
  for (const rel of files) {
    const json = readJson(rel, null);
    if (json) out.push({ rel, json });
  }
  return out;
}

function rangeDates(startDate, endDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ""))) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(endDate || ""))) return [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (start > end) return [];

  const out = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function scanCompletedEvidence(reports) {
  const completedRanges = [];
  const completedDates = new Map();

  function addDate(date, evidence) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return;
    if (!completedDates.has(date)) completedDates.set(date, []);
    completedDates.get(date).push(evidence);
  }

  function addRange(startDate, endDate, evidence) {
    if (!startDate || !endDate) return;
    completedRanges.push({ startDate, endDate, evidence });
    for (const d of rangeDates(startDate, endDate)) addDate(d, evidence);
  }

  function walk(node, rel, trail = "") {
    if (!node || typeof node !== "object") return;

    const status = String(node.status || node.statusText || node.phase || "");
    const summary = node.summary || {};
    const progress = node.progress || {};

    const pct = Number(
      node.percent ??
      node.progressPercent ??
      node.completionPercent ??
      summary.percent ??
      summary.progressPercent ??
      progress.percent ??
      progress.progressPercent ??
      progress.completionPercent ??
      NaN
    );

    const needsPlan = Number(
      node.needsPlan ??
      summary.needsPlan ??
      progress.needsPlan ??
      NaN
    );

    const total = Number(summary.total ?? node.total ?? NaN);
    const terisi = Number(summary.terisi ?? summary.filled ?? node.terisi ?? NaN);

    const looksComplete =
      /HASIL_SIAP|Hasil Siap|complete|completed|already_filled_verified|saved_and_verified/i.test(status) ||
      (Number.isFinite(pct) && pct >= 100) ||
      (Number.isFinite(needsPlan) && needsPlan === 0 && Number.isFinite(total) && total > 0 && Number.isFinite(terisi) && terisi >= total);

    const requestRange = node.requestRange || node.range || {};
    const startDate = requestRange.startDate || node.startDate || node?.account?.startDate || null;
    const endDate = requestRange.endDate || node.endDate || node?.account?.endDate || null;

    if (looksComplete && startDate && endDate) {
      addRange(startDate, endDate, {
        rel,
        trail,
        status: status || null,
        reason: "complete_range_evidence",
        summary: Object.keys(summary || {}).length ? summary : null,
        progress: Object.keys(progress || {}).length ? progress : null
      });
    }

    const isoDate = node.isoDate || node.date || node.targetDate || null;
    if (looksComplete && isoDate) {
      addDate(String(isoDate).slice(0, 10), {
        rel,
        trail,
        status: status || null,
        reason: "complete_date_evidence"
      });
    }

    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, rel, `${trail}[${i}]`));
      return;
    }

    for (const [k, v] of Object.entries(node)) {
      if (v && typeof v === "object") walk(v, rel, trail ? `${trail}.${k}` : k);
    }
  }

  for (const { rel, json } of reports) walk(json, rel);

  return {
    completedRanges,
    completedDates: Object.fromEntries([...completedDates.entries()].sort())
  };
}

function datesMentioned(text) {
  const out = new Set();
  const s = String(text || "");

  for (const m of s.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)) out.add(m[0]);

  for (const m of s.matchAll(/\b(20\d{2}-\d{2}-\d{2})\s*(?:\.\.|sampai|hingga|to|-)\s*(20\d{2}-\d{2}-\d{2})\b/gi)) {
    for (const d of rangeDates(m[1], m[2])) out.add(d);
  }

  return [...out].sort();
}


function checkStartOverAlreadyValid(text) {
  const raw = String(text || "");
  const lower = raw.toLowerCase();

  const startOverIntent =
    /buat\s+ulang|bikin\s+ulang|mulai\s+dari\s+nol|dari\s+awal|start\s*over|from\s*scratch|rebuild|recreate|reset\s+agent|ulang\s+agent/i.test(raw);

  const targetAgent =
    /no-repeat|norepeat|guarded|command\s+runner|smartwork\s+no-repeat|smartwork:guarded|agent\s+kontrol|agent\s+ulang/i.test(raw);

  if (!startOverIntent || !targetAgent) {
    return { match: false, alreadyValid: false };
  }

  const requiredFiles = [
    "scripts/smartwork-no-repeat-control-agent.mjs",
    "scripts/smartwork-no-repeat-control-agent-test-suite.mjs",
    "scripts/smartwork-guarded-command-runner.mjs",
    "scripts/smartwork-guarded-command-runner-test.mjs"
  ];

  const filesReady = requiredFiles.every((rel) => fs.existsSync(path.join(ROOT, rel)));

  const pkg = readJson("package.json", {});
  const scriptsReady =
    !!pkg?.scripts?.["smartwork:norepeat"] &&
    !!pkg?.scripts?.["smartwork:norepeat:test"] &&
    !!pkg?.scripts?.["smartwork:guarded"] &&
    !!pkg?.scripts?.["smartwork:guarded:test"];

  const noRepeatSuite = readJson("reports/smartwork-no-repeat-control-agent-test-suite-report.json", {});
  const guardedSuite = readJson("reports/smartwork-guarded-command-runner-test-report.json", {});

  const noRepeatSuiteOk =
    noRepeatSuite?.ok === true &&
    Number(noRepeatSuite?.passed || 0) >= Number(noRepeatSuite?.total || 0) &&
    Number(noRepeatSuite?.total || 0) >= 8;

  const guardedSuiteOk =
    guardedSuite?.ok === true &&
    guardedSuite?.tests?.blockDangerousCommand?.ok === true &&
    guardedSuite?.tests?.blockDangerousCommand?.markerCreated === false &&
    guardedSuite?.tests?.passSafeCommand?.ok === true &&
    guardedSuite?.tests?.passSafeCommand?.markerCreated === true;

  let commitSeen = false;
  try {
    const log = execSync("git log -20 --oneline", { cwd: ROOT, encoding: "utf8" });
    commitSeen = /Add SmartWork no-repeat guarded command agent|8c024c1/i.test(log);
  } catch {
    commitSeen = false;
  }

  const alreadyValid = filesReady && scriptsReady && (noRepeatSuiteOk || guardedSuiteOk || commitSeen);

  return {
    match: true,
    alreadyValid,
    evidence: {
      filesReady,
      scriptsReady,
      noRepeatSuiteOk,
      guardedSuiteOk,
      commitSeen,
      requiredFiles
    }
  };
}

function makeDecision({ intent, command, allowRealSave }, evidence) {
  const text = `${intent}\n${command}`;
  const lower = text.toLowerCase();
  const blocks = [];
  const warnings = [];

  const startOverCheck = checkStartOverAlreadyValid(text);
  if (startOverCheck.match && startOverCheck.alreadyValid) {
    blocks.push({
      code: "BLOCK_START_OVER_WHEN_AGENT_ALREADY_VALID",
      reason: "No-repeat guarded command agent sudah ada dan sudah tervalidasi. Jangan buat ulang dari awal; lanjutkan dengan validasi/patch kecil.",
      evidence: startOverCheck.evidence
    });
  } else if (startOverCheck.match) {
    warnings.push({
      code: "WARN_START_OVER_NEEDS_EVIDENCE_CHECK",
      reason: "Intent meminta buat ulang dari awal. Cek evidence dulu sebelum rebuild.",
      evidence: startOverCheck.evidence
    });
  }

  if (/guru-002|guru002/i.test(text)) {
    blocks.push({
      code: "BLOCK_GURU_002",
      reason: "guru-002 dilarang dipakai."
    });
  }

  const dangerousPatterns = [
    "siaga:save",
    "siaga:job:save-confirmed",
    "smartwork:siaga:e2e",
    "input-preview-no-save",
    "smartwork-siaga-job-save-confirmed",
    "smartwork-siaga-smart-fill-and-save",
    "CONFIRM_SAVE=YES"
  ];

  const matchedDanger = dangerousPatterns.filter((p) => lower.includes(p.toLowerCase()));

  if (matchedDanger.length && !allowRealSave) {
    blocks.push({
      code: "BLOCK_REAL_OR_FORM_INPUT_WITHOUT_APPROVAL",
      reason: "Command/intent mengarah ke input/save SIAGA atau isi form. Wajib approval eksplisit.",
      matchedDanger
    });
  }

  const repeatLanguage = /input ulang|ulang input|reinput|isi ulang|save ulang|mengulang/i.test(text);

  if (repeatLanguage) {
    warnings.push({
      code: "WARN_REPEAT_LANGUAGE",
      reason: "Intent memakai bahasa pengulangan. Perlu cek evidence selesai dulu."
    });
  }

  const mentionedDates = datesMentioned(text);
  const completedHitDates = mentionedDates.filter((d) => evidence.completedDates[d]);

  if (completedHitDates.length) {
    const completedPayload = {
      completedHitDates,
      evidence: completedHitDates.reduce((acc, d) => {
        acc[d] = evidence.completedDates[d].slice(0, 5);
        return acc;
      }, {})
    };

    if (matchedDanger.length || repeatLanguage) {
      blocks.push({
        code: "BLOCK_COMPLETED_DATE_REPEAT",
        reason: "Tanggal yang disebut sudah punya evidence completed/already-filled.",
        ...completedPayload
      });
    } else {
      warnings.push({
        code: "WARN_COMPLETED_DATE_READONLY",
        reason: "Tanggal yang disebut sudah selesai. Hanya boleh validasi read-only, tidak boleh input/save.",
        ...completedPayload
      });
    }
  }

  const safeIntent =
    /validasi|cek|read.?only|no.?save|progress|pdf|invoice|history|ui|laporan|report/i.test(text) &&
    !matchedDanger.length;

  return {
    allowed: blocks.length === 0,
    decision: blocks.length ? "BLOCK" : "PASS",
    safeIntent,
    blocks,
    warnings,
    mentionedDates
  };
}


function makeRecommendations(decision, evidence, activeRequest) {
  const blockCodes = new Set((decision.blocks || []).map((b) => b.code));
  const warningCodes = new Set((decision.warnings || []).map((w) => w.code));
  const suggestions = [];

  if (blockCodes.has("BLOCK_START_OVER_WHEN_AGENT_ALREADY_VALID")) {
    suggestions.push({
      priority: "HIGH",
      action: "DO_NOT_REBUILD_VALID_AGENT",
      message: "Agent/runner sudah valid. Jangan buat ulang dari awal; gunakan patch kecil, test suite, atau guarded runner."
    });
  }

  if (blockCodes.has("BLOCK_REAL_OR_FORM_INPUT_WITHOUT_APPROVAL")) {
    suggestions.push({
      priority: "HIGH",
      action: "STOP_COMMAND",
      message: "Jangan jalankan command input/save SIAGA. Real input/save wajib approval eksplisit dan target harus belum selesai."
    });
  }

  if (blockCodes.has("BLOCK_COMPLETED_DATE_REPEAT")) {
    suggestions.push({
      priority: "HIGH",
      action: "DO_NOT_REPEAT_COMPLETED_DATE",
      message: "Tanggal/range sudah punya evidence selesai. Arahkan ke validasi PDF/progress/history, bukan input ulang."
    });
  }

  if (blockCodes.has("BLOCK_GURU_002")) {
    suggestions.push({
      priority: "HIGH",
      action: "USE_GURU_001_ONLY",
      message: "guru-002 diblok. Gunakan hanya guru-001 sesuai policy proyek."
    });
  }

  if (warningCodes.has("WARN_COMPLETED_DATE_READONLY")) {
    suggestions.push({
      priority: "MEDIUM",
      action: "READONLY_VALIDATION_ONLY",
      message: "Tanggal sudah selesai. Boleh validasi bukti secara read-only, tetapi jangan input/save."
    });
  }

  if (warningCodes.has("WARN_REPEAT_LANGUAGE")) {
    suggestions.push({
      priority: "MEDIUM",
      action: "CHECK_EVIDENCE_BEFORE_NEXT_STEP",
      message: "Bahasa intent mengarah ke pengulangan. Cek report/PDF/progress sebelum memberi command."
    });
  }

  if (decision.allowed && suggestions.length === 0) {
    suggestions.push({
      priority: "LOW",
      action: "PROCEED_WITH_SAFE_SCOPE",
      message: "Intent aman. Lanjut hanya dalam scope read-only/validasi, bukan real SIAGA action."
    });
  }

  return {
    primaryAction: decision.allowed ? "PASS_WITH_GUIDANCE" : "BLOCK_AND_REDIRECT",
    nextSafeStep: decision.allowed
      ? "Lanjut validasi aman sesuai intent. Tetap jangan real save/input tanpa approval."
      : "Hentikan command berisiko. Arahkan ke validasi evidence atau minta approval eksplisit bila benar-benar perlu real action.",
    activeRequestReminder: {
      startDate: activeRequest?.startDate || activeRequest?.account?.startDate || null,
      endDate: activeRequest?.endDate || activeRequest?.account?.endDate || null,
      teacherId: activeRequest?.teacherId || activeRequest?.account?.teacherId || null
    },
    suggestions
  };
}

const args = parseArgs(process.argv.slice(2));
const activeRequest = readJson("data/siaga-attendance-request.local.json", {});
const reports = collectJsonReports();
const evidence = scanCompletedEvidence(reports);
const decision = makeDecision(args, evidence);

const recommendations = makeRecommendations(decision, evidence, activeRequest);

const report = {
  ok: decision.allowed,
  mode: "SMARTWORK_NO_REPEAT_CONTROL_AGENT",
  generatedAt: now(),
  testName: args.testName || null,
  intent: args.intent || null,
  command: args.command || null,
  activeRequest: {
    startDate: activeRequest?.startDate || activeRequest?.account?.startDate || null,
    endDate: activeRequest?.endDate || activeRequest?.account?.endDate || null,
    teacherId: activeRequest?.teacherId || activeRequest?.account?.teacherId || null,
    autoSave: activeRequest?.rules?.autoSave ?? null,
    autoSubmit: activeRequest?.rules?.autoSubmit ?? null,
    autoDelete: activeRequest?.rules?.autoDelete ?? null
  },
  gitStatusShort: gitStatusShort(),
  evidenceSummary: {
    reportCount: reports.length,
    completedRangeCount: evidence.completedRanges.length,
    completedDates: Object.keys(evidence.completedDates),
    completedRanges: evidence.completedRanges.slice(0, 20)
  },
  decision,
  recommendations,
  safety: {
    noSiagaLogin: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSubmit: true,
    noDelete: true,
    readOnlyEvidenceScan: true
  }
};

writeJson(REPORT_PATH, report);

console.log(JSON.stringify(report, null, 2));

if (!decision.allowed) {
  process.exit(2);
}
