import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const root = process.cwd();

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function readText(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return "";
  return fs.readFileSync(full, "utf8");
}

function writeJson(rel, data) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2) + "\n", "utf8");
}

const server = readText("app/smartwork-control-server.mjs");
const api = readText("app/smartwork-production-queue-api.mjs");

const checks = {
  schemaExists: exists("configs/smartwork-production-job.schema.json"),
  apiModuleExists: exists("app/smartwork-production-queue-api.mjs"),
  serverExists: exists("app/smartwork-control-server.mjs"),
  serverImportsApi: server.includes("smartwork-production-queue-api.mjs"),
  serverInstallsApi: server.includes("SMARTWORK_PRODUCTION_QUEUE_API_INSTALL_V1"),
  apiHasCreateRoute: api.includes('app.post("/api/smartwork/jobs"'),
  apiHasListRoute: api.includes('app.get("/api/smartwork/jobs"'),
  apiHasPendingRoute: api.includes('app.get("/api/smartwork/jobs/pending"'),
  apiHasStatusRoute: api.includes('app.get("/api/smartwork/jobs/:id"'),
  apiHasAckCompleteFail: api.includes('"/api/smartwork/jobs/ack"') && api.includes('"/api/smartwork/jobs/complete"') && api.includes('"/api/smartwork/jobs/fail"'),
  safetyNoSiagaInput: api.includes("noSiagaInput: true"),
  safetyNoBrowserOpen: api.includes("noBrowserOpen: true"),
  noRawPasswordStored: api.includes("rawPasswordStored: false")
};


/* SMARTWORK_PHASE5_SYNTAX_GUARD_V1 */
function syntaxOk(file) {
  try {
    execSync(`node --check "${file}"`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

checks.apiSyntaxOk = syntaxOk("app/smartwork-production-queue-api.mjs");
checks.serverSyntaxOk = syntaxOk("app/smartwork-control-server.mjs");

const ok = Object.values(checks).every(Boolean);

const report = {
  ok,
  mode: "SMARTWORK_PHASE5_BACKEND_QUEUE_API_CHECK",
  generatedAt: new Date().toISOString(),
  checks,
  endpoints: [
    "GET /api/smartwork/jobs/health",
    "POST /api/smartwork/jobs",
    "GET /api/smartwork/jobs",
    "GET /api/smartwork/jobs/pending",
    "GET /api/smartwork/jobs/:id",
    "POST /api/smartwork/jobs/ack",
    "POST /api/smartwork/jobs/complete",
    "POST /api/smartwork/jobs/fail"
  ],
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    staticCheckOnly: true
  },
  next: ok
    ? "Backend production queue API skeleton is installed. Next: app submit bridge to /api/smartwork/jobs."
    : "Fix backend production queue API skeleton."
};

writeJson("reports/production-worker/phase5-backend-queue-api-check-report.json", report);

console.log(JSON.stringify(report, null, 2));

if (!ok) process.exit(2);
