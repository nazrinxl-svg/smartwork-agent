import fs from "fs";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

const workflowPath = process.env.SMARTWORK_WORKFLOW || "workflows/smartlearn-input-nilai.sample.json";
const workflow = readJson(workflowPath);

console.log("\n=== SMARTWORK PLAN ===");
console.log(`Name: ${workflow.name}`);

let index = 1;
for (const step of workflow.steps) {
  console.log(`${index}. ${step.type.toUpperCase()} -> ${step.target || step.using || "-"}`);
  index++;
}

console.log("\nSMARTWORK_PLAN=OK");