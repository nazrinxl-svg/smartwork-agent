import fs from "fs";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

const profile = readJson("memory/smartwork.profile.json");
const workflowPath = process.env.SMARTWORK_WORKFLOW || "workflows/smartlearn-input-nilai.sample.json";
const workflow = readJson(workflowPath);

console.log("\n=== SMARTWORK BRAIN ===");
console.log(`Agent   : ${profile.name}`);
console.log(`Workflow: ${workflow.name}`);
console.log(`Intent  : ${workflow.intent}`);
console.log(`Mode    : ${workflow.mode}`);

const actionTypes = workflow.steps.map((s) => s.type);
console.log(`Steps   : ${actionTypes.join(" -> ")}`);

const risky = workflow.steps.filter((s) => ["save", "send", "delete"].includes(s.type));

if (risky.length) {
  console.log("\n=== RISKY ACTIONS DETECTED ===");
  for (const step of risky) console.log(`- ${step.type}: ${step.target || "-"}`);
} else {
  console.log("\nNo risky save/send/delete action in this workflow.");
}

console.log("\nSMARTWORK_BRAIN=OK");