import dns from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const PHASE = "5ZT-A";
const VPS_IP = process.env.SMARTWORK_VPS_IP || "103.152.242.193";
const ROOT_DOMAIN = process.env.SMARTWORK_ROOT_DOMAIN || "smartwork-agent.id";
const API_DOMAIN = process.env.SMARTWORK_API_DOMAIN || "api.smartwork-agent.id";
const WWW_DOMAIN = process.env.SMARTWORK_WWW_DOMAIN || "www.smartwork-agent.id";
const APP_IP_BASE = process.env.SMARTWORK_APP_BASE || `http://${VPS_IP}:3108`;
const DIRECT_API_BASE = process.env.SMARTWORK_API_BASE || `http://${VPS_IP}:3107`;
const OUT = "reports/smartwork-phase5zt-domain-readiness-check.json";

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    return `ERROR: ${error.message}`;
  }
}

function safeParseJson(text) {
  try {
    if (typeof text !== "string") return null;
    return JSON.parse(text.replace(/^\uFEFF/, "").trimStart());
  } catch {
    return null;
  }
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return safeParseJson(fs.readFileSync(file, "utf8"));
}

async function resolveA(name) {
  try {
    const addresses = await dns.resolve4(name);
    return {
      name,
      ok: true,
      addresses,
      pointsToVps: addresses.includes(VPS_IP)
    };
  } catch (error) {
    return {
      name,
      ok: false,
      addresses: [],
      pointsToVps: false,
      error: error.code || error.message
    };
  }
}

async function checkUrl(name, url, options = {}) {
  const startedAt = Date.now();

  try {
    const res = await fetch(url, {
      headers: { "user-agent": `SmartWork-Agent-${PHASE}` },
      signal: AbortSignal.timeout(options.timeoutMs || 12000)
    });

    const contentType = res.headers.get("content-type") || "";
    const body = await res.text();
    const json = options.parseJson ? safeParseJson(body) : null;

    const checks = [
      {
        name: "status",
        expected: options.status || 200,
        actual: res.status,
        ok: res.status === (options.status || 200)
      }
    ];

    if (options.contentTypeIncludes) {
      checks.push({
        name: "contentType",
        expected: options.contentTypeIncludes,
        actual: contentType,
        ok: contentType.toLowerCase().includes(options.contentTypeIncludes.toLowerCase())
      });
    }

    if (options.parseJson) {
      checks.push({
        name: "parseJson",
        expected: true,
        actual: Boolean(json),
        ok: Boolean(json)
      });
    }

    if (options.jsonOk) {
      checks.push({
        name: "jsonOk",
        expected: true,
        actual: Boolean(json && options.jsonOk(json)),
        ok: Boolean(json && options.jsonOk(json))
      });
    }

    return {
      name,
      url,
      ok: checks.every((c) => c.ok),
      status: res.status,
      contentType,
      durationMs: Date.now() - startedAt,
      checks,
      json,
      bodySample: body.slice(0, 240)
    };
  } catch (error) {
    return {
      name,
      url,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error.message,
      checks: [{ name: "fetch", ok: false, error: error.message }]
    };
  }
}

const phase5zs = readJson("docs/checkpoints/smartwork-phase5zs-staging-readiness-rollup-phase5zs.json");

const phase5zsOk = Boolean(
  phase5zs &&
  phase5zs.ok === true &&
  phase5zs.releaseDecision === "STAGING_PRE_DOMAIN_READY_FOR_DOMAIN_DNS_HTTPS_PHASE5ZS"
);

const dnsChecks = [
  await resolveA(ROOT_DOMAIN),
  await resolveA(WWW_DOMAIN),
  await resolveA(API_DOMAIN)
];

const ipStagingChecks = [
  await checkUrl("ipAppHome", `${APP_IP_BASE}/home.html`, { contentTypeIncludes: "text/html" }),
  await checkUrl("ipSameOriginHealth", `${APP_IP_BASE}/api/smartwork/jobs/health`, {
    contentTypeIncludes: "application/json",
    parseJson: true,
    jsonOk: (json) => json.ok === true
  }),
  await checkUrl("directApiHealth", `${DIRECT_API_BASE}/api/smartwork/jobs/health`, {
    contentTypeIncludes: "application/json",
    parseJson: true,
    jsonOk: (json) => json.ok === true
  })
];

const domainHttpChecks = [
  await checkUrl("rootHttpHome", `http://${ROOT_DOMAIN}/home.html`, { contentTypeIncludes: "text/html" }),
  await checkUrl("rootHttpApiHealth", `http://${ROOT_DOMAIN}/api/smartwork/jobs/health`, {
    contentTypeIncludes: "application/json",
    parseJson: true,
    jsonOk: (json) => json.ok === true
  }),
  await checkUrl("apiHttpHealth", `http://${API_DOMAIN}/api/smartwork/jobs/health`, {
    contentTypeIncludes: "application/json",
    parseJson: true,
    jsonOk: (json) => json.ok === true
  })
];

const domainHttpsChecks = [
  await checkUrl("rootHttpsHome", `https://${ROOT_DOMAIN}/home.html`, { contentTypeIncludes: "text/html" }),
  await checkUrl("rootHttpsApiHealth", `https://${ROOT_DOMAIN}/api/smartwork/jobs/health`, {
    contentTypeIncludes: "application/json",
    parseJson: true,
    jsonOk: (json) => json.ok === true
  }),
  await checkUrl("apiHttpsHealth", `https://${API_DOMAIN}/api/smartwork/jobs/health`, {
    contentTypeIncludes: "application/json",
    parseJson: true,
    jsonOk: (json) => json.ok === true
  })
];

const dnsReady = dnsChecks.every((c) => c.pointsToVps);
const ipStagingReady = ipStagingChecks.every((c) => c.ok);
const httpDomainReady = domainHttpChecks.every((c) => c.ok);
const httpsDomainReady = domainHttpsChecks.every((c) => c.ok);

const safety = {
  noSiagaInput: true,
  noBrowserOpen: true,
  noRealSave: true,
  noRealSend: true,
  noAabBuild: true,
  noPlayStoreUpload: true,
  readOnlyDnsHttpHttpsProbeOnly: true
};

let releaseDecision = "DOMAIN_DNS_NOT_READY_PHASE5ZT_A";
let nextSafePhase = "Set DNS A records first: @, www, and api to VPS IP.";

if (phase5zsOk && ipStagingReady && dnsReady && !httpDomainReady && !httpsDomainReady) {
  releaseDecision = "DOMAIN_DNS_POINTS_TO_VPS_READY_FOR_REVERSE_PROXY_SSL_PHASE5ZT_A";
  nextSafePhase = "Install/configure Nginx or Caddy reverse proxy with HTTPS.";
}

if (phase5zsOk && ipStagingReady && dnsReady && httpDomainReady && !httpsDomainReady) {
  releaseDecision = "DOMAIN_HTTP_READY_HTTPS_NOT_READY_PHASE5ZT_A";
  nextSafePhase = "Enable HTTPS certificate and verify same-origin API over HTTPS.";
}

if (phase5zsOk && ipStagingReady && dnsReady && httpsDomainReady) {
  releaseDecision = "DOMAIN_HTTPS_READY_FOR_ASSETLINKS_PREP_PHASE5ZT_A";
  nextSafePhase = "Prepare assetlinks fingerprint, still no AAB/Play Store until Android fingerprint is live.";
}

const ok = phase5zsOk && ipStagingReady;

const report = {
  ok,
  phase: PHASE,
  createdAt: new Date().toISOString(),
  releaseDecision,
  domains: {
    root: ROOT_DOMAIN,
    www: WWW_DOMAIN,
    api: API_DOMAIN,
    expectedVpsIp: VPS_IP
  },
  git: {
    branch: sh("git branch --show-current"),
    head: sh("git rev-parse --short HEAD"),
    latestCommit: sh("git log -1 --oneline"),
    statusShort: sh("git status --short")
  },
  priorCheckpoint: {
    phase5zsOk,
    releaseDecision: phase5zs?.releaseDecision || null
  },
  readiness: {
    dnsReady,
    ipStagingReady,
    httpDomainReady,
    httpsDomainReady
  },
  checks: {
    dnsChecks,
    ipStagingChecks,
    domainHttpChecks,
    domainHttpsChecks
  },
  safety,
  dnsRecordsNeeded: [
    { type: "A", host: "@", value: VPS_IP, ttl: "Auto / 300" },
    { type: "A", host: "www", value: VPS_IP, ttl: "Auto / 300" },
    { type: "A", host: "api", value: VPS_IP, ttl: "Auto / 300" }
  ],
  hardStopsStillActive: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    noAabBuild: true,
    noPlayStoreUpload: true,
    noTwaUntilHttpsDomainAndAssetlinksFingerprintLive: true
  },
  nextSafePhase
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok: report.ok,
  phase: report.phase,
  releaseDecision: report.releaseDecision,
  phase5zsOk,
  dnsReady,
  ipStagingReady,
  httpDomainReady,
  httpsDomainReady,
  dnsRecordsNeeded: report.dnsRecordsNeeded,
  nextSafePhase: report.nextSafePhase,
  report: OUT
}, null, 2));

if (!ok) process.exitCode = 1;
