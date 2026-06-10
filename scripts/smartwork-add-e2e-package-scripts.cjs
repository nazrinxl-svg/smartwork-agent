const fs = require("fs");

const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
p.scripts = p.scripts || {};

p.scripts["smartwork:siaga:e2e"] = "node scripts/smartwork-siaga-e2e-runner.mjs";
p.scripts["smartwork:siaga:e2e:dry"] = "set SMARTWORK_E2E_MODE=DRY_RUN_NO_SAVE&& node scripts/smartwork-siaga-e2e-runner.mjs";
p.scripts["smartwork:siaga:sync"] = "node scripts/smartwork-sync-latest-request.mjs";
p.scripts["smartwork:siaga:verify"] = "node scripts/smartwork-verify-request-range-complete.mjs";
p.scripts["smartwork:siaga:finalize"] = "node scripts/smartwork-finalize-progress.mjs";

fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  ok: true,
  added: [
    "smartwork:siaga:e2e",
    "smartwork:siaga:e2e:dry",
    "smartwork:siaga:sync",
    "smartwork:siaga:verify",
    "smartwork:siaga:finalize"
  ]
}, null, 2));
