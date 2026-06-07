import fs from "fs";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

const workflowPath = process.env.SMARTWORK_WORKFLOW || "workflows/smartlearn-input-nilai.sample.json";
const workflow = readJson(workflowPath);
const config = readJson(workflow.targetConfig);

const permissions = {
  ...(config.permissions || {}),
  ...(workflow.permissions || {})
};

console.log("\n=== SMARTWORK GUARD ===");
console.log(`Workflow : ${workflow.name}`);
console.log(`dryRun   : ${permissions.dryRun}`);
console.log(`write    : ${permissions.allowWrite}`);
console.log(`delete   : ${permissions.allowDelete}`);
console.log(`send     : ${permissions.allowSend}`);

let approved = true;
const blocks = [];

for (const step of workflow.steps) {
  if (step.type === "save" && !permissions.allowWrite) {
    approved = false;
    blocks.push("save blocked: allowWrite=false");
  }

  if (step.type === "edit" && permissions.dryRun === false && !permissions.allowWrite) {
    approved = false;
    blocks.push("edit commit blocked: allowWrite=false");
  }

  if (step.type === "delete" && !permissions.allowDelete) {
    approved = false;
    blocks.push("delete blocked: allowDelete=false");
  }

  if (step.type === "send" && !permissions.allowSend) {
    approved = false;
    blocks.push("send blocked: allowSend=false");
  }
}

if (blocks.length) {
  console.log("\n=== BLOCKS ===");
  for (const block of blocks) console.log(`- ${block}`);
}

console.log(approved ? "\nSMARTWORK_GUARD=APPROVED" : "\nSMARTWORK_GUARD=BLOCKED");
process.exit(approved ? 0 : 2);