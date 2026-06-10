import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "reports", "autosave-orchestrator-report.json");

function run(label, cmd, args = [], extraEnv = {}) {
  console.log("");
  console.log(`=== ${label} ===`);
  console.log("RUN => " + [cmd, ...args].join(" "));

  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.status !== 0) {
    throw new Error(`${label} gagal dengan exit code ${result.status}`);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

try {
  run("QUEUE PLAN", "node", ["scripts/smartwork-autosave-orchestrator.mjs", "--queue"]);

  const queueReport = readJson(REPORT_PATH);
  const firstQueued = (queueReport.queue || []).find((q) => q.status === "QUEUED");

  if (!firstQueued?.date) {
    console.log("SMARTWORK_AUTOSAVE_RUNNER=NO_QUEUED_DATE");
    process.exit(0);
  }

  console.log("");
  console.log("TARGET_DATE_FROM_QUEUE=" + firstQueued.date);

  run(
    "SIAGA AUTOSAVE LEGACY WORKER",
    "node",
    ["scripts/smartwork-request-runner-agent.mjs"],
    {
      TARGET_DATE: firstQueued.date,
      TARGET_LIMIT: "1",
    }
  );

  run("DOWNLOAD PRESENSI PDF", "npm", ["run", "siaga:job:download-presensi-pdf"]);
  run("CREATE PROOF REPORT", "npm", ["run", "proof:report"]);
  run("DELIVERY ORCHESTRATOR", "npm", ["run", "delivery:run"]);

  console.log("");
  console.log("SMARTWORK_AUTOSAVE_RUNNER=END_TO_END_DONE");
} catch (error) {
  console.error("");
  console.error("SMARTWORK_AUTOSAVE_RUNNER=FAILED");
  console.error(error);
  process.exit(1);
}
