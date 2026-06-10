const fs = require("fs");
const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
p.scripts = p.scripts || {};
p.scripts["smartwork:server:e2e:status"] = "node -e \"fetch('http://localhost:3107/api/smartwork/siaga/e2e/status').then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2))).catch(e=>{console.error(e);process.exit(1)})\"";
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n", "utf8");
console.log("PACKAGE_SCRIPT_ADDED=smartwork:server:e2e:status");
