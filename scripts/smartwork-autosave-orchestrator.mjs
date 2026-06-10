import fs from "node:fs";
import path from "node:path";
import {
  readJson,
  writeJson,
  buildDatePlan,
  summarizePlan,
} from "./smartwork-autosave-core.mjs";
import { runSiagaAutoSaveWorker } from "./smartwork-autosave-worker-siaga.mjs";

const ROOT = process.cwd();
const REQUEST_DIR = path.join(ROOT, "intake", "requests");
const REPORT_PATH = path.join(ROOT, "reports", "autosave-orchestrator-report.json");

function findLatestRequest() {
  if (!fs.existsSync(REQUEST_DIR)) {
    throw new Error(`Folder request tidak ada: ${REQUEST_DIR}`);
  }

  const files = fs.readdirSync(REQUEST_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const fullPath = path.join(REQUEST_DIR, name);
      return { name, fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!files.length) {
    throw new Error("Tidak ada request JSON di intake/requests.");
  }

  return files[0];
}

function normalizeRequest(raw) {
  const account = raw.accounts?.[0] || raw.account || raw;

  return {
    ...raw,
    service: raw.service || "siaga",
    startDate: raw.startDate || account.startDate,
    endDate: raw.endDate || account.endDate,
    holidays: raw.holidays || account.holidays || [],
    accounts: raw.accounts?.length ? raw.accounts : [account],
  };
}

async function main() {
  const dryRun = !process.argv.includes("--real");
  const latest = findLatestRequest();
  const raw = readJson(latest.fullPath);
  const request = normalizeRequest(raw);

  const plan = buildDatePlan({
    startDate: request.startDate,
    endDate: request.endDate,
    holidays: request.holidays,
  });

  const results = [];
  for (const row of plan) {
    if (row.status !== "PLANNED") {
      results.push(row);
      continue;
    }

    const result = await runSiagaAutoSaveWorker({ request, row, dryRun });
    results.push(result);
  }

  const report = {
    ok: true,
    mode: dryRun ? "DRY_RUN" : "REAL_REQUESTED",
    engine: "smartwork-autosave-orchestrator",
    requestFile: latest.name,
    service: request.service,
    startDate: request.startDate,
    endDate: request.endDate,
    holidays: request.holidays,
    summary: summarizePlan(results),
    results,
    createdAt: new Date().toISOString(),
  };

  writeJson(REPORT_PATH, report);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`REPORT=${REPORT_PATH}`);
}

main().catch((error) => {
  const report = {
    ok: false,
    engine: "smartwork-autosave-orchestrator",
    error: error.message,
    createdAt: new Date().toISOString(),
  };
  writeJson(REPORT_PATH, report);
  console.error(error);
  process.exit(1);
});
