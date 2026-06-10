const fs = require("fs");

const p = "package.json";
const pkg = JSON.parse(fs.readFileSync(p, "utf8"));

pkg.scripts = pkg.scripts || {};
pkg.scripts["smartui:brain"] = "node tools/diagnose/smartui-brain-mobile-audit.mjs";
pkg.scripts["smartui:mobile"] = "node tools/diagnose/smartui-mobile-layout-diagnose.mjs";
pkg.scripts["smartui:progress"] = "node tools/diagnose/smartui-progress-layout-diagnose.mjs";

fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
console.log("PACKAGE_SMARTUI_SCRIPTS_OK");
console.log(JSON.stringify({
  smartuiBrain: pkg.scripts["smartui:brain"],
  smartuiMobile: pkg.scripts["smartui:mobile"],
  smartuiProgress: pkg.scripts["smartui:progress"]
}, null, 2));
