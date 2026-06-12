const fs = require("fs");
const path = require("path");

const root = process.cwd();

function ensureDir(p) {
  fs.mkdirSync(path.join(root, p), { recursive: true });
}

function write(rel, text) {
  fs.writeFileSync(path.join(root, rel), text.replace(/\r?\n/g, "\n"), "utf8");
}

ensureDir("deploy/phase5zf");
ensureDir("docs/playstore");
ensureDir("docs/checkpoints");
ensureDir("scripts");

write("docs/playstore/smartwork-phase5zf-public-api-readiness.md", `# SmartWork Agent Phase 5ZF — Public API HTTPS/CORS Readiness Pack

## Goal

Prepare SmartWork Agent for Android/WebView/TWA/Play Store path by documenting the required public API shape and the HTTPS/CORS production route.

## Current proven chain

- Phase 5ZC: browser app proof to DewaVPS API and worker completed 100%.
- Phase 5ZD: phone-like public app proof to DewaVPS API and worker completed 100%.
- Phase 5ZE: PWA installability pack passed.

## Play Store readiness concern

The current dry-run API base is a raw HTTP IP:

\`http://103.152.242.193:3107\`

For Android/WebView/TWA production, SmartWork should use a real HTTPS domain such as:

\`https://api.smartwork-agent.id\`

## Required API routes

- \`GET /api/smartwork/jobs/health\`
- \`POST /api/smartwork/jobs\`
- \`GET /api/smartwork/jobs/:id\`

## Required CORS

Allowed methods:

- \`GET\`
- \`POST\`
- \`OPTIONS\`

Allowed headers:

- \`Content-Type\`
- \`X-SmartWork-Dry-Run\`
- \`Authorization\`

Allowed origins:

- \`https://smartwork-agent.id\`
- \`http://127.0.0.1:5197\`
- \`http://127.0.0.1:5217\`

## Safety invariant

This phase only prepares API readiness files. It performs no SIAGA input, no browser automation against SIAGA, no real save, and no real send.
`);

write("deploy/phase5zf/Caddyfile.smartwork-api.example", `# Example Caddyfile for SmartWork API HTTPS
# Replace api.smartwork-agent.id with the real domain after DNS is pointed to the VPS.

api.smartwork-agent.id {
  encode gzip

  header {
    Access-Control-Allow-Origin "https://smartwork-agent.id"
    Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Access-Control-Allow-Headers "Content-Type, X-SmartWork-Dry-Run, Authorization"
    Access-Control-Max-Age "86400"
  }

  @options method OPTIONS
  respond @options 204

  reverse_proxy 127.0.0.1:3107
}
`);

write("deploy/phase5zf/nginx.smartwork-api.example.conf", `# Example Nginx reverse proxy for SmartWork API HTTPS
# Replace api.smartwork-agent.id and SSL paths with real values.

server {
  listen 443 ssl http2;
  server_name api.smartwork-agent.id;

  ssl_certificate /etc/letsencrypt/live/api.smartwork-agent.id/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.smartwork-agent.id/privkey.pem;

  location / {
    if ($request_method = OPTIONS) {
      add_header Access-Control-Allow-Origin "https://smartwork-agent.id" always;
      add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
      add_header Access-Control-Allow-Headers "Content-Type, X-SmartWork-Dry-Run, Authorization" always;
      add_header Access-Control-Max-Age 86400 always;
      return 204;
    }

    add_header Access-Control-Allow-Origin "https://smartwork-agent.id" always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Content-Type, X-SmartWork-Dry-Run, Authorization" always;

    proxy_pass http://127.0.0.1:3107;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 80;
  server_name api.smartwork-agent.id;
  return 301 https://$host$request_uri;
}
`);

const readiness = {
  phase: "5ZF",
  name: "SmartWork Public API HTTPS/CORS Readiness",
  recommendedPublicApiBase: "https://api.smartwork-agent.id",
  currentDryRunApiBase: "http://103.152.242.193:3107",
  requiredRoutes: [
    "GET /api/smartwork/jobs/health",
    "POST /api/smartwork/jobs",
    "GET /api/smartwork/jobs/:id"
  ],
  requiredCors: {
    methods: ["GET", "POST", "OPTIONS"],
    headers: ["Content-Type", "X-SmartWork-Dry-Run", "Authorization"],
    origins: [
      "https://smartwork-agent.id",
      "http://127.0.0.1:5197",
      "http://127.0.0.1:5217"
    ]
  },
  safety: {
    dryRun: true,
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true
  }
};

fs.writeFileSync(
  path.join(root, "deploy/phase5zf/smartwork-public-api-readiness.json"),
  JSON.stringify(readiness, null, 2) + "\n",
  "utf8"
);

write("scripts/smartwork-phase5zf-public-api-readiness-audit.mjs", `import fs from "node:fs";
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
  return fs.readFileSync(path.join(root, relativePath), "utf8").replace(/^\\uFEFF/, "").trim();
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
  checkpoint: path.relative(root, checkpoint).replaceAll("\\\\", "/")
}, null, 2));

if (!report.ok) process.exitCode = 1;
`);

console.log(JSON.stringify({
  ok: true,
  phase: "5ZF",
  patched: [
    "docs/playstore/smartwork-phase5zf-public-api-readiness.md",
    "deploy/phase5zf/Caddyfile.smartwork-api.example",
    "deploy/phase5zf/nginx.smartwork-api.example.conf",
    "deploy/phase5zf/smartwork-public-api-readiness.json",
    "scripts/smartwork-phase5zf-public-api-readiness-audit.mjs"
  ],
  encoding: "utf8_no_bom_by_node_fs_writeFileSync"
}, null, 2));
