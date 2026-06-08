import fs from "fs";
import path from "path";

const root = process.cwd();
const jsonPath = path.join(root, "memory", "siaga-absensi-stable-workflow.json");
const mdPath = path.join(root, "memory", "SIAGA-ABSENSI-STABLE-WORKFLOW.md");

console.log("=== SMARTWORK SIAGA MEMORY ===");

if (!fs.existsSync(jsonPath)) {
  console.log("MEMORY_STATUS=NOT_FOUND");
  process.exit(1);
}

const memory = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

console.log(`MEMORY_STATUS=${memory.status}`);
console.log(`MEMORY_ID=${memory.id}`);
console.log(`UPDATED_AT=${memory.updatedAt}`);

console.log("\n=== RULES ===");
for (const [key, value] of Object.entries(memory.rules || {})) {
  console.log(`${key}=${value}`);
}

console.log("\n=== KNOWN VALUES ===");
console.log(JSON.stringify(memory.knownValues, null, 2));

console.log("\n=== STABLE SCRIPTS ===");
for (const script of memory.stableScripts || []) {
  console.log(`- ${script}`);
}

console.log("\n=== MARKDOWN MEMORY ===");
if (fs.existsSync(mdPath)) {
  console.log(mdPath);
}

console.log("SMARTWORK_SIAGA_MEMORY=OK");
