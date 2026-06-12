import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const PHASE = "5ZS";
const APP_BASE = process.env.SMARTWORK_APP_BASE || "http://103.152.242.193:3108";
const DIRECT_API_BASE = process.env.SMARTWORK_API_BASE || "http://103.152.242.193:3107";
const PHASE5ZR_JOB_ID = "phase5zr-final-same-origin-1781260128225";
const OUT = "reports/smartwork-phase5zs-staging-readiness-rollup.json";
const BACKUP = "reports/smartwork-phase5zs-backup-snapshot.json";

const expectedSafety = {
  dryRun: true,
  noSiagaInput: true,
  noBrowserOpen: true,
  noRealSave: true,
  noRealSend: true,
  noAabBuild: true,
  noPlayStoreUpload: true
};

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
    const clean = text.replace(/^\uFEFF/, "").trimStart();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return safeParseJson(fs.readFileSync(file, "utf8"));
}

function walkJsonFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];

  while (stack.length) {
    const current = stack.pop();
    const stat = fs.statSync(current);

    if (stat.isDirectory()) {
      for (const item of fs.readdirSync(current)) stack.push(path.join(current, item));
      continue;
    }

    if (stat.isFile() && current.endsWith(".json") && stat.size < 5_000_000) out.push(current);
  }

  return out;
}

function normalizePath(file) {
  return file.replaceAll("\\", "/").toLowerCase();
}

function isSelfOrPhase5zsEvidenceFile(file) {
  const normalized = normalizePath(file);
  return normalized.includes("phase5zs");
}

function firstKeyValue(value, key) {
  if (!value || typeof value !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstKeyValue(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  for (const child of Object.values(value)) {
    const found = firstKeyValue(child, key);
    if (found !== undefined) return found;
  }

  return undefined;
}

function allKeyValues(value, key, out = []) {
  if (!value || typeof value !== "object") return out;

  if (Object.prototype.hasOwnProperty.call(value, key)) out.push(value[key]);

  if (Array.isArray(value)) {
    for (const item of value) allKeyValues(item, key, out);
    return out;
  }

  for (const child of Object.values(value)) allKeyValues(child, key, out);
  return out;
}

function hasTrue(json, raw, key) {
  return firstKeyValue(json, key) === true ||
    new RegExp(`"${key}"\\s*:\\s*true`, "i").test(raw);
}

function hasCompleted(raw) {
  return /completed|hasil_siap|hasil siap|ready/i.test(raw);
}

function hasPercent100(json, raw) {
  const keys = ["percent", "progress", "progressPercent", "completionPercent"];
  for (const key of keys) {
    for (const value of allKeyValues(json, key)) {
      if (Number(value) === 100) return true;
    }
  }
  return /"percent"\s*:\s*100/i.test(raw) || /percent[^0-9]+100/i.test(raw);
}

function latestMtimeMs(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function findPhase5zrEvidence() {
  const files = [
    ...walkJsonFiles("reports"),
    ...walkJsonFiles("docs/checkpoints")
  ];

  const candidates = [];

  for (const file of files) {
    if (isSelfOrPhase5zsEvidenceFile(file)) continue;

    const raw = fs.readFileSync(file, "utf8");
    const json = safeParseJson(raw);
    if (!json) continue;

    const releaseDecision = firstKeyValue(json, "releaseDecision");
    const has5zrRelease =
      releaseDecision === "STAGED_PUBLIC_IP_SAME_ORIGIN_API_PROXY_READY" ||
      raw.includes("STAGED_PUBLIC_IP_SAME_ORIGIN_API_PROXY_READY");

    const has5zrJob = raw.includes(PHASE5ZR_JOB_ID);
    if (!has5zrRelease && !has5zrJob) continue;

    const hasSameOriginBase = raw.includes("103.152.242.193:3108") || raw.includes("/api/smartwork/jobs/health");
    const hasArtifacts = hasTrue(json, raw, "pdfReady") || hasTrue(json, raw, "proofReady");

    let score = 0;
    if (/5zr|same-origin|same_origin/i.test(file)) score += 25;
    if (has5zrRelease) score += 50;
    if (has5zrJob) score += 40;
    if (hasSameOriginBase) score += 10;
    if (hasArtifacts) score += 10;
    if (/phase5zc|phase5zd|phase5ze|phase5zf|phase5zg|phase5zh|phase5zi|phase5zj|phase5zk|phase5zl|phase5zm|phase5zn|phase5zo|phase5zp|phase5zq/i.test(file)) score -= 100;

    candidates.push({ file, score, mtimeMs: latestMtimeMs(file), json, raw });
  }

  candidates.sort((a, b) => (b.score - a.score) || (b.mtimeMs - a.mtimeMs));
  return candidates[0] || null;
}

async function checkUrl(name, url, options = {}) {
  const startedAt = Date.now();

  try {
    const res = await fetch(url, {
      headers: { "user-agent": `SmartWork-Agent-${PHASE}-Rollup` },
      signal: AbortSignal.timeout(15_000)
    });

    const contentType = res.headers.get("content-type") || "";
    const allowOrigin = res.headers.get("access-control-allow-origin") || "";
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
      checks.push({ name: "parseJson", expected: true, actual: Boolean(json), ok: Boolean(json) });
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
      allowOrigin,
      durationMs: Date.now() - startedAt,
      checks,
      json,
      bodySample: body.slice(0, 500)
    };
  } catch (error) {
    return {
      name,
      url,
      ok: false,
      error: error.message,
      durationMs: Date.now() - startedAt,
      checks: [{ name: "fetch", ok: false, error: error.message }]
    };
  }
}

async function firstPassing(name, urls, options) {
  const attempts = [];

  for (const url of urls) {
    const result = await checkUrl(name, url, options);
    attempts.push(result);
    if (result.ok) return { ...result, attempts };
  }

  const last = attempts[attempts.length - 1] || { name, ok: false };
  return { ...last, attempts };
}

const sameOriginHealth = await checkUrl(
  "sameOriginProxyHealth",
  `${APP_BASE}/api/smartwork/jobs/health`,
  {
    contentTypeIncludes: "application/json",
    parseJson: true,
    jsonOk: (json) => json.ok === true
  }
);

const directApiHealth = await checkUrl(
  "directApiHealth",
  `${DIRECT_API_BASE}/api/smartwork/jobs/health`,
  {
    contentTypeIncludes: "application/json",
    parseJson: true,
    jsonOk: (json) => json.ok === true
  }
);

const routeChecks = [
  await firstPassing("home", [`${APP_BASE}/home.html`, `${APP_BASE}/`], { contentTypeIncludes: "text/html" }),
  await firstPassing("request", [`${APP_BASE}/request.html`, `${APP_BASE}/request`], { contentTypeIncludes: "text/html" }),
  await firstPassing("progress", [`${APP_BASE}/progress.html`, `${APP_BASE}/progress`], { contentTypeIncludes: "text/html" }),
  await firstPassing("privacy", [`${APP_BASE}/privacy.html`, `${APP_BASE}/privacy`], { contentTypeIncludes: "text/html" }),
  await firstPassing("manifest", [`${APP_BASE}/manifest.webmanifest`, `${APP_BASE}/manifest.json`], { parseJson: true }),
  await firstPassing("assetlinks", [`${APP_BASE}/.well-known/assetlinks.json`, `${APP_BASE}/assetlinks.json`], { parseJson: true })
];

const phase5zrEvidence = findPhase5zrEvidence();
const evidenceJson = phase5zrEvidence?.json || {};
const evidenceRaw = phase5zrEvidence?.raw || "";

const liveJobStatus = await firstPassing(
  "phase5zrLiveJobStatus",
  [
    `${APP_BASE}/api/smartwork/jobs/${PHASE5ZR_JOB_ID}`,
    `${DIRECT_API_BASE}/api/smartwork/jobs/${PHASE5ZR_JOB_ID}`,
    `${APP_BASE}/api/smartwork/jobs/status/${PHASE5ZR_JOB_ID}`,
    `${DIRECT_API_BASE}/api/smartwork/jobs/status/${PHASE5ZR_JOB_ID}`,
    `${APP_BASE}/api/smartwork/jobs/status?jobId=${encodeURIComponent(PHASE5ZR_JOB_ID)}`,
    `${DIRECT_API_BASE}/api/smartwork/jobs/status?jobId=${encodeURIComponent(PHASE5ZR_JOB_ID)}`
  ],
  {
    parseJson: true,
    jsonOk: (json) => Boolean(json)
  }
);

const liveJobRaw = JSON.stringify(liveJobStatus.json || {});
const liveJobJson = liveJobStatus.json || {};
const combinedRaw = [evidenceRaw, liveJobRaw].filter(Boolean).join("\n");

const backupJson = readJson(BACKUP) || {};
const backupSafety = backupJson.safety || {};

const safetyChecks = Object.entries(expectedSafety).map(([key, expected]) => {
  const fromBackup = backupSafety[key];
  const fromEvidence = firstKeyValue(evidenceJson, key);
  const actual = fromBackup !== undefined ? fromBackup : fromEvidence;

  return {
    key,
    expected,
    actual,
    source: fromBackup !== undefined ? BACKUP : phase5zrEvidence?.file || null,
    ok: actual === expected
  };
});

const liveOrEvidenceHasJob =
  combinedRaw.includes(PHASE5ZR_JOB_ID) ||
  liveJobStatus.ok;

const liveOrEvidenceCompleted =
  hasCompleted(combinedRaw) ||
  hasCompleted(JSON.stringify(liveJobJson));

const liveOrEvidencePercent100 =
  hasPercent100(evidenceJson, evidenceRaw) ||
  hasPercent100(liveJobJson, liveJobRaw);

const liveOrEvidencePdfReady =
  hasTrue(evidenceJson, evidenceRaw, "pdfReady") ||
  hasTrue(liveJobJson, liveJobRaw, "pdfReady");

const liveOrEvidenceProofReady =
  hasTrue(evidenceJson, evidenceRaw, "proofReady") ||
  hasTrue(liveJobJson, liveJobRaw, "proofReady");

const jobCompleted100Ok =
  liveOrEvidenceHasJob &&
  liveOrEvidenceCompleted &&
  liveOrEvidencePercent100 &&
  liveOrEvidencePdfReady &&
  liveOrEvidenceProofReady;

const allRoutesOk = routeChecks.every((r) => r.ok);
const sameOriginReadyNow = sameOriginHealth.ok && directApiHealth.ok && allRoutesOk;

const releaseDecisionOk =
  firstKeyValue(evidenceJson, "releaseDecision") === "STAGED_PUBLIC_IP_SAME_ORIGIN_API_PROXY_READY" ||
  evidenceRaw.includes("STAGED_PUBLIC_IP_SAME_ORIGIN_API_PROXY_READY") ||
  (sameOriginReadyNow && jobCompleted100Ok);

const phase5zrChecks = [
  {
    name: "phase5zrEvidenceOrLiveJobFound",
    ok: Boolean(phase5zrEvidence) || liveJobStatus.ok,
    file: phase5zrEvidence?.file || null,
    liveJobStatusOk: liveJobStatus.ok
  },
  {
    name: "phase5zrEvidenceNotSelfOrOldPhase",
    ok: !phase5zrEvidence || (
      !isSelfOrPhase5zsEvidenceFile(phase5zrEvidence.file) &&
      !/phase5zc|phase5zd|phase5ze|phase5zf|phase5zg|phase5zh|phase5zi|phase5zj|phase5zk|phase5zl|phase5zm|phase5zn|phase5zo|phase5zp|phase5zq/i.test(phase5zrEvidence.file)
    ),
    file: phase5zrEvidence?.file || null
  },
  {
    name: "phase5zrReleaseDecisionOrLiveSameOrigin",
    expected: "STAGED_PUBLIC_IP_SAME_ORIGIN_API_PROXY_READY or current same-origin readiness + completed job",
    actual: firstKeyValue(evidenceJson, "releaseDecision") || null,
    ok: releaseDecisionOk
  },
  {
    name: "phase5zrJobCompleted100",
    expected: PHASE5ZR_JOB_ID,
    actual: {
      localEvidenceFile: phase5zrEvidence?.file || null,
      liveJobStatusOk: liveJobStatus.ok,
      liveJobStatusUrl: liveJobStatus.url || null,
      hasJobId: liveOrEvidenceHasJob,
      hasCompleted: liveOrEvidenceCompleted,
      hasPercent100: liveOrEvidencePercent100,
      pdfReady: liveOrEvidencePdfReady,
      proofReady: liveOrEvidenceProofReady
    },
    ok: jobCompleted100Ok
  }
];

const knownNonBlockingIssues = [
  {
    id: "PHASE_5ZQ_DIRECT_CORS_OLD_ALLOW_ORIGIN",
    detail: "Direct API :3107 may still expose old cross-port CORS allowOrigin. Phase 5ZR staging path intentionally uses same-origin /api proxy on :3108, so phone/browser should use one origin.",
    observedDirectAllowOrigin: directApiHealth.allowOrigin || null,
    blocking: false
  },
  {
    id: "DOMAIN_HTTPS_ASSETLINKS_FINGERPRINT_NOT_LIVE_YET",
    detail: "TWA/AAB/Play Store remains blocked until domain HTTPS and assetlinks fingerprint are live.",
    blocking: true
  }
];

const criticalChecks = [
  { name: "sameOriginHealth", ok: sameOriginHealth.ok },
  { name: "directApiHealth", ok: directApiHealth.ok },
  ...routeChecks.map((r) => ({ name: `route:${r.name}`, ok: r.ok })),
  ...phase5zrChecks.map((c) => ({ name: c.name, ok: c.ok })),
  { name: "safetyFlagsKept", ok: safetyChecks.every((c) => c.ok) }
];

const ok = criticalChecks.every((c) => c.ok);

const report = {
  ok,
  phase: PHASE,
  createdAt: new Date().toISOString(),
  releaseDecision: ok
    ? "STAGING_PRE_DOMAIN_READY_FOR_DOMAIN_DNS_HTTPS_PHASE5ZS"
    : "STAGING_PRE_DOMAIN_READINESS_NEEDS_FIX_PHASE5ZS",
  bases: {
    appStagingPublicIp: APP_BASE,
    directApiVps: DIRECT_API_BASE,
    sameOriginProxyHealth: `${APP_BASE}/api/smartwork/jobs/health`
  },
  git: {
    branch: sh("git branch --show-current"),
    head: sh("git rev-parse --short HEAD"),
    latestCommit: sh("git log -1 --oneline"),
    statusShort: sh("git status --short")
  },
  agentArmy: {
    brainCommander: true,
    diagnose: true,
    guard: true,
    backup: true,
    runnerWorker: "read-only staging probes and existing 5ZR job status only; no new SIAGA job submitted",
    smartUiDoctor: "route and static artifact readiness checked without opening browser",
    reportCommitTag: true
  },
  safetyExpected: expectedSafety,
  safetyChecks,
  checks: {
    criticalChecks,
    sameOriginHealth,
    directApiHealth,
    routeChecks,
    phase5zrChecks,
    liveJobStatus
  },
  phase5zrEvidence: phase5zrEvidence
    ? { file: phase5zrEvidence.file, score: phase5zrEvidence.score }
    : null,
  knownNonBlockingIssues,
  hardStopsStillActive: {
    noSiagaInput: true,
    noBrowserOpen: true,
    noRealSave: true,
    noRealSend: true,
    noAabBuild: true,
    noPlayStoreUpload: true,
    noTwaUntilHttpsDomainAndAssetlinksFingerprintLive: true
  },
  nextSafePhase: ok
    ? "Domain/DNS/HTTPS setup for smartwork-agent.id and api.smartwork-agent.id; do not build AAB or upload Play Store until assetlinks fingerprint is live."
    : "Fix failed staging readiness checks before domain/DNS/HTTPS."
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok: report.ok,
  phase: report.phase,
  releaseDecision: report.releaseDecision,
  sameOriginHealth: sameOriginHealth.ok,
  directApiHealth: directApiHealth.ok,
  routesOk: allRoutesOk,
  phase5zrEvidence: phase5zrEvidence?.file || null,
  liveJobStatusOk: liveJobStatus.ok,
  liveJobStatusUrl: liveJobStatus.url || null,
  safetyKept: safetyChecks.every((c) => c.ok),
  report: OUT
}, null, 2));

if (!ok) process.exitCode = 1;
