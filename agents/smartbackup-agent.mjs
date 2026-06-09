import fs from "fs";
import path from "path";

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join("reports", "smartbackup-agent-report.json");

const configPath = path.join("configs", "smartbackup-agent.json");

function readJsonSafe(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const clean = raw.replace(/^\uFEFF/, "").trim();
  return JSON.parse(clean);
}

const config = readJsonSafe(configPath);

const report = {
  ok: true,
  agent: "SmartBackup Agent",
  mode: "ALWAYS_ON",
  stamp,
  message: "SmartBackup Agent siap mengamankan data sebelum file/input/save/submit/delete/send.",
  rules: {
    backupBeforeEdit: true,
    backupBeforeInput: true,
    backupBeforeSave: true,
    backupBeforeSubmit: true,
    backupBeforeDelete: true,
    backupBeforeSend: true,
    neverWaitUserForBackup: true
  },
  config
};

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log("SMARTBACKUP_AGENT=ALWAYS_ON");
console.log("RULE=BACKUP_BEFORE_ANY_CHANGE");
console.log("BOM_SAFE=YES");
console.log("REPORT=" + reportPath);
