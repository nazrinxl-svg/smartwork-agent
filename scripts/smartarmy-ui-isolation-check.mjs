import fs from "node:fs";

const checks = {
  uiServerExists: fs.existsSync("scripts/smartarmy-ui-server.mjs"),
  internalUiExists: fs.existsSync("tools/smartarmy-ui/smartarmy-ui.html"),
  publicUiRemoved: !fs.existsSync("public/smartarmy-ui.html")
};

const ok = Object.values(checks).every(Boolean);

const report = {
  ok,
  mode: "SMARTARMY_UI_ISOLATION_CHECK",
  checks,
  safety: {
    localOnly: true,
    noSiagaInput: true,
    noBrowserAutomation: true,
    noRealSaveSendDelete: true,
    notPublicAppRoute: checks.publicUiRemoved
  }
};

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync("reports/smartarmy-ui-isolation-check.json", JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
if (!ok) process.exit(1);
