#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const hooksDir = path.join(root, ".git", "hooks");

if (!fs.existsSync(hooksDir)) {
  console.error("No .git/hooks directory found.");
  process.exit(1);
}

const preCommit = `#!/bin/sh
echo ""
echo "=== SmartArmy pre-commit hard gate ==="
npm run smartarmy:gate
`;

const prePush = `#!/bin/sh
echo ""
echo "=== SmartArmy pre-push hard gate ==="
npm run smartarmy:gate
`;

fs.writeFileSync(path.join(hooksDir, "pre-commit"), preCommit);
fs.writeFileSync(path.join(hooksDir, "pre-push"), prePush);

try {
  fs.chmodSync(path.join(hooksDir, "pre-commit"), 0o755);
  fs.chmodSync(path.join(hooksDir, "pre-push"), 0o755);
} catch {}

console.log(JSON.stringify({
  ok: true,
  installed: [
    ".git/hooks/pre-commit",
    ".git/hooks/pre-push"
  ],
  command: "npm run smartarmy:gate"
}, null, 2));
