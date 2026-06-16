#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "reports", "smartwork-no-repeat-control-agent-report.json");
const OUT = path.join(ROOT, "reports", "smartwork-no-repeat-control-agent-test-suite-report.json");

function runCase(testCase) {
  const args = [
    "scripts/smartwork-no-repeat-control-agent.mjs",
    "--test",
    testCase.name,
    "--intent",
    testCase.intent
  ];

  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false
  });

  let report = null;
  try {
    report = JSON.parse(fs.readFileSync(REPORT, "utf8"));
  } catch (err) {
    report = { readError: err.message };
  }

  const decision = report?.decision?.decision || null;
  const blockCodes = (report?.decision?.blocks || []).map((b) => b.code);
  const warningCodes = (report?.decision?.warnings || []).map((w) => w.code);
  const suggestionActions = (report?.recommendations?.suggestions || []).map((s) => s.action);

  const checks = {
    exitCodeOk: result.status === testCase.expectExit,
    decisionOk: decision === testCase.expectDecision,
    requiredBlocksOk: (testCase.requiredBlocks || []).every((x) => blockCodes.includes(x)),
    requiredWarningsOk: (testCase.requiredWarnings || []).every((x) => warningCodes.includes(x)),
    requiredSuggestionsOk: (testCase.requiredSuggestions || []).every((x) => suggestionActions.includes(x)),
    noBrowser: report?.safety?.noBrowserOpen === true,
    noRealSave: report?.safety?.noRealSave === true,
    noRealSubmit: report?.safety?.noRealSubmit === true,
    noDelete: report?.safety?.noDelete === true
  };

  const ok = Object.values(checks).every(Boolean);

  return {
    name: testCase.name,
    intent: testCase.intent,
    startedAt,
    ok,
    expected: {
      exitCode: testCase.expectExit,
      decision: testCase.expectDecision,
      requiredBlocks: testCase.requiredBlocks || [],
      requiredWarnings: testCase.requiredWarnings || [],
      requiredSuggestions: testCase.requiredSuggestions || []
    },
    actual: {
      exitCode: result.status,
      decision,
      blockCodes,
      warningCodes,
      suggestionActions,
      primaryAction: report?.recommendations?.primaryAction || null,
      nextSafeStep: report?.recommendations?.nextSafeStep || null,
      completedDates: report?.evidenceSummary?.completedDates || []
    },
    checks,
    stdoutTail: String(result.stdout || "").slice(-1200),
    stderrTail: String(result.stderr || "").slice(-1200)
  };
}

const cases = [
  {
    name: "block-start-over-existing-valid-agent",
    intent: "Saya mau buat ulang dari awal SmartWork no-repeat guarded command agent padahal agent sudah valid 8/8, guarded runner sudah OK, dan commit 8c024c1 sudah ada.",
    expectExit: 2,
    expectDecision: "BLOCK",
    requiredBlocks: ["BLOCK_START_OVER_WHEN_AGENT_ALREADY_VALID"],
    requiredSuggestions: ["DO_NOT_REBUILD_VALID_AGENT"]
  },
  {
    name: "block-repeat-save-completed-date",
    intent: "Saya mau input ulang SIAGA tanggal 2026-06-22 pakai npm run siaga:job:save-confirmed",
    expectExit: 2,
    expectDecision: "BLOCK",
    requiredBlocks: [
      "BLOCK_REAL_OR_FORM_INPUT_WITHOUT_APPROVAL",
      "BLOCK_COMPLETED_DATE_REPEAT"
    ],
    requiredWarnings: ["WARN_REPEAT_LANGUAGE"],
    requiredSuggestions: [
      "STOP_COMMAND",
      "DO_NOT_REPEAT_COMPLETED_DATE"
    ]
  },
  {
    name: "block-input-preview-completed-date",
    intent: "Jalankan input-preview-no-save untuk tanggal 2026-06-23 karena saya mau coba isi form lagi",
    expectExit: 2,
    expectDecision: "BLOCK",
    requiredBlocks: [
      "BLOCK_REAL_OR_FORM_INPUT_WITHOUT_APPROVAL",
      "BLOCK_COMPLETED_DATE_REPEAT"
    ],
    requiredSuggestions: [
      "STOP_COMMAND",
      "DO_NOT_REPEAT_COMPLETED_DATE"
    ]
  },
  {
    name: "block-guru-002",
    intent: "Coba cek request memakai guru-002",
    expectExit: 2,
    expectDecision: "BLOCK",
    requiredBlocks: ["BLOCK_GURU_002"],
    requiredSuggestions: ["USE_GURU_001_ONLY"]
  },
  {
    name: "block-real-e2e",
    intent: "Jalankan npm run smartwork:siaga:e2e untuk testing real",
    expectExit: 2,
    expectDecision: "BLOCK",
    requiredBlocks: ["BLOCK_REAL_OR_FORM_INPUT_WITHOUT_APPROVAL"],
    requiredSuggestions: ["STOP_COMMAND"]
  },
  {
    name: "pass-safe-progress-validation",
    intent: "Validasi Progress UI, PDF link, invoice, dan history saja. No SIAGA input. No save.",
    expectExit: 0,
    expectDecision: "PASS",
    requiredSuggestions: ["PROCEED_WITH_SAFE_SCOPE"]
  },
  {
    name: "pass-online-request-flow-safe",
    intent: "Testing request user online dari aplikasi: login, submit request, cek queue, progress, PDF, invoice. No SIAGA input. No save.",
    expectExit: 0,
    expectDecision: "PASS",
    requiredSuggestions: ["PROCEED_WITH_SAFE_SCOPE"]
  },
  {
    name: "pass-readonly-completed-date-with-warning",
    intent: "Validasi bukti tanggal 2026-06-22 secara read-only saja, jangan input dan jangan save.",
    expectExit: 0,
    expectDecision: "PASS",
    requiredWarnings: ["WARN_COMPLETED_DATE_READONLY"],
    requiredSuggestions: ["READONLY_VALIDATION_ONLY"]
  },
  {
    name: "pass-repeat-language-warning-only",
    intent: "Saya takut ini mengulang, jadi cek evidence dulu secara read-only tanpa input/save.",
    expectExit: 0,
    expectDecision: "PASS",
    requiredWarnings: ["WARN_REPEAT_LANGUAGE"],
    requiredSuggestions: ["CHECK_EVIDENCE_BEFORE_NEXT_STEP"]
  }
];

const startedAt = new Date().toISOString();
const results = cases.map(runCase);
const failed = results.filter((r) => !r.ok);

const suite = {
  ok: failed.length === 0,
  mode: "SMARTWORK_NO_REPEAT_CONTROL_AGENT_TEST_SUITE",
  startedAt,
  finishedAt: new Date().toISOString(),
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
  safety: {
    noSiagaLogin: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSubmit: true,
    noDelete: true,
    textIntentOnly: true
  }
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(suite, null, 2) + "\n");

console.log(JSON.stringify({
  ok: suite.ok,
  mode: suite.mode,
  total: suite.total,
  passed: suite.passed,
  failed: suite.failed,
  failedNames: failed.map((x) => x.name),
  reportPath: "reports/smartwork-no-repeat-control-agent-test-suite-report.json"
}, null, 2));

for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name} => ${r.actual.decision} exit=${r.actual.exitCode}`);
  if (!r.ok) {
    console.log(JSON.stringify({ expected: r.expected, actual: r.actual, checks: r.checks }, null, 2));
  }
}

process.exit(suite.ok ? 0 : 1);
