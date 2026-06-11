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

function syntaxOk(file) {
  try {
    execSync(`node --check "${file}"`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const requestHtml = readText("public/request.html");
const queueApi = readText("app/smartwork-production-queue-api.mjs");
const server = readText("app/smartwork-control-server.mjs");

const checks = {
  requestPageExists: exists("public/request.html"),
  legacyRequestFlowStillPresent: requestHtml.includes("/api/requests"),
  productionBridgeInstalled: requestHtml.includes("SMARTWORK_REQUEST_PRODUCTION_QUEUE_BRIDGE_V1"),
  productionBridgePostsJob: requestHtml.includes("/api/smartwork/jobs"),
  productionBridgeDryRun: requestHtml.includes("dryRun: true"),
  productionBridgeNoSiagaInput: requestHtml.includes("noSiagaInput: true"),
  productionBridgeNoBrowserOpen: requestHtml.includes("noBrowserOpen: true"),
  productionBridgeNoRawPasswordStored: requestHtml.includes("rawPasswordStored: false"),
  productionBridgeExcludesPasswordKeyword: !requestHtml
    .slice(requestHtml.indexOf("SMARTWORK_REQUEST_PRODUCTION_QUEUE_BRIDGE_V1"))
    .includes("password"),
  backendQueueApiExists: exists("app/smartwork-production-queue-api.mjs"),
  backendQueueCreateRouteExists: queueApi.includes('"/api/smartwork/jobs"'),
  serverImportsQueueApi: server.includes("smartwork-production-queue-api.mjs"),
  serverInstallsQueueApi: server.includes("SMARTWORK_PRODUCTION_QUEUE_API_INSTALL_V1"),
  apiSyntaxOk: syntaxOk("app/smartwork-production-queue-api.mjs"),
  serverSyntaxOk: syntaxOk("app/smartwork-control-server.mjs")
};

const ok = Object.values(checks).every(Boolean);

const report = {
  ok,
  mode: "SMARTWORK_PHASE5C_APP_SUBMIT_BRIDGE_CHECK",
  generatedAt: new Date().toISOString(),
  checks,
  flow: [
    "request.html submit",
    "legacy /api/requests remains active",
    "new /api/smartwork/jobs dry-run production job is created",
    "worker can later poll production queue"
  ],
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    noRawPasswordInProductionJob: true,
    staticCheckOnly: true
  },
  next: ok
    ? "Phase 5C app submit bridge is installed. Next: runtime API smoke test or worker queue lifecycle bridge."
    : "Fix Phase 5C bridge before proceeding."
};

writeJson("reports/production-worker/phase5c-app-submit-bridge-check-report.json", report);
console.log(JSON.stringify(report, null, 2));

if (!ok) process.exit(2);
