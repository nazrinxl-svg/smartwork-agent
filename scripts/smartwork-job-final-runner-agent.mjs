import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const MODE = "SMARTWORK_JOB_FINAL_RUNNER_V1_DELIVERY_ONLY_SAFE";

const INTAKE_PATH =
  process.env.INTAKE_PATH || "intake/delivery-request.sample.json";

const OUT_REPORT_PATH =
  process.env.OUT_REPORT_PATH || "reports/job-final/smartwork-job-final-runner-report.json";

const rules = {
  deliveryOnly: true,
  runSiagaInput: false,
  runSiagaSave: false,
  runSiagaSubmit: false,
  sendEmailAutomatically: false,
  sendWhatsAppAutomatically: false,
  delete: false,
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`STOP: Intake tidak ditemukan: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

function normalizeWhatsApp(input) {
  const raw = String(input || "").trim();
  const digits = raw.replace(/[^\d]/g, "");

  if (!digits) return "";
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;

  return digits;
}

function validateIntake(data) {
  const missing = [];

  if (!data.jobId) missing.push("jobId");
  if (!data.teacherId) missing.push("teacherId");
  if (!data.teacherName) missing.push("teacherName");
  if (!data.targetMonth) missing.push("targetMonth");
  if (!data.targetYear) missing.push("targetYear");
  if (!data.pdfName) missing.push("pdfName");
  if (!data?.delivery?.email) missing.push("delivery.email");
  if (!data?.delivery?.whatsapp) missing.push("delivery.whatsapp");

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(data?.delivery?.email || "").trim()
  );

  const whatsapp = normalizeWhatsApp(data?.delivery?.whatsapp || "");
  const whatsappValid = /^62\d{8,15}$/.test(whatsapp);

  return {
    ok: missing.length === 0 && emailValid && whatsappValid,
    missing,
    emailValid,
    whatsapp,
    whatsappValid,
  };
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();

    const child = spawn(command, args, {
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
  console.log("RULE=DELIVERY_ONLY_NO_AUTO_SEND_NO_SIAGA_INPUT");

  const intake = readJson(INTAKE_PATH);
  const validation = validateIntake(intake);

  const pdfPath = path.join("reports", "downloads", intake.pdfName || "");
  const pdfFound = Boolean(intake.pdfName && fs.existsSync(pdfPath));

  const baseReport = {
    ok: false,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    rules,
    intakePath: INTAKE_PATH,
    job: {
      jobId: intake.jobId || null,
      teacherId: intake.teacherId || null,
      teacherName: intake.teacherName || null,
      targetMonth: intake.targetMonth || null,
      targetYear: intake.targetYear || null,
    },
    delivery: {
      email: intake?.delivery?.email || null,
      whatsapp: validation.whatsapp || null,
    },
    validation,
    pdf: {
      expectedPath: pdfPath,
      found: pdfFound,
      fileName: intake.pdfName || null,
    },
    deliveryRun: null,
    summary: null,
  };

  if (!validation.ok) {
    baseReport.reason = "Intake belum valid.";
    writeReport(baseReport);
    console.log(`VALIDATION_OK=false`);
    console.log(`MISSING=${validation.missing.join(",") || "-"}`);
    console.log("STATUS=JOB_FINAL_NEEDS_CHECK_INTAKE");
    process.exitCode = 1;
    return;
  }

  if (!pdfFound) {
    baseReport.reason = "PDF belum ditemukan. Jalankan download PDF terlebih dahulu.";
    writeReport(baseReport);
    console.log("PDF_FOUND=false");
    console.log("STATUS=JOB_FINAL_NEEDS_PDF_DOWNLOAD");
    process.exitCode = 1;
    return;
  }

  console.log("VALIDATION_OK=true");
  console.log("PDF_FOUND=true");
  console.log("\n=== RUN DELIVERY PIPELINE ===");

  const deliveryRun = await runCommand("npm", ["run", "delivery:run"]);

  const summary =
    readJsonIfExists("reports/delivery-summary/smartwork-delivery-summary-report.json") ||
    null;

  const finalOk = Boolean(deliveryRun.ok && summary?.checks?.pdfFound);

  const report = {
    ...baseReport,
    ok: finalOk,
    generatedAt: new Date().toISOString(),
    deliveryRun,
    summary: summary
      ? {
          overallStatus: summary.overallStatus,
          pdfFound: summary?.checks?.pdfFound,
          emailDraftReady: summary?.checks?.emailDraftReady,
          emailSent: summary?.checks?.emailSent,
          whatsappPreviewReady: summary?.checks?.whatsappPreviewReady,
          nextSafeStep: summary.nextSafeStep,
        }
      : null,
    status: finalOk ? "JOB_FINAL_READY_NO_AUTO_SEND" : "JOB_FINAL_NEEDS_CHECK",
    nextSafeStep: finalOk
      ? "Job final runner selesai. PDF, email draft, WhatsApp preview, dan summary siap. Real-send tetap butuh SMTP valid/WhatsApp API dan konfirmasi."
      : "Delivery run gagal atau summary tidak lengkap. Cek report delivery-run dan delivery-summary.",
  };

  writeReport(report);

  console.log(`\nREPORT=${OUT_REPORT_PATH}`);
  console.log(`DELIVERY_RUN_OK=${deliveryRun.ok}`);
  console.log(`SUMMARY_STATUS=${summary?.overallStatus || "-"}`);
  console.log(`EMAIL_SENT=${summary?.checks?.emailSent ?? false}`);
  console.log(`WHATSAPP_PREVIEW_READY=${summary?.checks?.whatsappPreviewReady ?? false}`);
  console.log(`STATUS=${report.status}`);

  if (!finalOk) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("SMARTWORK_JOB_FINAL_RUNNER_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
