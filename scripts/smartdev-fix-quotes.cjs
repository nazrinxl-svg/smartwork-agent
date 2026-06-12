const fs = require("fs");
const path = require("path");

const root = process.cwd();
const p = path.join(root, "scripts", "smartdev-team-agent.mjs");

if (fs.existsSync(p)) {
  let s = fs.readFileSync(p, "utf8");

  s = s
    .replace(/\u201Cmau\?\u201D/g, "'mau?'")
    .replace(/tanpa bertanya \u201Cmau\?\u201D/g, "tanpa bertanya 'mau?'")
    .replace(/tanpa bertanya \u00E2\u20AC\u0153mau\?\u00E2\u20AC\uFFFD/g, "tanpa bertanya 'mau?'")
    .replace(/tanpa bertanya .?mau\?.?/g, "tanpa bertanya 'mau?'");

  fs.writeFileSync(p, s, "utf8");
  console.log("smartdev-team-agent.mjs quote fix OK");
} else {
  console.log("smartdev-team-agent.mjs not found, skip quote fix");
}