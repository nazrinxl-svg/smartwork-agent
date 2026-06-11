import fs from "fs";

const file = "package.json";
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
pkg.scripts = pkg.scripts || {};
pkg.scripts["brain:smartwork-baseline"] = "node scripts/smartwork-brain-warning-check.mjs";
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n", "utf8");
console.log(JSON.stringify({
  ok: true,
  script: "npm run brain:smartwork-baseline"
}, null, 2));
