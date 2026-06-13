import { spawnSync } from "node:child_process";
import fs from "node:fs";

const armyRoot = "D:\\1. myapps\\smartagent-army";
const mission = process.argv.slice(2).join(" ").trim();

if (!fs.existsSync(armyRoot)) {
  console.error(`[SMARTAGENT MISSION BRIDGE] Folder tidak ditemukan: ${armyRoot}`);
  process.exit(1);
}

if (!mission) {
  console.error("SMARTAGENT_MISSION_BRIDGE=FAILED");
  console.error('Contoh: npm run smartagent:mission -- "Rapikan heading Home dan Progress tanpa sentuh login nav routing"');
  process.exit(1);
}

console.log("\n=== SMARTWORK -> SMARTAGENT DEVELOPER TEAM MISSION ===");
console.log(`[SMARTAGENT MISSION BRIDGE] armyRoot: ${armyRoot}`);
console.log(`[SMARTAGENT MISSION BRIDGE] mission: ${mission}`);

const command = `npm run smartagent:mission -- "${mission.replace(/"/g, '\\"')}"`;

const result = process.platform === "win32"
  ? spawnSync("cmd.exe", ["/d", "/s", "/c", command], {
      cwd: armyRoot,
      stdio: "inherit"
    })
  : spawnSync("npm", ["run", "smartagent:mission", "--", mission], {
      cwd: armyRoot,
      stdio: "inherit"
    });

if (result.error) {
  console.error("\n[SMARTAGENT MISSION BRIDGE] SPAWN ERROR:");
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`\n[SMARTAGENT MISSION BRIDGE] FAILED status=${result.status}`);
  process.exit(result.status ?? 1);
}

console.log("\nSMARTAGENT_MISSION_BRIDGE=OK");

