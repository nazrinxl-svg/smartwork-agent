import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const REQUEST_DIR = path.join(ROOT, "intake", "requests");
const ACTIVE_INTAKE = path.join(ROOT, "intake", "smartwork-job-request.sample.json");
const SCAN_REPORT = path.join(ROOT, "reports", "autosave-empty-date-scan-report.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function latestRequest() {
  const files = fs.readdirSync(REQUEST_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      name: f,
      path: path.join(REQUEST_DIR, f),
      time: fs.statSync(path.join(REQUEST_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);

  if (!files.length) throw new Error("Tidak ada request di intake/requests.");
  return files[0];
}

function run(label, cmd, args = [], extraEnv = {}) {
  console.log("");
  console.log(`=== ${label} ===`);
  console.log("RUN => " + [cmd, ...args].join(" "));

  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...extraEnv },
  });

  if (result.status !== 0) {
    throw new Error(`${label} gagal dengan exit code ${result.status}`);
  }
}

try {
  const latest = latestRequest();
  const request = readJson(latest.path);
  const account = request.accounts?.[0] || {};
  const autoSave = request?.rules?.autoSave === true;

  writeJson(ACTIVE_INTAKE, request);

  const baseEnv = {
    TARGET_TEACHER_ID: account.teacherId || request.teacherId || "guru-001",
    TARGET_MONTH: request.targetMonth || "Juni",
    TARGET_YEAR: String(request.targetYear || "2026"),
    TARGET_DETAIL_URL: account.detailUrl || request.targetDetailUrl || "",
    CONFIRM_SAVE: autoSave ? "YES" : "NO",
    SMARTWORK_RUN_MODE: autoSave ? "CONFIRMED_SAVE" : "SAFE_PREVIEW_NO_SAVE",
    TARGET_LIMIT: "1",
  };

  console.log("SMARTWORK_AUTOSAVE_V4=START");
  console.log("REQUEST=" + path.relative(ROOT, latest.path));
  console.log("AUTO_SAVE=" + autoSave);
  console.log("TARGET_TEACHER_ID=" + baseEnv.TARGET_TEACHER_ID);

  if (!autoSave) {
    throw new Error("rules.autoSave harus true untuk autosave V4.");
  }

  run("QUEUE PLAN", "node", ["scripts/smartwork-autosave-orchestrator.mjs", "--queue"], baseEnv);
  run("TIME PLAN", "npm", ["run", "siaga:job:time-plan-preview"], baseEnv);

  const maxLoop = 31;
  const processed = [];

  for (let i = 1; i <= maxLoop; i++) {
    run(`SCAN EMPTY DATES LOOP ${i}`, "node", ["scripts/smartwork-siaga-empty-date-scan.mjs"], baseEnv);

    const scan = readJson(SCAN_REPORT);
    const targetDate = scan.emptyDates?.[0];

    if (!targetDate) {
      console.log("");
      console.log("NO_EMPTY_DATE_LEFT=TRUE");
      break;
    }

    console.log("");
    console.log("NEXT_TARGET_DATE=" + targetDate);

    run(
      `SAVE TARGET ${targetDate}`,
      "npm",
      ["run", "siaga:job:save-confirmed"],
      { ...baseEnv, TARGET_DATE: targetDate, TARGET_LIMIT: "1" }
    );

    processed.push(targetDate);
  }

  run("FINAL SCAN", "node", ["scripts/smartwork-siaga-empty-date-scan.mjs"], baseEnv);

  const finalScan = readJson(SCAN_REPORT);
  if ((finalScan.emptyDates || []).length > 0) {
    throw new Error("Masih ada tanggal kosong: " + finalScan.emptyDates.join(", "));
  }

  run("DOWNLOAD PRESENSI PDF", "npm", ["run", "siaga:job:download-presensi-pdf"], baseEnv);
  run("CREATE PROOF REPORT", "npm", ["run", "proof:report"], baseEnv);
  run("DELIVERY ORCHESTRATOR", "npm", ["run", "delivery:run"], baseEnv);

  console.log("");
  console.log("SMARTWORK_AUTOSAVE_V4=END_TO_END_DONE");
  console.log("PROCESSED_DATES=" + processed.join(","));
} catch (error) {
  console.error("");
  console.error("SMARTWORK_AUTOSAVE_V4=FAILED");
  console.error(error);
  process.exit(1);
}
