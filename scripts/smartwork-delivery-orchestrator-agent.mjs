import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const MODE = "SMARTWORK_DELIVERY_ORCHESTRATOR_NO_AUTO_SEND";

const REPORT_PATH =
  process.env.OUT_REPORT_PATH || "reports/delivery-run/smartwork-delivery-run-report.json";

const steps = [
  {
    id: "delivery-preview",
    command: "npm",
    args: ["run", "delivery:preview"],
    required: true,
  },
  {
    id: "email-draft",
    command: "npm",
    args: ["run", "delivery:email-draft"],
    required: true,
  },
  {
    id: "whatsapp-preview",
    command: "npm",
    args: ["run", "delivery:whatsapp-preview"],
    required: true,
  },
  {
    id: "delivery-summary",
    command: "npm",
    args: ["run", "delivery:summary"],
    required: true,
  },
];

const rules = {
  sendEmailAutomatically: false,
  sendWhatsAppAutomatically: false,
  save: false,
  submit: false,
  delete: false,
  emailSendStepExcludedByDefault: true,
};

function runStep(step) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    console.log(`\n=== RUN STEP: ${step.id} ===`);

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
      const endedAt = new Date().toISOString();

      resolve({
        id: step.id,
        command: `${step.command} ${step.args.join(" ")}`,
        required: step.required,
        code,
        ok: code === 0,
        startedAt,
        endedAt,
        stdoutTail: stdout.slice(-3000),
        stderrTail: stderr.slice(-3000),
      });
    });
  });
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
}

async function main() {
  console.log(`MODE=${MODE}`);
  console.log("RULE=RUN_DELIVERY_PREVIEW_DRAFT_WHATSAPP_SUMMARY_NO_AUTO_SEND");

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
  const ok = failedRequired.length === 0;

  const report = {
    ok,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    rules,
    steps: results,
    failedRequiredSteps: failedRequired.map((item) => item.id),
    status: ok ? "DELIVERY_RUN_READY_NO_AUTO_SEND" : "DELIVERY_RUN_NEEDS_CHECK",
    nextSafeStep: ok
      ? "Delivery run selesai. Cek summary report. Email real-send tetap perlu SMTP valid dan konfirmasi runtime."
      : "Ada step wajib gagal. Cek stdoutTail/stderrTail pada report.",
  };

  writeReport(report);

  console.log(`\nREPORT=${REPORT_PATH}`);
  console.log(`STEPS_OK=${ok}`);
  console.log(`FAILED_REQUIRED=${failedRequired.map((item) => item.id).join(",") || "-"}`);
  console.log(`STATUS=${report.status}`);

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("SMARTWORK_DELIVERY_ORCHESTRATOR_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
