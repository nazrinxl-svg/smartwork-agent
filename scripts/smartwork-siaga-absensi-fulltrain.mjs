import { spawnSync } from "child_process";
import fs from "fs";

const requiredScripts = [
  "scripts/smartwork-open-siaga-browser.mjs",
  "scripts/smartwork-siaga-login-test.mjs",
  "scripts/smartwork-siaga-absensi-scout.mjs",
  "scripts/smartwork-siaga-absensi-tambah.mjs",
  "scripts/smartwork-siaga-select-train.mjs"
];

console.log("=== SMARTWORK SIAGA ABSENSI FULLTRAIN ===");
console.log("Flow: open -> login -> absensi -> tambah -> select form");
console.log("Safety: NO SAVE, NO SEND, NO DELETE");

for (const file of requiredScripts) {
  if (!fs.existsSync(file)) {
    console.error(`MISSING_SCRIPT=${file}`);
    console.error("Jalankan patch agent sebelumnya dulu atau minta regenerate script.");
    process.exit(1);
  }
}

function runStep(name, command, args) {
  console.log(`\n=== RUN ${name} ===`);

  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true
  });

  if (result.status !== 0) {
    console.error(`\nFULLTRAIN_STOP=${name}`);
    console.error(`Exit code: ${result.status}`);
    process.exit(result.status || 1);
  }

  console.log(`FULLTRAIN_STEP_OK=${name}`);
}

runStep("OPEN_SIAGA", "npm", ["run", "open:siaga"]);
runStep("LOGIN_TEST", "npm", ["run", "siaga:login-test"]);
runStep("OPEN_ABSENSI", "npm", ["run", "siaga:absensi-scout"]);
runStep("CLICK_TAMBAH", "npm", ["run", "siaga:absensi-tambah"]);
runStep("SELECT_FORM", "npm", ["run", "siaga:select-train"]);

console.log("\n=== SMARTWORK SIAGA ABSENSI FULLTRAIN DONE ===");
console.log("TARGET_RESULT=FORM_SELECTED_NO_SAVE");
console.log("Sekarang cek browser: Sekolah, Bulan, Tahun, Tidak ada cuti harus sudah terpilih.");
console.log("Tombol Simpan sengaja BELUM diklik.");
