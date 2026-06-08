import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const MODE = "SMARTWORK_SIAGA_PROOF_DELIVERY_RUNNER_V1_SIMPLE";

const OUT_REPORT_PATH =
  process.env.OUT_REPORT_PATH || "reports/proof-delivery/smartwork-siaga-proof-delivery-run-report.json";

const steps = [
  {
    id: "delivery-preview",
    command: "npm",
    args: ["run", "delivery:preview"],
    required: true,
  },
  {
    id: "proof-report",
    command: "npm",
    args: ["run", "proof:report"],
    required: true,
  },
  {
    id: "email-draft-with-proof",
    command: "npm",
    args: ["run", "delivery:email-draft"],
    required: true,
  },
  {
    id: "whatsapp-preview-with-proof",
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
  simpleFinalRunner: true,
  runAfterSiagaWorkDone: true,
  requirePdfAlreadyDownloaded: true,
  sendEmailAutomatically: false,
  sendWhatsAppAutomatically: false,
  noLogin: true,
  noInput: true,
  noSave: true,
  noSubmit: true,
  noDelete: true,
};

function runStep(step) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();

    console.log(`\n=== RUN PROOF DELIVERY STEP: ${step.id} ===`);

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

function fileExists(filePath) {
  return Boolean(filePath && fs.existsSync(filePath));
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(OUT_REPORT_PATH), { recursive: true });
  fs.writeFileSync(OUT_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
}

async function main() {
  console.log(`MODE=${MODE}`);
  console.log("RULE=AFTER_SIAGA_DONE_PREPARE_PDF_PROOF_EMAIL_DRAFT_WHATSAPP_SUMMARY_NO_SEND");

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

  const proof = readJsonIfExists("reports/proof/smartwork-siaga-proof-report.json");
  const emailDraft = readJsonIfExists("reports/delivery-drafts/smartwork-email-draft-report.json");
  const whatsappPreview = readJsonIfExists("reports/whatsapp-preview/smartwork-whatsapp-preview-report.json");
  const summary = readJsonIfExists("reports/delivery-summary/smartwork-delivery-summary-report.json");

  const proofReportPath = "reports/proof/smartwork-siaga-proof-report.txt";
  const emailDraftPath = emailDraft?.draft?.filePath || null;
  const pdfPath = proof?.files?.pdfPath || summary?.files?.pdf?.path || null;

  const checks = {
    proofReady: Boolean(proof?.ok && fileExists(proofReportPath)),
    pdfFound: Boolean(fileExists(pdfPath)),
    emailDraftReady: Boolean(emailDraft?.ok && fileExists(emailDraftPath)),
    emailDraftHasPdf: Boolean(
      Array.isArray(emailDraft?.attachments) &&
      emailDraft.attachments.some((item) => item.type === "pdf" && item.exists)
    ),
    emailDraftHasProof: Boolean(
      Array.isArray(emailDraft?.attachments) &&
      emailDraft.attachments.some((item) => item.type === "proof-report" && item.exists)
    ),
    whatsappPreviewReady: Boolean(whatsappPreview?.ok),
    whatsappPreparedPdf: Boolean(
      Array.isArray(whatsappPreview?.preparedFiles) &&
      whatsappPreview.preparedFiles.some((item) => item.type === "pdf" && item.exists)
    ),
    whatsappPreparedProof: Boolean(
      Array.isArray(whatsappPreview?.preparedFiles) &&
      whatsappPreview.preparedFiles.some((item) => item.type === "proof-report" && item.exists)
    ),
    emailSent: Boolean(summary?.checks?.emailSent || summary?.delivery?.email?.sent),
  };

  const ok = failedRequired.length === 0 &&
    checks.proofReady &&
    checks.pdfFound &&
    checks.emailDraftReady &&
    checks.emailDraftHasPdf &&
    checks.emailDraftHasProof &&
    checks.whatsappPreviewReady &&
    checks.whatsappPreparedPdf &&
    checks.whatsappPreparedProof;

  const report = {
    ok,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    rules,
    steps: results,
    failedRequiredSteps: failedRequired.map((item) => item.id),
    job: proof
      ? {
          teacherId: proof?.teacher?.teacherId || null,
          teacherName: proof?.teacher?.teacherName || null,
          targetMonth: proof?.period?.month || null,
          targetYear: proof?.period?.year || null,
        }
      : null,
    files: {
      pdfPath,
      proofReportPath,
      emailDraftPath,
    },
    delivery: {
      emailTo: emailDraft?.email?.to || summary?.delivery?.email?.to || null,
      whatsappTo: whatsappPreview?.delivery?.whatsapp || summary?.delivery?.whatsapp?.to || null,
      emailSent: checks.emailSent,
      emailDraftReady: checks.emailDraftReady,
      whatsappPreviewReady: checks.whatsappPreviewReady,
    },
    checks,
    status: ok ? "SIAGA_PROOF_DELIVERY_READY_NO_SEND" : "SIAGA_PROOF_DELIVERY_NEEDS_CHECK",
    nextSafeStep: ok
      ? "PDF dan laporan bukti siap. Email draft berisi PDF+laporan, WhatsApp preview berisi pesan bukti. Real-send butuh provider valid dan konfirmasi."
      : "Cek step/checks yang false sebelum membagikan bukti.",
  };

  writeReport(report);

  console.log(`\nREPORT=${OUT_REPORT_PATH}`);
  console.log(`PROOF_READY=${checks.proofReady}`);
  console.log(`PDF_FOUND=${checks.pdfFound}`);
  console.log(`EMAIL_DRAFT_READY=${checks.emailDraftReady}`);
  console.log(`EMAIL_DRAFT_HAS_PDF=${checks.emailDraftHasPdf}`);
  console.log(`EMAIL_DRAFT_HAS_PROOF=${checks.emailDraftHasProof}`);
  console.log(`WHATSAPP_PREVIEW_READY=${checks.whatsappPreviewReady}`);
  console.log(`WHATSAPP_PREPARED_PDF=${checks.whatsappPreparedPdf}`);
  console.log(`WHATSAPP_PREPARED_PROOF=${checks.whatsappPreparedProof}`);
  console.log(`EMAIL_SENT=${checks.emailSent}`);
  console.log(`STATUS=${report.status}`);

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("SMARTWORK_SIAGA_PROOF_DELIVERY_RUNNER_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
