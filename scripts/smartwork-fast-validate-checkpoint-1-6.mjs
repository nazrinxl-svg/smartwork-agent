import fs from "fs";

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function exists(file) {
  return fs.existsSync(file);
}

const p = readJson("reports/smartwork-v6-auto-request-pipeline-report.json");
const a = readJson("reports/smartwork-app-artifacts-report.json");
const f = readJson("reports/smartwork-final-progress-report.json");

const pdf = "reports/downloads/Presensi_Nazrin_Juni_2026.pdf";

const ok =
  p.ok === true &&
  p.cleanExit === true &&
  (p.error === null || p.error === undefined) &&
  a.ok === true &&
  a.artifactGuard?.verifyComplete === true &&
  a.artifactGuard?.artifactMatchesActiveRequest === true &&
  a.artifacts?.pdfReady === true &&
  a.artifacts?.proofReady === true &&
  a.uiText?.title === "Hasil Siap" &&
  f.ok === true &&
  f.verifyComplete === true &&
  Number(f.summary?.alreadyFilled || 0) === 6 &&
  Number(f.summary?.needsPlan || 0) === 0 &&
  exists(pdf);

console.log(JSON.stringify({
  ok,
  pipeline: {
    ok: p.ok,
    cleanExit: p.cleanExit,
    error: p.error,
    endedAt: p.endedAt
  },
  appArtifacts: {
    ok: a.ok,
    verifyComplete: a.artifactGuard?.verifyComplete,
    artifactMatchesActiveRequest: a.artifactGuard?.artifactMatchesActiveRequest,
    pdfReady: a.artifacts?.pdfReady,
    proofReady: a.artifacts?.proofReady,
    uiTitle: a.uiText?.title
  },
  finalProgress: {
    ok: f.ok,
    verifyComplete: f.verifyComplete,
    alreadyFilled: f.summary?.alreadyFilled,
    needsPlan: f.summary?.needsPlan
  },
  pdfExists: exists(pdf)
}, null, 2));

if (!ok) process.exit(1);
