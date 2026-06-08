import fs from "fs";
import path from "path";

const MODE = "SMARTWORK_INTAKE_VALIDATOR_V1_MULTI_ACCOUNT";

const INTAKE_PATH =
  process.env.INTAKE_PATH || "intake/smartwork-job-request.sample.json";

const OUT_REPORT_PATH =
  process.env.OUT_REPORT_PATH || "reports/intake/smartwork-intake-validator-report.json";

const allowedServices = new Set(["siaga"]);
const allowedModes = new Set(["attendance-monthly"]);

const safeRules = {
  autoSave: false,
  autoSubmit: false,
  autoDelete: false,
  sendEmailAutomatically: false,
  sendWhatsAppAutomatically: false,
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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function isValidWhatsApp(wa) {
  return /^62\d{8,15}$/.test(String(wa || "").trim());
}

function isNonEmpty(value) {
  return String(value || "").trim().length > 0;
}

function validateDateList(name, value, errors, warnings, accountLabel) {
  if (!Array.isArray(value)) {
    errors.push(`${accountLabel}.${name} harus array.`);
    return;
  }

  for (const item of value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(item || ""))) {
      warnings.push(`${accountLabel}.${name} berisi format bukan YYYY-MM-DD: ${item}`);
    }
  }
}

function validateAccount(account, index) {
  const errors = [];
  const warnings = [];
  const label = `accounts[${index}]`;

  if (!isNonEmpty(account.teacherId)) errors.push(`${label}.teacherId wajib diisi.`);
  if (!isNonEmpty(account.teacherName)) errors.push(`${label}.teacherName wajib diisi.`);
  if (!isNonEmpty(account.schoolName)) errors.push(`${label}.schoolName wajib diisi.`);
  if (!isNonEmpty(account.targetPdfName)) warnings.push(`${label}.targetPdfName belum diisi. Delivery PDF mungkin perlu fallback.`);

  validateDateList("skipDates", account.skipDates || [], errors, warnings, label);
  validateDateList("leaveDates", account.leaveDates || [], errors, warnings, label);

  const pdfPath = account.targetPdfName
    ? path.join("reports", "downloads", account.targetPdfName)
    : null;

  return {
    ok: errors.length === 0,
    teacherId: account.teacherId || null,
    teacherName: account.teacherName || null,
    schoolName: account.schoolName || null,
    targetPdfName: account.targetPdfName || null,
    pdfPath,
    pdfExists: Boolean(pdfPath && fs.existsSync(pdfPath)),
    skipDatesCount: Array.isArray(account.skipDates) ? account.skipDates.length : 0,
    leaveDatesCount: Array.isArray(account.leaveDates) ? account.leaveDates.length : 0,
    errors,
    warnings,
  };
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(OUT_REPORT_PATH), { recursive: true });
  fs.writeFileSync(OUT_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
}

async function main() {
  console.log(`MODE=${MODE}`);
  console.log("RULE=VALIDATE_ONLY_NO_LOGIN_NO_INPUT_NO_SAVE_NO_SEND");

  const intake = readJson(INTAKE_PATH);

  const errors = [];
  const warnings = [];

  if (!isNonEmpty(intake.jobId)) errors.push("jobId wajib diisi.");
  if (!allowedServices.has(intake.service)) errors.push(`service tidak didukung: ${intake.service}`);
  if (!allowedModes.has(intake.mode)) errors.push(`mode tidak didukung: ${intake.mode}`);
  if (!isNonEmpty(intake.targetMonth)) errors.push("targetMonth wajib diisi.");
  if (!isNonEmpty(intake.targetYear)) errors.push("targetYear wajib diisi.");

  const email = String(intake?.delivery?.email || "").trim();
  const whatsapp = normalizeWhatsApp(intake?.delivery?.whatsapp || "");

  if (!isValidEmail(email)) errors.push("delivery.email tidak valid.");
  if (!isValidWhatsApp(whatsapp)) errors.push("delivery.whatsapp tidak valid. Gunakan format 62xxxxxxxxxx.");

  const rules = intake.rules || {};

  for (const [key, expected] of Object.entries(safeRules)) {
    if (rules[key] !== expected) {
      errors.push(`rules.${key} harus ${expected} pada validator aman V1.`);
    }
  }

  if (!Array.isArray(intake.accounts) || intake.accounts.length === 0) {
    errors.push("accounts wajib array dan minimal 1 akun.");
  }

  const accountReports = Array.isArray(intake.accounts)
    ? intake.accounts.map((account, index) => validateAccount(account, index))
    : [];

  for (const accountReport of accountReports) {
    for (const error of accountReport.errors) errors.push(error);
    for (const warning of accountReport.warnings) warnings.push(warning);
  }

  const duplicateTeacherIds = [];
  const seen = new Set();

  for (const account of accountReports) {
    if (!account.teacherId) continue;
    if (seen.has(account.teacherId)) duplicateTeacherIds.push(account.teacherId);
    seen.add(account.teacherId);
  }

  if (duplicateTeacherIds.length) {
    errors.push(`teacherId duplikat: ${duplicateTeacherIds.join(", ")}`);
  }

  const pdfReadyCount = accountReports.filter((item) => item.pdfExists).length;

  const report = {
    ok: errors.length === 0,
    mode: MODE,
    generatedAt: new Date().toISOString(),
    intakePath: INTAKE_PATH,
    job: {
      jobId: intake.jobId || null,
      service: intake.service || null,
      mode: intake.mode || null,
      targetMonth: intake.targetMonth || null,
      targetYear: intake.targetYear || null,
    },
    delivery: {
      email,
      emailValid: isValidEmail(email),
      whatsapp,
      whatsappValid: isValidWhatsApp(whatsapp),
    },
    safety: {
      validateOnly: true,
      noLogin: true,
      noInput: true,
      noSave: true,
      noSubmit: true,
      noSend: true,
      requiredRules: safeRules,
    },
    counts: {
      accountCount: accountReports.length,
      pdfReadyCount,
      pdfMissingCount: Math.max(0, accountReports.length - pdfReadyCount),
      errorCount: errors.length,
      warningCount: warnings.length,
    },
    accounts: accountReports,
    errors,
    warnings,
    status: errors.length === 0 ? "INTAKE_VALID_READY" : "INTAKE_NEEDS_CHECK",
    nextSafeStep:
      errors.length === 0
        ? "Intake multi-account valid. Next: buat batch planner yang memecah request menjadi job per akun tanpa auto-save/auto-send."
        : "Perbaiki field intake yang error sebelum lanjut batch planner.",
  };

  writeReport(report);

  console.log(`REPORT=${OUT_REPORT_PATH}`);
  console.log(`INTAKE_OK=${report.ok}`);
  console.log(`ACCOUNT_COUNT=${report.counts.accountCount}`);
  console.log(`PDF_READY_COUNT=${report.counts.pdfReadyCount}`);
  console.log(`ERROR_COUNT=${report.counts.errorCount}`);
  console.log(`WARNING_COUNT=${report.counts.warningCount}`);
  console.log(`STATUS=${report.status}`);

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("SMARTWORK_INTAKE_VALIDATOR_ERROR");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
