import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkpointDir = path.join(root, "docs", "checkpoints");
fs.mkdirSync(checkpointDir, { recursive: true });

const checkpoint = path.join(checkpointDir, "smartwork-phase5zf-public-api-readiness-report.json");

const files = {
  docs: "docs/playstore/smartwork-phase5zf-public-api-readiness.md",
  caddy: "deploy/phase5zf/Caddyfile.smartwork-api.example",
  nginx: "deploy/phase5zf/nginx.smartwork-api.example.conf",
  readinessJson: "deploy/phase5zf/smartwork-public-api-readiness.json",
  manifest: "public/manifest.webmanifest",
  sw: "public/sw.js"
};

function readTextClean(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/^\uFEFF/, "").trim();
}

function readJsonClean(relativePath) {
  return JSON.parse(readTextClean(relativePath));
}

const readiness = readJsonClean(files.readinessJson);
const manifest = readJsonClean(files.manifest);
const sw = readTextClean(files.sw);

const checks = {
  docsReady: fs.existsSync(path.join(root, files.docs)),
  caddyTemplateReady: fs.existsSync(path.join(root, files.caddy)),
  nginxTemplateReady: fs.existsSync(path.join(root, files.nginx)),
  readinessJsonReady: fs.existsSync(path.join(root, files.readinessJson)),
  pwaManifestReady: Boolean(manifest.name && manifest.start_url && manifest.display === "standalone"),
  serviceWorkerSkipsRawVpsApiCache: sw.includes('url.hostname === "103.152.242.193"'),
  currentApiIsRawHttpIp: readiness.currentDryRunApiBase === "http://103.152.242.193:3107",
  recommendedApiIsHttps: String(readiness.recommendedPublicApiBase || "").startsWith("https://"),
  requiredRoutesListed: Array.isArray(readiness.requiredRoutes) && readiness.requiredRoutes.length >= 3,
  requiredCorsListed:
    Array.isArray(readiness.requiredCors?.methods) &&
    readiness.requiredCors.methods.includes("OPTIONS") &&
    readiness.requiredCors.methods.includes("GET") &&
    readiness.requiredCors.methods.includes("POST"),
  requiredHeadersListed:
    Array.isArray(readiness.requiredCors?.headers) &&
    readiness.requiredCors.headers.includes("Content-Type") &&
    readiness.requiredCors.headers.includes("X-SmartWork-Dry-Run"),
  safetyNoRealActions:
    readiness.safety?.dryRun === true &&
    readiness.safety?.noSiagaInput === true &&
    readiness.safety?.noBrowserOpen === true &&
    readiness.safety?.noRealSave === true &&
    readiness.safety?.noRealSend === true
};

const report = {
  ok: Object.values(checks).every(Boolean),
  phase: "5ZF",
  releaseDecision: "PUBLIC_API_HTTPS_CORS_READINESS_PACK_READY",
  importantNote:
    "This phase prepares the HTTPS/CORS readiness pack. Actual DNS/SSL deployment still requires a real domain and VPS reverse proxy configuration.",
  parserMode: "BOM_SAFE_JSON_PARSE",
  files,
  readiness,
  checks,
  createdAt: new Date().toISOString()
};

fs.writeFileSync(checkpoint, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok: report.ok,
  phase: report.phase,
  releaseDecision: report.releaseDecision,
  parserMode: report.parserMode,
  checks,
  checkpoint: path.relative(root, checkpoint).replaceAll("\\", "/")
}, null, 2));

if (!report.ok) process.exitCode = 1;
