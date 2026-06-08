import fs from "fs";
import path from "path";

const root = process.cwd();

const doctrinePath = path.join(root, "memory", "smartwork-agent-doctrine.json");
const siagaPath = path.join(root, "memory", "siaga-absensi-stable-workflow.json");

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

console.log("SMARTWORK_BRAIN=OK");
