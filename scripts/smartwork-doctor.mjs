import fs from "fs";
import path from "path";

const root = process.cwd();

const required = [
  "memory/smartwork-agent-doctrine.json",
  "memory/SMARTWORK-AGENT-DOCTRINE.md",
  "scripts/smartwork-brain.mjs",
  "scripts/smartwork-siaga-beranda-to-tambah-only.mjs",
  "scripts/smartwork-siaga-smart-fill-current-form-no-save.mjs",
  "scripts/smartwork-siaga-smart-fill-and-save.mjs",
  "scripts/smartwork-siaga-set-sekolah-select2-value-only.mjs"
];

const forbiddenPatterns = [
  {
    pattern: /setViewportSize\s*\(/,
    label: "FORBIDDEN_page_setViewportSize"
  },
  {
    pattern: /Emulation\.setPageScaleFactor/,
    label: "FORBIDDEN_Emulation_setPageScaleFactor"
  },
  {
    pattern: /style\.zoom\s*=/,
    label: "FORBIDDEN_css_zoom"
  }
];

console.log("=== SMARTWORK DOCTOR ===");

let ok = true;

for (const file of required) {
  const exists = fs.existsSync(path.join(root, file));
  console.log(`${exists ? "OK" : "MISS"} ${file}`);
  if (!exists) ok = false;
}

console.log("\n=== SCAN FORBIDDEN PATTERNS IN STABLE SIAGA SCRIPTS ===");

const stableScripts = [
  "scripts/smartwork-siaga-beranda-to-tambah-only.mjs",
  "scripts/smartwork-siaga-smart-fill-current-form-no-save.mjs",
  "scripts/smartwork-siaga-smart-fill-and-save.mjs",
  "scripts/smartwork-siaga-set-sekolah-select2-value-only.mjs"
];

for (const file of stableScripts) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) continue;

  const text = fs.readFileSync(full, "utf8");

  for (const item of forbiddenPatterns) {
    if (item.pattern.test(text)) {
      console.log(`WARN ${item.label} in ${file}`);
      ok = false;
    }
  }
}

console.log(`SMARTWORK_DOCTOR=${ok ? "OK" : "WARN_CHECK_OUTPUT"}`);
process.exit(ok ? 0 : 1);
