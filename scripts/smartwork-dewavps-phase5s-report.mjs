import fs from "node:fs";

const file = "reports/smartwork-dewavps-phase5s-first-boot-pack-report.json";
if (!fs.existsSync(file)) {
  console.error("Report not found. Run: npm run smartwork:dewavps:phase5s:preflight");
  process.exit(1);
}

console.log(fs.readFileSync(file, "utf8"));
