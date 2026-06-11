import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INTAKE_DIR = path.join(ROOT, "intake", "requests");
const ACTIVE_FILE = path.join(ROOT, "data", "siaga-attendance-request.local.json");
const REPORT_FILE = path.join(ROOT, "reports", "smartwork-request-promotion-diagnose-report.json");

function pick(...vals) {
  return vals.find(v => typeof v === "string" && v.trim())?.trim() || "";
}

function redact(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => {
    if (/pass|password|token|secret|key/i.test(k)) return v ? "***REDACTED***" : v;
    return v;
  }));
}

function normalizePayload(raw, file = "") {
  const r = raw || {};
  const accounts =
    Array.isArray(r.accounts) ? r.accounts :
    Array.isArray(r.request?.accounts) ? r.request.accounts :
    Array.isArray(r.payload?.accounts) ? r.payload.accounts :
    Array.isArray(r.data?.accounts) ? r.data.accounts :
    [];

  const acc = accounts[0] || r.account || r.request?.account || r.payload?.account || {};

  const startDate = pick(
    acc.startDate, acc.fromDate, acc.dateFrom,
    r.startDate, r.fromDate, r.dateFrom,
    r.request?.startDate, r.payload?.startDate, r.data?.startDate
  );

  const endDate = pick(
    acc.endDate, acc.toDate, acc.dateTo,
    r.endDate, r.toDate, r.dateTo,
    r.request?.endDate, r.payload?.endDate, r.data?.endDate
  );

  const teacherId = pick(acc.teacherId, acc.id, r.teacherId, r.request?.teacherId, r.payload?.teacherId, r.data?.teacherId);
  const teacherName = pick(acc.teacherName, acc.name, r.teacherName, r.name, r.request?.teacherName, r.payload?.teacherName, r.data?.teacherName);
  const requesterName = pick(r.requesterName, r.pemohonName, r.name, r.request?.requesterName, r.payload?.requesterName);
  const email = pick(r.email, r.requesterEmail, r.request?.email, r.payload?.email, acc.email);
  const whatsapp = pick(r.whatsapp, r.wa, r.request?.whatsapp, r.payload?.whatsapp, acc.whatsapp);

  const validDate = /^\d{4}-\d{2}-\d{2}$/;
  const valid = validDate.test(startDate) && validDate.test(endDate) && startDate <= endDate;

  return {
    file,
    valid,
    reason: valid ? "VALID_UI_REQUEST_DATES_FOUND" : "MISSING_OR_INVALID_START_END_DATE",
    startDate,
    endDate,
    requestRange: startDate && endDate ? `${startDate}..${endDate}` : "",
    teacherId,
    teacherName,
    requesterName,
    email: email ? "***REDACTED_EMAIL_PRESENT***" : "",
    whatsapp: whatsapp ? "***REDACTED_WA_PRESENT***" : "",
    accountsCount: accounts.length,
    keys: Object.keys(r).sort(),
    redactedPreview: redact({
      source: r.source,
      type: r.type,
      jobId: r.jobId,
      teacherId,
      teacherName,
      requesterName,
      startDate,
      endDate,
      accountsCount: accounts.length
    })
  };
}

async function readJson(file) {
  const txt = await fs.readFile(file, "utf8");
  return JSON.parse(txt);
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function main() {
  await fs.mkdir(path.dirname(REPORT_FILE), { recursive: true });

  const files = (await fs.readdir(INTAKE_DIR, { withFileTypes: true }).catch(() => []))
    .filter(d => d.isFile() && d.name.toLowerCase().endsWith(".json"))
    .map(d => path.join(INTAKE_DIR, d.name));

  const intake = [];
  for (const file of files) {
    try {
      const stat = await fs.stat(file);
      const raw = await readJson(file);
      intake.push({
        ...normalizePayload(raw, path.relative(ROOT, file)),
        mtimeMs: stat.mtimeMs,
        mtime: stat.mtime.toISOString()
      });
    } catch (err) {
      intake.push({
        file: path.relative(ROOT, file),
        valid: false,
        reason: `READ_OR_PARSE_FAILED: ${err.message}`
      });
    }
  }

  intake.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));
  const validIntake = intake.filter(x => x.valid);
  const latestValid = validIntake[0] || null;

  const activeExists = await exists(ACTIVE_FILE);
  const activeRaw = activeExists ? await readJson(ACTIVE_FILE) : null;
  const active = activeRaw ? normalizePayload(activeRaw, path.relative(ROOT, ACTIVE_FILE)) : null;

  const activeMatchesLatest =
    !!active && !!latestValid &&
    active.startDate === latestValid.startDate &&
    active.endDate === latestValid.endDate &&
    (!latestValid.teacherId || !active.teacherId || active.teacherId === latestValid.teacherId);

  const report = {
    ok: true,
    mode: "DIAGNOSE_ONLY_NO_PROMOTE_NO_SIAGA",
    generatedAt: new Date().toISOString(),
    checkpointExpected: "dac22e4",
    activeFile: path.relative(ROOT, ACTIVE_FILE),
    latestValidUiRequest: latestValid,
    activeRequest: active,
    finding: {
      activeExists,
      validIntakeCount: validIntake.length,
      activeMatchesLatest,
      promoteNeeded: !!latestValid && !activeMatchesLatest,
      expectedCurrentProblem:
        latestValid && active && !activeMatchesLatest
          ? `Latest UI request is ${latestValid.requestRange}, but active request is ${active.requestRange}`
          : null
    },
    recentIntake: intake.slice(0, 8),
    safety: {
      browserOpened: false,
      siagaTouched: false,
      saveSubmitDelete: false,
      writes: [path.relative(ROOT, REPORT_FILE)]
    }
  };

  await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log("\nDIAGNOSE_REPORT=" + path.relative(ROOT, REPORT_FILE));
  console.log("LATEST_VALID_UI_REQUEST=" + (latestValid?.requestRange || "NONE"));
  console.log("ACTIVE_REQUEST=" + (active?.requestRange || "NONE"));
  console.log("PROMOTE_NEEDED=" + report.finding.promoteNeeded);
  if (latestValid && active && !activeMatchesLatest) {
    console.log("ISSUE=" + report.finding.expectedCurrentProblem);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
