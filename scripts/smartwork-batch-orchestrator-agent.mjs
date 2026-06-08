import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const MODE = "SMARTWORK_BATCH_ORCHESTRATOR_V1_SAFE_NO_ACTION";

const OUT_REPORT_PATH =
  process.env.OUT_REPORT_PATH || "reports/batch-run/smartwork-batch-run-report.json";

const steps = [
  {
    id: "intake-validate",
    command: "npm",
    args: ["run", "intake:validate"],
    required: true,
  },
  {
    id: "batch-plan",
    command: "npm",
    args: ["run", "batch:plan"],
    required: true,
  },
  {
    id: "batch-delivery",
    command: "npm",
    args: ["run", "batch:delivery"],
    required: true,
  },
  {
    id: "batch-summary",
    command: "npm",
    args: ["run", "batch:summary"],
    required: true,
  },
];

const rules = {
  orchestrateOnly: true,
  runSiagaLogin: false,
  runSiagaInput: false,
  runSiagaSave: false,
  runSiagaSubmit: false,
  sendEmailAutomatically: false,
  sendWhatsAppAutomatically: false,
  delete: false,
};

function runStep(step) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();

    console.log(`\n=== RUN BATCH STEP: ${step.id} ===`);

    const child = spawn(step.command, step.args, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        SMARTWORK_CONFIRM_SEND_EMAIL: "NO",
        CONFIRM_SEND_EMAIL: "NO",
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      resolve({
        id: step.id,
        command: `${step.command} ${step.args.join(" ")}`,
        required: step.required,
        code,
        ok: code === 0,
        startedAt,
        endedAt: new Date().toISOString(),
        stdoutTail: stdout.slice(-4000),
        stderrTail: stderr.slice(-4000),
      });
    });
  });
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(OUT_REPORT_PATH), { recursive: true });
  fs.writeFileSync(OUT_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
}

async function main() {
  console.log(`MODE=${MODE}`);
  console.log("RULE=VALIDATE_PLAN_DELIVERY_SUMMARY_NO_SIAGA_NO_SEND");

  const results = [];

  for (const step of steps) {
    const result = await runStep(step);
    results.push(result);

    if (!result.ok && step.required) {
      console.log(`STOP_REQUIRED_STEP_FAILED=${step.id}`);
      break;
    }
  }

  const failedRequired = results.filter((item) => item.required && !item.ok);
  const batchSummary = readJsonIfExists("reports/batch-summary/smartwork-batch-summary-report.json");

  const ok = failedRequired.length === 0;

  const report = {
    ok,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    rules,
    steps: results,
    failedRequiredSteps: failedRequired.map((item) => item.id),
    batchSummary: batchSummary
      ? {
          status: batchSummary.status,
          totalAccounts: batchSummary?.counts?.totalAccounts,
          processedCount: batchSummary?.counts?.processedCount,
          skippedCount: batchSummary?.counts?.skippedCount,
          needsPdfDownloadCount: batchSummary?.counts?.needsPdfDownloadCount,
          failedCount: batchSummary?.counts?.failedCount,
          nextSafeStep: batchSummary.nextSafeStep,
        }
      : null,
    status: ok ? "BATCH_RUN_READY_NO_AUTO_SEND" : "BATCH_RUN_NEEDS_CHECK",
    nextSafeStep: ok
      ? "Batch run selesai. Akun PDF-ready sudah diproses delivery no-auto-send; akun skipped perlu PDF/SIAGA step dulu."
      : "Ada step batch yang gagal. Cek failedRequiredSteps dan stderrTail/stdoutTail.",
  };

  writeReport(report);

  console.log(`\nREPORT=${OUT_REPORT_PATH}`);
  console.log(`STEPS_OK=${ok}`);
  console.log(`FAILED_REQUIRED=${failedRequired.map((item) => item.id).join(",") || "-"}`);
  console.log(`BATCH_SUMMARY_STATUS=${report.batchSummary?.status || "-"}`);
  console.log(`PROCESSED_COUNT=${report.batchSummary?.processedCount ?? "-"}`);
  console.log(`SKIPPED_COUNT=${report.batchSummary?.skippedCount ?? "-"}`);
  console.log(`STATUS=${report.status}`);

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("SMARTWORK_BATCH_ORCHESTRATOR_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
