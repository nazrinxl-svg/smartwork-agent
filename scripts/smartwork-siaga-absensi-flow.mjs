import { spawnSync } from "child_process";
import fs from "fs";

console.log("=== SMARTWORK SIAGA ABSENSI FLOW ===");
console.log("Flow: open -> enter dashboard -> absensi -> tambah -> select");
console.log("Safety: NO SAVE");

const required = [
  "scripts/smartwork-open-siaga-browser.mjs",
  "scripts/smartwork-siaga-enter-dashboard.mjs",
  "scripts/smartwork-siaga-absensi-scout.mjs",
  "scripts/smartwork-siaga-absensi-tambah.mjs",
  "scripts/smartwork-siaga-select-train.mjs"
];

for (const file of required) {
  if (!fs.existsSync(file)) {
    console.error(`MISSING=${file}`);
    process.exit(1);
  }
}

function run(name, args) {
  console.log(`\n=== ${name} ===`);
  const res = spawnSync("npm", ["run", ...args], {
    shell: true,
    stdio: "inherit"
  });

  if (res.status !== 0) {
    console.error(`FLOW_STOP=${name}`);
    process.exit(res.status || 1);
  }

  console.log(`FLOW_OK=${name}`);
}

run("OPEN_SIAGA", ["open:siaga"]);
run("ENTER_DASHBOARD", ["siaga:enter-dashboard"]);
run("OPEN_ABSENSI", ["siaga:absensi-scout"]);
run("CLICK_TAMBAH", ["siaga:absensi-tambah"]);
run("SELECT_FORM", ["siaga:select-train"]);

console.log("\n=== FLOW DONE ===");
console.log("SMARTWORK_SIAGA_ABSENSI_FLOW=DONE_NO_SAVE");
