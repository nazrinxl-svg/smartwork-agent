
import fs from "node:fs";

const file = "reports/smartwork-dewavps-phase5u-persistent-worker-report.json";
if (!fs.existsSync(file)) {
  console.error("Report not found. Run: npm run smartwork:dewavps:phase5u:preflight");
  process.exit(1);
}

console.log(fs.readFileSync(file, "utf8"));
