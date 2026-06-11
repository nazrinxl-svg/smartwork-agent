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

function gitTrackedFiles() {
  try {
    return execSync("git ls-files", { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const tracked = new Set(gitTrackedFiles());

const envExample = readText("configs/.env.production.example");
const envLocalExists = exists(".env.local");
const envProductionLocalExists = exists(".env.production.local");

const envFilesThatMustNotBeTracked = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  "configs/.env.production.local"
];

const dangerousTrackedFiles = envFilesThatMustNotBeTracked.filter((file) => tracked.has(file));

const forbiddenPatterns = [
  "PASSWORD=",
  "SECRET=",
  "TOKEN=",
  "ACCESS_KEY=",
  "SECRET_KEY=",
  "SMARTWORK_WORKER_TOKEN="
];

const exampleHasPlaceholders =
  envExample.includes("SMARTWORK_DRY_RUN=true") &&
  envExample.includes("SMARTWORK_REAL_SAVE_ENABLED=false") &&
  envExample.includes("SMARTWORK_REAL_SEND_ENABLED=false");

const envSafety = {
  dryRun: process.env.SMARTWORK_DRY_RUN !== "false",
  realSaveDisabled: process.env.SMARTWORK_REAL_SAVE_ENABLED !== "true",
  realSendDisabled: process.env.SMARTWORK_REAL_SEND_ENABLED !== "true"
};

const envTextToScan = [
  envExample,
  envProductionLocalExists ? readText(".env.production.local") : ""
].join("\n");

const suspiciousSecrets = forbiddenPatterns.filter((pattern) => {
  const lines = envTextToScan.split(/\r?\n/);
  return lines.some((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) return false;
    if (!trimmed.includes(pattern)) return false;

    const value = trimmed.split("=").slice(1).join("=").trim();

    if (!value) return false;
    if (value.includes("example")) return false;
    if (value.includes("CHANGE_ME")) return false;
    if (value.includes("REPLACE_ME")) return false;
    if (value.includes("your_")) return false;

    return true;
  });
});

const ok =
  exampleHasPlaceholders &&
  dangerousTrackedFiles.length === 0 &&
  suspiciousSecrets.length === 0 &&
  Object.values(envSafety).every(Boolean);

const report = {
  ok,
  mode: "SMARTWORK_PRODUCTION_ENV_GUARD",
  generatedAt: new Date().toISOString(),
  checks: {
    envExampleExists: exists("configs/.env.production.example"),
    exampleHasSafeDefaults: exampleHasPlaceholders,
    localEnvExistsButAllowedIfGitignored: envLocalExists,
    productionLocalEnvExistsButAllowedIfGitignored: envProductionLocalExists,
    dangerousTrackedFilesClear: dangerousTrackedFiles.length === 0,
    suspiciousSecretsClear: suspiciousSecrets.length === 0
  },
  dangerousTrackedFiles,
  suspiciousSecrets,
  trackedEnvPolicy: "Local env files may exist, but must not be tracked by git.",
  envSafety,
  noSiagaInput: true,
  noBrowserOpen: true,
  next: ok
    ? "Environment guard OK for VPS dry-run preparation."
    : "Fix env safety before VPS first run."
};

writeJson("reports/production-worker/production-env-guard-report.json", report);
console.log(JSON.stringify(report, null, 2));

if (!ok) process.exit(2);
