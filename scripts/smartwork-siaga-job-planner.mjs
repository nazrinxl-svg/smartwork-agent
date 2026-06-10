import fs from "fs";
import path from "path";

const root = process.cwd();

const accountsPath = path.join(root, "data", "teacher-accounts.local.json");
const requestPath = path.join(root, "data", "siaga-attendance-request.local.json");
const timeRulesPath = path.join(root, "configs", "siaga-system-time-rules.json");
const reportsDir = path.join(root, "reports");

fs.mkdirSync(reportsDir, { recursive: true });


/* SMARTWORK_PLANNER_UI_REQUEST_SCHEMA_COMPAT_V1 */
function smartworkNormalizeUiRequestSchemaForPlanner(request) {
  if (!request || typeof request !== "object") return request;

  request.target = request.target && typeof request.target === "object" ? request.target : {};

  if (!request.target.month && request.targetMonth) {
    request.target.month = request.targetMonth;
  }

  if ((request.target.year == null || request.target.year === "") && request.targetYear) {
    const y = Number(request.targetYear);
    request.target.year = Number.isFinite(y) ? y : request.targetYear;
  }

  if (!request.appId && request.service) {
    request.appId = request.service;
  }

  if (!request.requestId && request.jobId) {
    request.requestId = request.jobId;
  }

  request.rules = request.rules && typeof request.rules === "object" ? request.rules : {};
  if (request.source === "smartwork-user-request-form") {
    request.rules.userDoesNotProvideTimeRules = true;
    request.rules.saveRequiresExplicitPermission = true;
  }

  request.schedule = request.schedule && typeof request.schedule === "object" ? request.schedule : {};
  if (!Array.isArray(request.schedule.holidayDates)) request.schedule.holidayDates = request.holidays || [];
  if (!Array.isArray(request.schedule.globalLeaveDates)) request.schedule.globalLeaveDates = request.leaveDays || [];

  return request;
}
/* END_SMARTWORK_PLANNER_UI_REQUEST_SCHEMA_COMPAT_V1 */

function now() {
  return new Date().toISOString();
}

function readJsonSafe(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} tidak ditemukan: ${path.relative(root, filePath)}`);
  }

  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
  return JSON.parse(raw);
}

function normalizeMonthName(month) {
  const text = String(month || "").trim();

  const aliases = {
    "1": "Januari",
    "01": "Januari",
    "januari": "Januari",
    "2": "Februari",
    "02": "Februari",
    "februari": "Februari",
    "3": "Maret",
    "03": "Maret",
    "maret": "Maret",
    "4": "April",
    "04": "April",
    "april": "April",
    "5": "Mei",
    "05": "Mei",
    "mei": "Mei",
    "6": "Juni",
    "06": "Juni",
    "juni": "Juni",
    "7": "Juli",
    "07": "Juli",
    "juli": "Juli",
    "8": "Agustus",
    "08": "Agustus",
    "agustus": "Agustus",
    "9": "September",
    "09": "September",
    "september": "September",
    "10": "Oktober",
    "oktober": "Oktober",
    "11": "November",
    "november": "November",
    "12": "Desember",
    "desember": "Desember"
  };

  return aliases[text.toLowerCase()] || text;
}

function readAccounts() {
  const raw = readJsonSafe(accountsPath, "File akun lokal");
  const accounts = Array.isArray(raw.accounts)
    ? raw.accounts
    : Array.isArray(raw.teachers)
      ? raw.teachers
      : [];

  return accounts
    .filter((item) => item && item.enabled !== false)
    .map((item, index) => {
      const appsArray = Array.isArray(item.apps) ? item.apps : [];
      const siagaApp =
        appsArray.find((app) => /siaga/i.test(String(app?.appId || app?.app || app?.name || app?.id || app?.type || ""))) ||
        appsArray[0] ||
        {};

      const username =
        item.username ||
        item.login ||
        item.user ||
        item.akun ||
        item.account ||
        item.nip ||
        item.nuptk ||
        siagaApp.username ||
        siagaApp.login ||
        siagaApp.user ||
        siagaApp.akun ||
        siagaApp.account ||
        siagaApp.nip ||
        siagaApp.nuptk ||
        "";

      const password =
        item.password ||
        item.pass ||
        item.sandi ||
        siagaApp.password ||
        siagaApp.pass ||
        siagaApp.sandi ||
        "";

      return {
        workerIndex: index,
        teacherId: item.teacherId || `guru-${String(index + 1).padStart(3, "0")}`,
        teacherName: item.teacherName || item.name || `Guru ${index + 1}`,
        wa: item.wa || "",
        appId: siagaApp.appId || "siaga",
        credential: {
          hasUsername: Boolean(username),
          hasPassword: Boolean(password)
        }
      };
    });
}

function validateRequest(request) {
  const errors = [];
  const warnings = [];

  const month = normalizeMonthName(request?.target?.month);
  const year = Number(request?.target?.year);

  if (!month) errors.push("target.month wajib diisi.");
  if (!year || Number.isNaN(year)) errors.push("target.year wajib angka.");

  if (request?.rules?.userDoesNotProvideTimeRules !== true) {
    warnings.push("rules.userDoesNotProvideTimeRules sebaiknya true untuk SIAGA.");
  }

  if (request?.rules?.saveRequiresExplicitPermission !== true) {
    warnings.push("rules.saveRequiresExplicitPermission wajib true sebelum mode save.");
  }

  const holidays = Array.isArray(request.holidays) ? request.holidays : [];
  const leaveDays = Array.isArray(request.leaveDays) ? request.leaveDays : [];

  for (const item of [...holidays, ...leaveDays]) {
    if (!item.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date))) {
      errors.push(`Tanggal exception tidak valid: ${JSON.stringify(item)}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalizedTarget: {
      month,
      year
    }
  };
}

function createJobs(accounts, request, normalizedTarget) {
  return accounts.map((account, index) => ({
    jobId: `${request.requestId || "siaga-request"}-${account.teacherId}`,
    sequence: index + 1,
    teacherId: account.teacherId,
    teacherName: account.teacherName,
    wa: account.wa,
    appId: "siaga",
    target: normalizedTarget,
    exceptions: {
      holidays: Array.isArray(request.holidays) ? request.holidays : [],
      leaveDays: Array.isArray(request.leaveDays) ? request.leaveDays : []
    },
    safety: {
      loginCheckRequired: true,
      targetMonthFinderRequired: true,
      createTargetMonthIfMissing: true,
      dryRunPlanRequired: true,
      saveRequiresExplicitPermission: true,
      userProvidedTimeRulesForbidden: true
    },
    credentialReady: account.credential.hasUsername && account.credential.hasPassword,
    plannedStages: [
      "login_check",
      "dashboard_check",
      "absensi_open_preview",
      "strict_target_month_find",
      "create_target_month_preview_if_missing",
      "dry_run_time_plan",
      "wait_for_user_save_permission"
    ]
  }));
}

function main() {
  console.log("SMARTWORK_SIAGA_JOB_PLANNER=START");
  console.log("RULE=PLAN_ONLY_NO_BROWSER_NO_LOGIN_NO_SAVE");

  let request = readJsonSafe(requestPath, "Request lokal SIAGA");
request = smartworkNormalizeUiRequestSchemaForPlanner(request);
  const timeRules = readJsonSafe(timeRulesPath, "SIAGA system time rules");
  const accounts = readAccounts();

  const validation = validateRequest(request);

  const parallelLimit = Number(request.parallelLimit || 2);

  const jobs = validation.ok
    ? createJobs(accounts, request, validation.normalizedTarget)
    : [];

  const report = {
    ok: validation.ok && jobs.every((job) => job.credentialReady),
    mode: "siaga-job-planner",
    rule: "PLAN_ONLY_NO_BROWSER_NO_LOGIN_NO_SAVE",
    requestFile: path.relative(root, requestPath).replaceAll("\\", "/"),
    accountFile: "data/teacher-accounts.local.json",
    credentialPolicy: {
      noCredentialsPrinted: true,
      localOnly: true,
      gitIgnored: true
    },
    request: {
      requestId: request.requestId || null,
      appId: request.appId || "siaga",
      target: validation.normalizedTarget,
      parallelLimit,
      mode: request.mode || "preview",
      holidaysCount: Array.isArray(request.holidays) ? request.holidays.length : 0,
      leaveDaysCount: Array.isArray(request.leaveDays) ? request.leaveDays.length : 0
    },
    systemTimeRulesLoaded: Boolean(timeRules?.rules),
    validation,
    summary: {
      totalAccounts: accounts.length,
      totalJobs: jobs.length,
      credentialReady: jobs.filter((job) => job.credentialReady).length,
      credentialMissing: jobs.filter((job) => !job.credentialReady).length,
      parallelLimit,
      batches: Math.ceil(jobs.length / Math.max(parallelLimit, 1))
    },
    jobs,
    createdAt: now()
  };

  const reportPath = path.join(reportsDir, "siaga-job-planner-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("SMARTWORK_SIAGA_JOB_PLANNER=DONE");
  console.log("REPORT=" + reportPath);
  console.log(JSON.stringify(report.summary, null, 2));

  if (!report.ok) {
    console.log("PLAN_STATUS=NEEDS_CHECK");
    process.exitCode = 1;
  }
}

main();
