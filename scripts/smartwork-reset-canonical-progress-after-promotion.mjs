import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const ACTIVE_FILE = path.join(ROOT, "data", "siaga-attendance-request.local.json");
const APP_FILE = path.join(ROOT, "reports", "smartwork-app-artifacts-report.json");
const FINAL_FILE = path.join(ROOT, "reports", "smartwork-final-progress-report.json");
const LIVE_STATE_FILE = path.join(ROOT, "reports", "smartwork-progress-live-state.json");
const LIVE_ALIAS_FILE = path.join(ROOT, "reports", "smartwork-live-progress-report.json");
const PROOF_FILE = path.join(ROOT, "reports", "proof", "smartwork-siaga-proof-report.json");
const REPORT_FILE = path.join(ROOT, "reports", "smartwork-reset-canonical-progress-report.json");

function pick(...vals) {
  return vals.find(v => typeof v === "string" && v.trim())?.trim() || "";
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function readJson(file, fallback = {}) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function backup(file, backupDir) {
  if (!(await exists(file))) return null;
  const rel = path.relative(ROOT, file);
  const dest = path.join(backupDir, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(file, dest);
  return path.relative(ROOT, dest);
}

function eachDate(startDate, endDate) {
  const out = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const day = d.getUTCDay();
    out.push({ date: iso, isSunday: day === 0 });
  }
  return out;
}

async function main() {
  const active = await readJson(ACTIVE_FILE, null);
  if (!active) throw new Error("Active request missing.");

  const account = Array.isArray(active.accounts) ? active.accounts[0] || {} : {};
  const startDate = pick(active.startDate, account.startDate);
  const endDate = pick(active.endDate, account.endDate);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error(`Invalid active request range: ${startDate}..${endDate}`);
  }

  const requestRange = `${startDate}..${endDate}`;
  const allDates = eachDate(startDate, endDate);
  const workDates = allDates.filter(x => !x.isSunday).map(x => x.date);
  const skippedSunday = allDates.filter(x => x.isSunday).map(x => x.date);

  const teacherId = pick(active.teacherId, account.teacherId, "guru-001");
  const teacherName = pick(active.teacherName, account.teacherName, account.name, "Nazrin");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(ROOT, "backup-code", `reset-canonical-progress-${stamp}`);

  const backups = [];
  for (const file of [APP_FILE, FINAL_FILE, LIVE_STATE_FILE, LIVE_ALIAS_FILE, PROOF_FILE]) {
    const b = await backup(file, backupDir);
    if (b) backups.push(b);
  }

  const request = {
    source: active.source || "smartwork-user-request-form-promoted",
    sourceFile: active.requestSourceFile || null,
    teacherId,
    teacherName,
    startDate,
    endDate,
    requestRange
  };

  const progress = {
    total: workDates.length,
    alreadyFilled: 0,
    saved: 0,
    needsPlan: workDates.length,
    skipped: skippedSunday.length,
    percent: 0
  };

  const safety = {
    browserOpened: false,
    siagaTouched: false,
    inputAttendance: false,
    saveSubmitDelete: false
  };

  const liveState = {
    ok: true,
    mode: "SMARTWORK_CANONICAL_LIVE_STATE_RESET_AFTER_REQUEST_PROMOTION",
    updatedAt: new Date().toISOString(),
    request,
    percent: 0,
    stage: "Menunggu proses",
    status: "pending",
    message: "Request UI baru sudah aktif. Progress direset ke 0% dan menunggu runner SIAGA dijalankan.",
    progress,
    artifacts: {
      pdfReady: false,
      proofReady: false,
      uiTitle: "Menunggu Diproses"
    },
    history: [
      {
        at: new Date().toISOString(),
        percent: 0,
        stage: "Menunggu proses",
        status: "pending",
        message: "Canonical progress state reset after UI request promotion."
      }
    ],
    safety
  };

  const finalProgress = {
    ok: false,
    mode: "SMARTWORK_FINAL_PROGRESS_PENDING_AFTER_REQUEST_PROMOTION",
    generatedAt: new Date().toISOString(),
    verifyComplete: false,
    request,
    summary: {
      total: workDates.length,
      alreadyFilled: 0,
      skip: skippedSunday.length,
      needsPlan: workDates.length
    },
    requestedDatesResult: {
      remainingNeedsPlanInsideRequest: workDates.map(date => ({
        isoDate: date,
        status: "pending_run"
      }))
    },
    artifacts: {
      pdfReady: false,
      proofReady: false,
      pdfPath: null,
      proofPath: null
    },
    uiText: {
      title: "Menunggu Diproses",
      subtitle: "Request baru sudah aktif dan belum dijalankan.",
      pdfLabel: "PDF belum tersedia",
      proofLabel: "Bukti laporan belum tersedia"
    },
    safety
  };

  const appArtifacts = {
    ok: true,
    mode: "SMARTWORK_APP_ARTIFACTS_PENDING_AFTER_REQUEST_PROMOTION",
    generatedAt: new Date().toISOString(),
    status: "PENDING_RUN",
    deliveryPolicy: "APP_DOWNLOAD_ONLY_EMAIL_WHATSAPP_DISABLED",
    request,
    progress,
    artifacts: {
      pdfReady: false,
      proofReady: false,
      pdfPath: null,
      proofPath: null
    },
    artifactGuard: {
      matchedActiveRequest: true,
      pdfReady: false,
      proofReady: false,
      staleArtifactsBackedUp: true
    },
    uiText: {
      title: "Menunggu Diproses",
      pdfLabel: "PDF belum tersedia",
      proofLabel: "Bukti laporan belum tersedia"
    },
    safety
  };

  const proof = {
    ok: true,
    mode: "SMARTWORK_PROOF_PENDING_AFTER_REQUEST_PROMOTION",
    generatedAt: new Date().toISOString(),
    status: "PENDING_RUN",
    request,
    progress,
    proofReady: false,
    pdfReady: false,
    conclusion: "Request baru sudah aktif. Belum ada proses SIAGA untuk rentang ini.",
    safety
  };

  await fs.mkdir(path.dirname(APP_FILE), { recursive: true });
  await fs.mkdir(path.dirname(PROOF_FILE), { recursive: true });

  await fs.writeFile(LIVE_STATE_FILE, JSON.stringify(liveState, null, 2), "utf8");
  await fs.writeFile(LIVE_ALIAS_FILE, JSON.stringify(liveState, null, 2), "utf8");
  await fs.writeFile(FINAL_FILE, JSON.stringify(finalProgress, null, 2), "utf8");
  await fs.writeFile(APP_FILE, JSON.stringify(appArtifacts, null, 2), "utf8");
  await fs.writeFile(PROOF_FILE, JSON.stringify(proof, null, 2), "utf8");

  const report = {
    ok: true,
    mode: "RESET_CANONICAL_PROGRESS_STATE_ONLY_NO_SIAGA",
    generatedAt: new Date().toISOString(),
    request,
    progress,
    backups,
    filesWritten: [
      path.relative(ROOT, LIVE_STATE_FILE),
      path.relative(ROOT, LIVE_ALIAS_FILE),
      path.relative(ROOT, FINAL_FILE),
      path.relative(ROOT, APP_FILE),
      path.relative(ROOT, PROOF_FILE),
      path.relative(ROOT, REPORT_FILE)
    ],
    safety
  };

  await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log("CANONICAL_PROGRESS_RESET=true");
  console.log("REQUEST_RANGE=" + requestRange);
  console.log("LIVE_STATE_FILE=" + path.relative(ROOT, LIVE_STATE_FILE));
  console.log("FINAL_PROGRESS_VERIFY_COMPLETE=false");
  console.log("PROGRESS_PERCENT=0");
  console.log("NEEDS_PLAN=" + workDates.length);
  console.log("BACKUP_DIR=" + path.relative(ROOT, backupDir));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
