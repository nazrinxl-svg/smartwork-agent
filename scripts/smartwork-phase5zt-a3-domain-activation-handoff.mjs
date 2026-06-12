import dns from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const PHASE = "5ZT-A3";
const DOMAIN = process.env.SMARTWORK_ROOT_DOMAIN || "smartwork-agent.id";
const VPS_IP = process.env.SMARTWORK_VPS_IP || "103.152.242.193";
const OUT = "reports/smartwork-phase5zt-a3-domain-activation-handoff.json";

const names = [DOMAIN, `www.${DOMAIN}`, `api.${DOMAIN}`];
const resolvers = [
  { name: "Cloudflare", server: "1.1.1.1" },
  { name: "Google", server: "8.8.8.8" },
  { name: "Quad9", server: "9.9.9.9" }
];

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch (error) {
    return `ERROR: ${error.message}`;
  }
}

async function resolvePublic(server, type, name) {
  const resolver = new dns.Resolver();
  resolver.setServers([server]);

  try {
    const values = type === "NS"
      ? await resolver.resolveNs(name)
      : await resolver.resolve4(name);

    return { ok: true, values };
  } catch (error) {
    return { ok: false, values: [], error: error.code || error.message };
  }
}

const nsChecks = [];
const aChecks = [];

for (const resolver of resolvers) {
  const ns = await resolvePublic(resolver.server, "NS", DOMAIN);
  nsChecks.push({
    domain: DOMAIN,
    type: "NS",
    resolver: resolver.name,
    server: resolver.server,
    ok: ns.ok,
    values: ns.values,
    error: ns.error || null
  });

  for (const name of names) {
    const a = await resolvePublic(resolver.server, "A", name);
    aChecks.push({
      domain: name,
      type: "A",
      resolver: resolver.name,
      server: resolver.server,
      ok: a.ok,
      values: a.values,
      pointsToVps: a.values.includes(VPS_IP),
      error: a.error || null
    });
  }
}

const nsReady = nsChecks.some((c) => c.ok && c.values.length > 0);

const perName = {};
for (const name of names) {
  const rows = aChecks.filter((c) => c.domain === name);
  perName[name] = {
    anyARecord: rows.some((r) => r.ok && r.values.length > 0),
    anyPointsToVps: rows.some((r) => r.pointsToVps),
    values: [...new Set(rows.flatMap((r) => r.values || []))],
    errors: [...new Set(rows.filter((r) => r.error).map((r) => r.error))]
  };
}

const allAReady = names.every((name) => perName[name].anyPointsToVps);

let releaseDecision = "DOMAIN_ACTIVATION_NOT_READY_PHASE5ZT_A3";
let nextSafePhase = "Activate domain/nameserver and create A records before reverse proxy/HTTPS.";

if (nsReady && !allAReady) {
  releaseDecision = "DOMAIN_NAMESERVER_VISIBLE_A_RECORDS_NOT_READY_PHASE5ZT_A3";
  nextSafePhase = "Create or fix A records @, www, and api to VPS IP 103.152.242.193.";
}

if (nsReady && allAReady) {
  releaseDecision = "DOMAIN_PUBLIC_DNS_READY_FOR_REVERSE_PROXY_SSL_PHASE5ZT_A3";
  nextSafePhase = "Proceed to Phase 5ZT-B reverse proxy + HTTPS.";
}

const report = {
  ok: true,
  phase: PHASE,
  createdAt: new Date().toISOString(),
  releaseDecision,
  domain: DOMAIN,
  expectedVpsIp: VPS_IP,
  git: {
    branch: sh("git branch --show-current"),
    head: sh("git rev-parse --short HEAD"),
    latestCommit: sh("git log -1 --oneline"),
    statusShort: sh("git status --short")
  },
  readiness: {
    nsReady,
    allAReady,
    perName
  },
  checks: {
    nsChecks,
    aChecks
  },
  requiredDnsRecords: [
    { type: "A", host: "@", value: VPS_IP, ttl: "Auto / 300" },
    { type: "A", host: "www", value: VPS_IP, ttl: "Auto / 300" },
    { type: "A", host: "api", value: VPS_IP, ttl: "Auto / 300" }
  ],
  safety: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    noAabBuild: true,
    noPlayStoreUpload: true,
    dnsReadOnlyProbeOnly: true
  },
  nextSafePhase
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok: report.ok,
  phase: report.phase,
  releaseDecision: report.releaseDecision,
  nsReady,
  allAReady,
  requiredDnsRecords: report.requiredDnsRecords,
  nextSafePhase,
  report: OUT
}, null, 2));
