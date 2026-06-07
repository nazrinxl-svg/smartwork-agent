import fs from "fs";

function readJson(path) {
  const text = fs.readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

const profile = readJson("memory/smartwork.profile.json");
const doctor = process.argv.includes("--doctor");

console.log("\n=== SMARTWORK AGENT ===");
console.log(`Name    : ${profile.name}`);
console.log(`Version : ${profile.version}`);
console.log(`Status  : ${profile.status}`);
console.log(`Role    : ${profile.role}`);
console.log(`Tagline : ${profile.tagline}`);

console.log("\n=== CAPABILITIES ===");
for (const [key, value] of Object.entries(profile.capabilities)) {
  console.log(`${value ? "OK" : "NO"}   ${key}`);
}

console.log("\n=== SAFETY RULES ===");
for (const rule of profile.safetyRules) {
  console.log(`- ${rule}`);
}

if (doctor) {
  const required = [
    "memory/smartwork.profile.json",
    "configs/smartlearn.local.json",
    "workflows/smartlearn-input-nilai.sample.json",
    "scripts/smartwork-brain.mjs",
    "scripts/smartwork-guard.mjs",
    "scripts/smartwork-plan.mjs"
  ];

  console.log("\n=== DOCTOR ===");

  let ok = true;

  for (const file of required) {
    if (fs.existsSync(file)) {
      console.log(`OK   ${file}`);
    } else {
      console.log(`MISS ${file}`);
      ok = false;
    }
  }

  console.log(ok ? "\nSMARTWORK_DOCTOR=OK" : "\nSMARTWORK_DOCTOR=NEED_FIX");
  process.exit(ok ? 0 : 1);
}

console.log("\nSMARTWORK_RESULT=READY");