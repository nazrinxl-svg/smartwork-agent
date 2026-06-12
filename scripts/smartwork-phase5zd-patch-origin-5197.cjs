const fs = require("fs");

const file = "scripts/smartwork-phase5zd-phone-public-like-submit-proof.mjs";
let s = fs.readFileSync(file, "utf8");

function replaceOrFail(from, to, label) {
  if (!s.includes(from)) {
    throw new Error(`Block not found: ${label}`);
  }
  s = s.replace(from, to);
}

replaceOrFail(
  `const appPort = Number(process.env.SMARTWORK_5ZD_PORT || 5207);`,
  `const appPort = Number(process.env.SMARTWORK_5ZD_PORT || 5197);`,
  "default 5ZD port"
);

if (!s.includes(`originStrategy`)) {
  replaceOrFail(
    `serverMode: "INTERNAL_NODE_STATIC_SERVER_NO_SPAWN",`,
    `serverMode: "INTERNAL_NODE_STATIC_SERVER_NO_SPAWN",
  originStrategy: "REUSE_PHASE5ZC_KNOWN_GOOD_LOCAL_ORIGIN_127_0_0_1_5197",`,
    "origin strategy report field"
  );
}

fs.writeFileSync(file, s);

console.log(JSON.stringify({
  ok: true,
  patched: file,
  defaultPort: 5197,
  reason: "Reuse Phase 5ZC known-good browser origin for VPS CORS/proof"
}, null, 2));
