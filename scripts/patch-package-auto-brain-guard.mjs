import fs from "fs";

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

const file = "package.json";
if (!fs.existsSync(file)) {
  console.log(JSON.stringify({ ok: false, skipped: true, reason: "package.json missing" }, null, 2));
  process.exit(0);
}

const raw = stripBom(fs.readFileSync(file, "utf8"));
const pkg = JSON.parse(raw);

pkg.scripts = pkg.scripts || {};
pkg.scripts["brain:smartwork-baseline"] = "node scripts/smartwork-brain-warning-check.mjs";
pkg.scripts["brain:smartwork-guard"] = "node scripts/smartwork-auto-brain-guard.mjs --label=manual";
pkg.scripts["brain:smartwork-guard:strict"] = "node scripts/smartwork-auto-brain-guard.mjs --strict --label=manual-strict";

// Wrap key scripts without breaking original commands.
const guard = "node scripts/smartwork-auto-brain-guard.mjs --strict --label=";

function prefixScript(name, label) {
  const current = pkg.scripts[name];
  if (!current) return false;
  if (current.includes("smartwork-auto-brain-guard.mjs")) return false;
  pkg.scripts[name] = `${guard}${label} && ${current}`;
  return true;
}

const wrapped = {
  appArtifacts: prefixScript("app:artifacts", "app-artifacts"),
  pipeline: prefixScript("smartwork:v6:pipeline", "v6-pipeline"),
  brain: prefixScript("brain", "brain")
};

fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n", "utf8");

console.log(JSON.stringify({
  ok: true,
  added: [
    "brain:smartwork-baseline",
    "brain:smartwork-guard",
    "brain:smartwork-guard:strict"
  ],
  wrapped
}, null, 2));
