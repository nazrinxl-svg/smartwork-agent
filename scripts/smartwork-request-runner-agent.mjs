import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const requestsDir = path.join(ROOT, "intake", "requests");
const activeIntakePath = path.join(ROOT, "intake", "smartwork-job-request.sample.json");

const latestRequest = fs
  .readdirSync(requestsDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({
    file: f,
    path: path.join(requestsDir, f),
    time: fs.statSync(path.join(requestsDir, f)).mtimeMs,
  }))
  .sort((a, b) => b.time - a.time)[0];

if (!latestRequest) {
  throw new Error("Tidak ada request ditemukan.");
}

const intakeText = fs.readFileSync(latestRequest.path, "utf8").replace(/^\uFEFF/, "");
const intake = JSON.parse(intakeText);
fs.writeFileSync(activeIntakePath, JSON.stringify(intake, null, 2), "utf8");

const teacherId = intake?.accounts?.[0]?.teacherId || "guru-001";
const autoSave = intake?.rules?.autoSave === true;
const targetDetailUrl = intake?.accounts?.[0]?.detailUrl || intake?.targetDetailUrl || "";

function countAutoLimit() {
  const startDate = intake?.accounts?.[0]?.startDate || intake?.startDate || "";
  const endDate = intake?.accounts?.[0]?.endDate || intake?.endDate || "";
  if (!startDate || !endDate) return 1;

  const start = new Date(`${String(startDate).slice(0, 10)}T00:00:00`);
  const end = new Date(`${String(endDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 1;

  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) count++;
  }

  return Math.max(1, Math.min(5, count));
}

const targetLimit = String(countAutoLimit());
const env = {
  ...process.env,
  TARGET_TEACHER_ID: teacherId,
  TARGET_MONTH: intake.targetMonth || "Juni",
  TARGET_YEAR: String(intake.targetYear || "2026"),
  TARGET_DETAIL_URL: targetDetailUrl,
  CONFIRM_SAVE: autoSave ? "YES" : "NO",
  SMARTWORK_RUN_MODE: autoSave ? "CONFIRMED_SAVE" : "SAFE_PREVIEW_NO_SAVE",
  TARGET_LIMIT: targetLimit,
};

console.log("SMARTWORK_REQUEST_RUNNER=" + env.SMARTWORK_RUN_MODE);
console.log("AUTO_SAVE=" + autoSave);
console.log("REQUEST=" + path.relative(ROOT, latestRequest.path));
console.log("ACTIVE_INTAKE=" + path.relative(ROOT, activeIntakePath));
console.log("TARGET_TEACHER_ID=" + teacherId);
console.log("TARGET_MONTH=" + env.TARGET_MONTH);
console.log("TARGET_YEAR=" + env.TARGET_YEAR);
console.log("CONFIRM_SAVE=" + env.CONFIRM_SAVE);
console.log("TARGET_DETAIL_URL=" + (env.TARGET_DETAIL_URL || "-"));
console.log("TARGET_LIMIT=" + env.TARGET_LIMIT);

const steps = [
  ...(autoSave ? [] : [["npm", "run", "intake:validate"]]),
  ...(autoSave ? [] : [["npm", "run", "batch:plan"]]),
  ...(autoSave ? [] : [["npm", "run", "siaga:job:runner-preview"]]),
  ["npm", "run", "siaga:job:time-plan-preview"],
  autoSave
    ? ["npm", "run", "siaga:job:save-confirmed"]
    : ["npm", "run", "siaga:job:input-preview-no-save"],
];

for (const cmd of steps) {
  console.log("");
  console.log("RUN => " + cmd.join(" "));

  const result = spawnSync(cmd[0], cmd.slice(1), {
    stdio: "inherit",
    shell: true,
    env,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("");
console.log(
  autoSave
    ? "SMARTWORK_REQUEST_RUNNER=DONE_CONFIRMED_SAVE"
    : "SMARTWORK_REQUEST_RUNNER=DONE_SAFE_PREVIEW_NO_SAVE"
);

