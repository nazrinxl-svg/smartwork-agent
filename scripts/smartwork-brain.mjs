import fs from "fs";
import path from "path";

const root = process.cwd();

const doctrinePath = path.join(root, "memory", "smartwork-agent-doctrine.json");
const siagaPath = path.join(root, "memory", "siaga-absensi-stable-workflow.json");
const jamRulesPath = path.join(root, "memory", "siaga-absensi-jam-rules.json");
const platformVisionPath = path.join(root, "memory", "smartwork-platform-vision.json");

function readJsonSafe(file) {
  if (!fs.existsSync(file)) return null;

  try {
    const raw = fs.readFileSync(file, "utf8")
      .replace(/^\uFEFF/, "")
      .trim();

    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    return {
      __error: true,
      file,
      message: error.message
    };
  }
}

const doctrine = readJsonSafe(doctrinePath);
const siaga = readJsonSafe(siagaPath);
const jamRules = readJsonSafe(jamRulesPath);
const platformVision = readJsonSafe(platformVisionPath);

console.log("=== SMARTWORK BRAIN ===");

if (!doctrine) {
  console.log("BRAIN_STATUS=NO_DOCTRINE_FOUND");
  process.exit(1);
}

if (doctrine.__error) {
  console.log("BRAIN_STATUS=DOCTRINE_JSON_ERROR");
  console.log(`FILE=${doctrine.file}`);
  console.log(`ERROR=${doctrine.message}`);
  process.exit(1);
}

console.log(`DOCTRINE=${doctrine.name}`);
console.log(`STATUS=${doctrine.status}`);
console.log(`SOURCE_STYLE=${doctrine.sourceStyle}`);

console.log("\n=== CORE RULES ===");
for (const [key, value] of Object.entries(doctrine.coreRules || {})) {
  console.log(`${key}=${value}`);
}

console.log("\n=== STABLE SIAGA FLOW ===");
for (const step of doctrine.siagaAbsensiStableWorkflow?.openFlow || []) {
  console.log(`- ${step}`);
}

console.log("\n=== FIELD VALUES ===");
console.log(JSON.stringify(doctrine.siagaAbsensiStableWorkflow?.fields || {}, null, 2));

console.log("\n=== STABLE SCRIPTS ===");
for (const script of doctrine.stableScripts || []) {
  const exists = fs.existsSync(path.join(root, script));
  console.log(`- ${script} ${exists ? "OK" : "MISSING"}`);
}

console.log("\n=== DECISION ===");
console.log("If already on /guru/absensi/create: run npm run siaga:stable, not login/open-tambah.");
console.log("If on /index/beranda: run node scripts/smartwork-siaga-beranda-to-tambah-only.mjs.");
console.log("If user permits save: run npm run siaga:save.");
console.log("Never run zoom/viewport agents.");

if (siaga && !siaga.__error) {
  console.log("\n=== SIAGA MEMORY FOUND ===");
  console.log(`SIAGA_STATUS=${siaga.status}`);
  console.log(`SIAGA_UPDATED=${siaga.updatedAt}`);
}

if (jamRules && !jamRules.__error) {
  console.log("\n=== SIAGA JAM RULES FOUND ===");
  console.log(`JAM_RULES_STATUS=${jamRules.status}`);
  console.log(`JAM_RULES_UPDATED=${jamRules.updatedAt}`);
  console.log("Jam Masuk default: " + jamRules.rules?.jamMasuk?.default?.start + " - " + jamRules.rules?.jamMasuk?.default?.end);
  console.log("Jam Pulang Jumat: " + jamRules.rules?.jamPulang?.jumat?.start + " - " + jamRules.rules?.jamPulang?.jumat?.end);
  console.log("Jam Pulang Sabtu: " + jamRules.rules?.jamPulang?.sabtu?.start + " - " + jamRules.rules?.jamPulang?.sabtu?.end);
}

if (platformVision && !platformVision.__error) {
  console.log("\n=== SMARTWORK PLATFORM VISION FOUND ===");
  console.log(`PLATFORM_STATUS=${platformVision.status}`);
  console.log(`PLATFORM_UPDATED=${platformVision.updatedAt}`);
  console.log(`PLATFORM_SUMMARY=${platformVision.summary}`);
  console.log("Future agents:");
  for (const agent of platformVision.futureAgents || []) {
    console.log(`- ${agent}`);
  }
  console.log("Decision: SmartWork must stay modular. SIAGA is only the first agent/module.");
}

console.log("SMARTWORK_BRAIN=OK");

console.log("");
console.log("=== SMARTWORK REQUEST PIPELINE CURRENT TARGET ===");
console.log("STATUS=active");
console.log("FOCUS=UI request must become valid runnable request");
console.log("PIPELINE=smartwork-user-request-form -> enrich detailUrl by teacherId/account -> selector picks newest valid UI request -> server E2E runner processes request range");
console.log("CURRENT_BLOCKER=UI request can have username/password/startDate/endDate but detailUrl null; selector will score it invalid until enriched.");
console.log("DO_NOT_WANDER=Do not switch to UI polish, delivery, e-Kinerja, or unrelated SIAGA form work before UI request pipeline is runnable.");

try {
  const checkpointPath = "memory/smartwork-current-checkpoint.json";
  if (fs.existsSync(checkpointPath)) {
    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    console.log("");
    console.log("=== SMARTWORK_CURRENT_CHECKPOINT_MEMORY_FROM_FILE ===");
    console.log("UPDATED_AT=" + checkpoint.updatedAt);
    console.log("MAIN_DIRECTION=" + checkpoint.mainDirection);
    console.log("SUCCESS_NATIVE_HTTP=" + checkpoint.success?.nativeHttpRoutes?.status);
    console.log("SUCCESS_SERVER_WRAPPER=" + checkpoint.success?.serverRunnerWrapper?.status);
    console.log("SUCCESS_UI_REQUEST_SELECTION=" + checkpoint.success?.uiRequestSelection?.status);
    console.log("SUCCESS_DETAILURL_ENRICHMENT=" + checkpoint.success?.detailUrlEnrichment?.status);
    console.log("SUCCESS_DRY_RUN_UI_REQUEST=" + checkpoint.success?.dryRunUiRequest?.status);
    console.log("SUCCESS_CREDENTIAL_REDACTION=" + checkpoint.success?.credentialRedaction?.status);
    console.log("NOT_DONE_REAL_SAVE_UI_REQUEST=" + checkpoint.notDoneYet?.realSaveUiRequest?.status);
    console.log("NOT_DONE_PDF_PROOF_DELIVERY_UI_REQUEST=" + checkpoint.notDoneYet?.finalPdfProofDeliveryForUiRequest?.status);
    console.log("NOT_DONE_SAFE_COMMIT=" + checkpoint.notDoneYet?.safeCommit?.status);
    console.log("ANTI_REPEAT_GUARD=" + checkpoint.antiRepeatGuard?.status);
    console.log("NEXT_INCOMPLETE_STEP=" + checkpoint.antiRepeatGuard?.nextIncompleteStep);
  }
} catch (err) {
  console.log("SMARTWORK_CURRENT_CHECKPOINT_MEMORY_READ_ERROR=" + (err?.message || String(err)));
}


try {
  const deliveryPolicyPath = "memory/smartwork-delivery-policy.json";
  if (fs.existsSync(deliveryPolicyPath)) {
    const deliveryPolicy = JSON.parse(fs.readFileSync(deliveryPolicyPath, "utf8"));
    console.log("");
    console.log("=== SMARTWORK_DELIVERY_POLICY_FROM_FILE ===");
    console.log("DELIVERY_POLICY_STATUS=" + deliveryPolicy.status);
    console.log("DELIVERY_POLICY_DECISION=" + deliveryPolicy.productDecision);
    console.log("EMAIL_DELIVERY=DISABLED");
    console.log("WHATSAPP_DELIVERY=DISABLED");
    console.log("OUTPUT_MODE=APP_DOWNLOAD_PDF_AND_PROOF_ONLY");
  }
} catch (err) {
  console.log("SMARTWORK_DELIVERY_POLICY_READ_ERROR=" + (err?.message || String(err)));
}
