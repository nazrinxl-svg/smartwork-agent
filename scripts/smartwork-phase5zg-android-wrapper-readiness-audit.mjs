import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checkpointDir = path.join(root, "docs", "checkpoints");
fs.mkdirSync(checkpointDir, { recursive: true });

const checkpoint = path.join(checkpointDir, "smartwork-phase5zg-android-wrapper-readiness-report.json");

const files = {
  decisionDoc: "docs/playstore/smartwork-phase5zg-android-wrapper-decision.md",
  decisionJson: "android/phase5zg/smartwork-android-wrapper-decision.json",
  assetLinksTemplate: "android/phase5zg/assetlinks.template.json",
  readme: "android/phase5zg/README.md",
  manifest: "public/manifest.webmanifest",
  apiReadiness: "deploy/phase5zf/smartwork-public-api-readiness.json"
};

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8").replace(/^\uFEFF/, ""));
}

const decision = readJson(files.decisionJson);
const manifest = readJson(files.manifest);
const api = readJson(files.apiReadiness);
const assetLinks = readJson(files.assetLinksTemplate);

const checks = {
  decisionDocReady: fs.existsSync(path.join(root, files.decisionDoc)),
  decisionJsonReady: fs.existsSync(path.join(root, files.decisionJson)),
  assetLinksTemplateReady: fs.existsSync(path.join(root, files.assetLinksTemplate)),
  readmeReady: fs.existsSync(path.join(root, files.readme)),
  twaFirstDecision: decision.decision === "TWA_FIRST",
  packageNameReady: decision.app?.packageName === "id.smartwork.agent",
  webUrlIsHttps: String(decision.app?.webAppUrl || "").startsWith("https://"),
  apiUrlIsHttps: String(decision.app?.apiUrl || "").startsWith("https://"),
  manifestStandalone: manifest.display === "standalone",
  manifestStartUrlReady: Boolean(manifest.start_url),
  apiReadinessHttpsRecommended: String(api.recommendedPublicApiBase || "").startsWith("https://"),
  assetLinksHasPackage: assetLinks?.[0]?.target?.package_name === "id.smartwork.agent",
  assetLinksNeedsFingerprintReplacement: String(assetLinks?.[0]?.target?.sha256_cert_fingerprints?.[0] || "").includes("REPLACE_WITH"),
  safetyNoRealActions:
    decision.safety?.noSiagaInput === true &&
    decision.safety?.noBrowserOpen === true &&
    decision.safety?.noRealSave === true &&
    decision.safety?.noRealSend === true &&
    decision.safety?.noPlayStoreUpload === true
};

const report = {
  ok: Object.values(checks).every(Boolean),
  phase: "5ZG",
  releaseDecision: "ANDROID_TWA_WRAPPER_READINESS_PACK_READY",
  importantNote: "This phase prepares Android/TWA readiness only. It does not build, sign, or upload an AAB.",
  files,
  decision,
  checks,
  createdAt: new Date().toISOString()
};

fs.writeFileSync(checkpoint, JSON.stringify(report, null, 2));

console.log(JSON.stringify({
  ok: report.ok,
  phase: report.phase,
  releaseDecision: report.releaseDecision,
  checks,
  checkpoint: path.relative(root, checkpoint).replaceAll("\\", "/")
}, null, 2));

if (!report.ok) process.exitCode = 1;
