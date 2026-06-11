import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const INTAKE_DIR = path.join(ROOT, "intake", "requests");
const ACTIVE_FILE = path.join(ROOT, "data", "siaga-attendance-request.local.json");
const APP_FILE = path.join(ROOT, "reports", "smartwork-app-artifacts-report.json");
const LIVE_FILE = path.join(ROOT, "reports", "smartwork-live-progress-report.json");
const PROOF_FILE = path.join(ROOT, "reports", "proof", "smartwork-siaga-proof-report.json");
const REPORT_FILE = path.join(ROOT, "reports", "smartwork-request-promotion-report.json");

function pick(...v) {
  return v.find(x => typeof x === "string" && x.trim())?.trim() || "";
}

function ymdOk(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

async function exists(f) {
  try { await fs.access(f); return true; } catch { return false; }
}

async function readJson(f) {
  return JSON.parse(await fs.readFile(f, "utf8"));
}

function norm(raw, file = "") {
  const accounts = Array.isArray(raw.accounts) ? raw.accounts : [];
  const a = accounts[0] || {};
  const startDate = pick(a.startDate, raw.startDate, raw.schedule?.startDate, raw.dailyTargetDate?.startDate);
  const endDate = pick(a.endDate, raw.endDate, raw.schedule?.endDate, raw.dailyTargetDate?.endDate);
  return {
    file,
    raw,
    accounts,
    valid: ymdOk(startDate) && ymdOk(endDate) && startDate <= endDate,
    startDate,
    endDate,
    requestRange: startDate && endDate ? `${startDate}..${endDate}` : "",
    teacherId: pick(a.teacherId, raw.teacherId),
    teacherName: pick(a.teacherName, a.name, raw.teacherName),
    requesterName: pick(raw.requesterName, raw.name),
    email: pick(raw.email, raw.requesterEmail, raw.delivery?.email),
    whatsapp: pick(raw.whatsapp, raw.wa, raw.delivery?.whatsapp)
  };
}

function dates(startDate, endDate) {
  const out = [];
  for (
    let d = new Date(`${startDate}T00:00:00Z`);
    d <= new Date(`${endDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const iso = d.toISOString().slice(0, 10);
    out.push({ date: iso, isSunday: d.getUTCDay() === 0 });
  }
  return out;
}

async function backup(file, dir) {
  if (!(await exists(file))) return null;
  const rel = path.relative(ROOT, file);
  const dest = path.join(dir, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(file, dest);
  return path.relative(ROOT, dest);
}

async function main() {
  const files = (await fs.readdir(INTAKE_DIR, { withFileTypes: true }))
    .filter(x => x.isFile() && x.name.endsWith(".json"))
    .map(x => path.join(INTAKE_DIR, x.name));

  const candidates = [];
  for (const file of files) {
    try {
      const stat = await fs.stat(file);
      const raw = await readJson(file);
      const n = norm(raw, path.relative(ROOT, file));
      if (n.valid) candidates.push({ ...n, mtimeMs: stat.mtimeMs });
    } catch {}
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const latest = candidates[0];
  if (!latest) throw new Error("Tidak ada UI request valid di intake/requests.");

  const oldRaw = await exists(ACTIVE_FILE) ? await readJson(ACTIVE_FILE) : {};
  const old = norm(oldRaw, path.relative(ROOT, ACTIVE_FILE));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(ROOT, "backup-code", `promote-ui-request-${stamp}`);

  const backups = [];
  for (const f of [ACTIVE_FILE, APP_FILE, LIVE_FILE, PROOF_FILE]) {
    const b = await backup(f, backupDir);
    if (b) backups.push(b);
  }

  const allDates = dates(latest.startDate, latest.endDate);
  const workDates = allDates.filter(x => !x.isSunday).map(x => x.date);
  const skippedSunday = allDates.filter(x => x.isSunday).map(x => x.date);

  const nextActive = {
    ...oldRaw,
    ...latest.raw,
    source: "smartwork-user-request-form-promoted",
    requestSourceFile: latest.file,
    promotedAt: new Date().toISOString(),
    status: "REQUEST_PROMOTED_WAITING_TO_RUN",
    teacherId: pick(latest.teacherId, old.teacherId, "guru-001"),
    teacherName: pick(latest.teacherName, old.teacherName, "Nazrin"),
    requesterName: pick(latest.requesterName, old.requesterName, "Nazrin"),
    email: pick(latest.email, old.email),
    whatsapp: pick(latest.whatsapp, old.whatsapp),
    startDate: latest.startDate,
    endDate: latest.endDate,
    requestRange: latest.requestRange,
    accounts: (latest.accounts.length ? latest.accounts : oldRaw.accounts || []).map((a, i) => ({
      ...(oldRaw.accounts?.[i] || {}),
      ...a,
      teacherId: pick(a.teacherId, latest.teacherId, old.teacherId, "guru-001"),
      teacherName: pick(a.teacherName, a.name, latest.teacherName, old.teacherName, "Nazrin"),
      startDate: latest.startDate,
      endDate: latest.endDate
    }))
  };

  for (const k of ["TARGET_LIMIT", "targetLimit", "limit", "maxRows", "maxDays", "syncReason", "syncedAt"]) {
    delete nextActive[k];
  }

  const reset = {
    ok: true,
    mode: "REQUEST_PROMOTED_PROGRESS_RESET_ONLY_NO_SIAGA",
    generatedAt: new Date().toISOString(),
    status: "WAITING_TO_RUN",
    percent: 0,
    progressPercent: 0,
    request: {
      sourceFile: latest.file,
      teacherId: nextActive.teacherId,
      teacherName: nextActive.teacherName,
      startDate: latest.startDate,
      endDate: latest.endDate,
      requestRange: latest.requestRange
    },
    progress: {
      total: workDates.length,
      alreadyFilled: 0,
      saved: 0,
      needsPlan: workDates.length,
      skipped: skippedSunday.length,
      percent: 0
    },
    dates: { workDates, skippedSunday },
    safety: {
      browserOpened: false,
      siagaTouched: false,
      inputAttendance: false,
      saveSubmitDelete: false
    }
  };

  const app = {
    ok: true,
    mode: "SMARTWORK_APP_ARTIFACTS_RESET_AFTER_REQUEST_PROMOTION",
    generatedAt: new Date().toISOString(),
    status: "PENDING_RUN",
    deliveryPolicy: "APP_DOWNLOAD_ONLY_EMAIL_WHATSAPP_DISABLED",
    request: reset.request,
    progress: reset.progress,
    artifactGuard: {
      matchedActiveRequest: true,
      pdfReady: false,
      proofReady: false,
      staleArtifactsBackedUp: true
    },
    safety: reset.safety
  };

  const proof = {
    ok: true,
    mode: "SMARTWORK_PROOF_PENDING_AFTER_REQUEST_PROMOTION",
    generatedAt: new Date().toISOString(),
    status: "PENDING_RUN",
    request: reset.request,
    progress: reset.progress,
    proofReady: false,
    pdfReady: false,
    note: "Promoted latest UI request only. No SIAGA browser/input/save/delete was performed."
  };

  await fs.mkdir(path.dirname(ACTIVE_FILE), { recursive: true });
  await fs.mkdir(path.dirname(APP_FILE), { recursive: true });
  await fs.mkdir(path.dirname(PROOF_FILE), { recursive: true });

  await fs.writeFile(ACTIVE_FILE, JSON.stringify(nextActive, null, 2), "utf8");
  await fs.writeFile(APP_FILE, JSON.stringify(app, null, 2), "utf8");
  await fs.writeFile(LIVE_FILE, JSON.stringify(reset, null, 2), "utf8");
  await fs.writeFile(PROOF_FILE, JSON.stringify(proof, null, 2), "utf8");

  const report = {
    ok: true,
    mode: "PROMOTE_LATEST_VALID_UI_REQUEST_TO_ACTIVE_RESET_0",
    generatedAt: new Date().toISOString(),
    before: {
      activeRange: old.requestRange,
      activeFile: path.relative(ROOT, ACTIVE_FILE)
    },
    after: {
      activeRange: latest.requestRange,
      sourceFile: latest.file,
      teacherId: nextActive.teacherId,
      teacherName: nextActive.teacherName,
      progressPercent: 0,
      totalWorkDates: workDates.length,
      skippedSunday: skippedSunday.length
    },
    backups,
    filesWritten: [
      path.relative(ROOT, ACTIVE_FILE),
      path.relative(ROOT, APP_FILE),
      path.relative(ROOT, LIVE_FILE),
      path.relative(ROOT, PROOF_FILE),
      path.relative(ROOT, REPORT_FILE)
    ],
    safety: reset.safety
  };

  await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log("PROMOTED_ACTIVE_REQUEST=" + latest.requestRange);
  console.log("PROGRESS_RESET_PERCENT=0");
  console.log("TOTAL_WORK_DATES=" + workDates.length);
  console.log("SKIPPED_SUNDAY=" + skippedSunday.length);
  console.log("BACKUP_DIR=" + path.relative(ROOT, backupDir));
  console.log("REPORT=" + path.relative(ROOT, REPORT_FILE));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
