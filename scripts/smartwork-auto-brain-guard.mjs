import { spawnSync } from "child_process";

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const label = args.find((x) => x.startsWith("--label="))?.split("=").slice(1).join("=") || "SmartWork action";

console.log(`SMARTWORK_AUTO_BRAIN_GUARD=START label=${label}`);

const brain = spawnSync(process.execPath, ["scripts/smartwork-brain-warning-check.mjs", strict ? "--strict" : "--warn"], {
  cwd: process.cwd(),
  encoding: "utf8",
  shell: false
});

process.stdout.write(brain.stdout || "");
process.stderr.write(brain.stderr || "");

if (brain.status !== 0) {
  console.error(`SMARTWORK_AUTO_BRAIN_GUARD=BLOCKED label=${label}`);
  process.exit(brain.status || 1);
}

console.log(`SMARTWORK_AUTO_BRAIN_GUARD=DONE label=${label}`);
process.exit(0);
