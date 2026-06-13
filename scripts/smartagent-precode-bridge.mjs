import { spawnSync } from "node:child_process";
import fs from "node:fs";

const armyRoot = "C:\\Users\\Digitalisasi\\Desktop\\smartagent-army";

if (!fs.existsSync(armyRoot)) {
  console.error(`[SMARTAGENT BRIDGE] Folder tidak ditemukan: ${armyRoot}`);
  process.exit(1);
}

console.log("\n=== SMARTWORK -> SMARTAGENT ARMY PRECODE GATE ===");
console.log(`[SMARTAGENT BRIDGE] armyRoot: ${armyRoot}`);

const result = process.platform === "win32"
  ? spawnSync("cmd.exe", ["/d", "/s", "/c", "npm run smartagent:precode"], {
      cwd: armyRoot,
      stdio: "inherit"
    })
  : spawnSync("npm", ["run", "smartagent:precode"], {
      cwd: armyRoot,
      stdio: "inherit"
    });

if (result.error) {
  console.error("\n[SMARTAGENT BRIDGE] SPAWN ERROR:");
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`\n[SMARTAGENT BRIDGE] FAILED: smartagent:precode tidak lolos. status=${result.status}`);
  process.exit(result.status ?? 1);
}

console.log("\n[SMARTAGENT BRIDGE] OK: SmartAgent Army precode gate passed.");
