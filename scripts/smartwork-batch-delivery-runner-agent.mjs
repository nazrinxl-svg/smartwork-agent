import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const MODE = "SMARTWORK_BATCH_DELIVERY_RUNNER_V1_NO_AUTO_SEND";

const BATCH_PLAN_PATH =
  process.env.BATCH_PLAN_PATH || "reports/batch/smartwork-batch-plan-report.json";

const SOURCE_INTAKE_PATH =
  process.env.SOURCE_INTAKE_PATH || "intake/smartwork-job-request.sample.json";

const OUT_REPORT_PATH =
  process.env.OUT_REPORT_PATH || "reports/batch-delivery/smartwork-batch-delivery-runner-report.json";

const WORK_INTAKE_DIR = "reports/batch-delivery/intake-runtime";

const rules = {
  runDeliveryOnlyForPdfReadyAccounts: true,
  skipAccountsWithoutPdf: true,
  sendEmailAutomatically: false,
  sendWhatsAppAutomatically: false,
  save: false,
  submit: false,
  delete: false,
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`STOP: File tidak ditemukan: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function sanitizeFileName(input) {
  return String(input || "smartwork")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function runCommand(command, args, env = {}) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();

    const child = spawn(command, args, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...env,
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
        command: `${command} ${args.join(" ")}`,
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

function buildRuntimeDeliveryIntake({ batchPlan, sourceIntake, account }) {
  return {
    jobId: `${batchPlan?.job?.jobId || sourceIntake.jobId || "smartwork-job"}-${account.teacherId}`,
    teacherId: account.teacherId,
    teacherName: account.teacherName,
    targetMonth: batchPlan?.job?.targetMonth || sourceIntake.targetMonth,
    targetYear: batchPlan?.job?.targetYear || sourceIntake.targetYear,
    pdfName: account.targetPdfName,
    delivery: {
      email: batchPlan?.delivery?.email || sourceIntake?.delivery?.email,
      whatsapp: batchPlan?.delivery?.whatsapp || sourceIntake?.delivery?.whatsapp,
    },
  };
}

async function main() {
  console.log(`MODE=${MODE}`);
  console.log("RULE=PROCESS_DELIVERY_READY_ONLY_NO_AUTO_SEND");

  const batchPlan = readJson(BATCH_PLAN_PATH);
  const sourceIntake = readJson(SOURCE_INTAKE_PATH);

  const accounts = Array.isArray(batchPlan.accounts) ? batchPlan.accounts : [];

  const deliveryReadyAccounts = accounts.filter(
    (account) => account.status === "DELIVERY_READY" && account.pdfExists
  );

  const skippedAccounts = accounts
    .filter((account) => !(account.status === "DELIVERY_READY" && account.pdfExists))
    .map((account) => ({
      workerId: account.workerId,
      teacherId: account.teacherId,
      teacherName: account.teacherName,
      status: account.status,
      pdfExists: account.pdfExists,
      reason: "Skipped because account is not DELIVERY_READY or PDF is missing.",
      nextActions: account.nextActions || [],
    }));

  const results = [];

  fs.mkdirSync(WORK_INTAKE_DIR, { recursive: true });

  for (const account of deliveryReadyAccounts) {
    console.log(`\n=== BATCH DELIVERY ACCOUNT: ${account.teacherId} ${account.teacherName} ===`);

    const runtimeIntake = buildRuntimeDeliveryIntake({
      batchPlan,
      sourceIntake,
      account,
    });

    const runtimeIntakePath = path.join(
      WORK_INTAKE_DIR,
      `${sanitizeFileName(account.teacherId)}-delivery-request.json`
    );

    writeJson(runtimeIntakePath, runtimeIntake);

    const runResult = await runCommand("npm", ["run", "job:final"], {
      INTAKE_PATH: runtimeIntakePath,
    });

    results.push({
      workerId: account.workerId,
      teacherId: account.teacherId,
      teacherName: account.teacherName,
      runtimeIntakePath,
      pdfName: account.targetPdfName,
      pdfPath: account.pdfPath,
      ok: runResult.ok,
      status: runResult.ok ? "DELIVERY_RUN_OK_NO_AUTO_SEND" : "DELIVERY_RUN_NEEDS_CHECK",
      run: runResult,
    });
  }

  const failed = results.filter((item) => !item.ok);
  const report = {
    ok: failed.length === 0,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    rules,
    source: {
      batchPlanPath: BATCH_PLAN_PATH,
      sourceIntakePath: SOURCE_INTAKE_PATH,
      runtimeIntakeDir: WORK_INTAKE_DIR,
    },
    counts: {
      totalAccounts: accounts.length,
      deliveryReadyCount: deliveryReadyAccounts.length,
      processedCount: results.length,
      skippedCount: skippedAccounts.length,
      failedCount: failed.length,
    },
    processed: results,
    skipped: skippedAccounts,
    status: failed.length === 0
      ? "BATCH_DELIVERY_READY_NO_AUTO_SEND"
      : "BATCH_DELIVERY_NEEDS_CHECK",
    nextSafeStep:
      skippedAccounts.length > 0
        ? "Batch delivery selesai untuk akun PDF-ready. Akun skipped perlu proses SIAGA/download PDF terlebih dahulu."
        : "Semua akun PDF-ready sudah diproses delivery no-auto-send. Lanjut validasi summary atau real-send dengan provider valid.",
  };

  writeJson(OUT_REPORT_PATH, report);

  console.log(`\nREPORT=${OUT_REPORT_PATH}`);
  console.log(`TOTAL_ACCOUNTS=${report.counts.totalAccounts}`);
  console.log(`PROCESSED_COUNT=${report.counts.processedCount}`);
  console.log(`SKIPPED_COUNT=${report.counts.skippedCount}`);
  console.log(`FAILED_COUNT=${report.counts.failedCount}`);
  console.log(`STATUS=${report.status}`);

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("SMARTWORK_BATCH_DELIVERY_RUNNER_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
