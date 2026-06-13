import fs from "node:fs";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";

const mode = process.argv.includes("--lock") ? "lock" : "check";
const policyPath = "configs/smartwork-ui-hard-lock-policy.json";
const baselinePath = "configs/smartwork-ui-hard-lock-baseline.json";
const reportPath = "docs/checkpoints/smartwork-ui-hard-lock-guard-last.json";

function readJson(path) {
  const raw = fs.readFileSync(path, "utf8");
  const text = raw.replace(/^\uFEFF/, "").trim();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON ${path}: ${err.message}`);
  }
}

function writeJson(path, data) {
  fs.mkdirSync(requireDir(path), { recursive: true });
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function requireDir(path) {
  return path.replace(/[\\/][^\\/]+$/, "") || ".";
}

function exists(path) {
  return fs.existsSync(path);
}

function sha256(path) {
  return crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);

  if (process.platform === "win32" && (cmd === "npm" || cmd === "npx")) {
    execFileSync("cmd.exe", ["/d", "/s", "/c", `${cmd} ${args.join(" ")}`], {
      stdio: "inherit"
    });
    return;
  }

  execFileSync(cmd, args, {
    stdio: "inherit"
  });
}

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

async function ensureServer() {
  try {
    const res = await fetch("http://127.0.0.1:4179/home.html");
    if (res.ok) return null;
  } catch {}

  console.log("\nSTART local static server for UI geometry guard...");
  const child = process.platform === "win32"
    ? spawn("cmd.exe", ["/d", "/s", "/c", "npx http-server public -p 4179 -c-1"], {
        stdio: "ignore",
        detached: false,
      })
    : spawn("npx", ["http-server", "public", "-p", "4179", "-c-1"], {
        stdio: "ignore",
        detached: false,
      });

  const ok = await waitForServer("http://127.0.0.1:4179/home.html", 10000);
  if (!ok) {
    try { child.kill(); } catch {}
    throw new Error("Local static server gagal start di port 4179.");
  }

  return child;
}

function validateProtectedFiles(policy, failures) {
  for (const file of policy.protectedFiles || []) {
    if (!exists(file)) failures.push(`Protected file missing: ${file}`);
  }
}

function validateBottomNavMarkers(policy, failures) {
  const requiredLabels = policy?.protectedRules?.requiredNavLabels || [
    "Home",
    "Request",
    "Progress",
    "Riwayat",
    "Profil"
  ];

  for (const file of policy.bottomNavPages || []) {
    if (!exists(file)) {
      failures.push(`${file}: missing`);
      continue;
    }

    const text = fs.readFileSync(file, "utf8");

    if (!text.includes("SMARTWORK_BOTTOM_NAV_EDGE_LOCK_START")) {
      failures.push(`${file}: missing SMARTWORK_BOTTOM_NAV_EDGE_LOCK marker`);
    }

    for (const label of requiredLabels) {
      if (!text.includes(`<span>${label}</span>`) && !text.includes(`>${label}<`)) {
        failures.push(`${file}: missing nav label ${label}`);
      }
    }
  }
}

function createBaseline(policy) {
  const files = {};

  for (const file of policy.protectedFiles || []) {
    if (!exists(file)) continue;

    files[file] = {
      sha256: sha256(file),
      bytes: fs.statSync(file).size
    };
  }

  return {
    mode: "SMARTWORK_UI_HARD_LOCK_BASELINE",
    lockedAt: new Date().toISOString(),
    rule: "Exact hash baseline. No login text guessing. Any protected UI change must be explicit, verified, then re-locked.",
    protectedFiles: policy.protectedFiles || [],
    files
  };
}

async function main() {
  const failures = [];
  const warnings = [];

  if (!exists(policyPath)) {
    throw new Error(`Policy belum ada: ${policyPath}`);
  }

  const policy = readJson(policyPath);

  validateProtectedFiles(policy, failures);
  validateBottomNavMarkers(policy, failures);

  if (mode === "lock") {
    if (failures.length) {
      throw new Error("Tidak bisa lock baseline karena rule gagal:\n" + failures.join("\n"));
    }

    const baseline = createBaseline(policy);
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n", "utf8");

    const report = {
      ok: true,
      generatedAt: new Date().toISOString(),
      mode: "SMARTWORK_UI_HARD_LOCK_BASELINE_CREATED",
      baselinePath,
      lockedFiles: Object.keys(baseline.files),
      warnings
    };

    fs.mkdirSync("docs/checkpoints", { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

    console.log(JSON.stringify(report, null, 2));
    console.log("\nSMARTWORK_UI_HARD_LOCK_BASELINE=OK");
    return;
  }

  if (!exists(baselinePath)) {
    failures.push(`Baseline belum ada: jalankan npm run smartwork:ui-lock`);
  } else {
    const baseline = readJson(baselinePath);

    for (const [file, locked] of Object.entries(baseline.files || {})) {
      if (!exists(file)) {
        failures.push(`${file}: missing after baseline`);
        continue;
      }

      const current = sha256(file);
      if (current !== locked.sha256) {
        failures.push(`${file}: HASH_CHANGED from locked UI baseline`);
      }
    }
  }

  let serverProcess = null;

  try {
    serverProcess = await ensureServer();

    if (exists("scripts/smartwork-bottom-nav-edge-lock-verify.mjs")) {
      run("node", ["scripts/smartwork-bottom-nav-edge-lock-verify.mjs"]);
    } else {
      failures.push("Missing bottom nav geometry verifier script");
    }

    run("npm", ["run", "smartarmy:ui-check"]);
    run("npm", ["run", "brain:smartwork-guard"]);
    run("npm", ["run", "doctor"]);
  } catch (err) {
    failures.push(String(err?.message || err));
  } finally {
    if (serverProcess) {
      try { serverProcess.kill(); } catch {}
    }
  }

  const report = {
    ok: failures.length === 0,
    generatedAt: new Date().toISOString(),
    mode: "SMARTWORK_UI_HARD_LOCK_GUARD",
    safety: {
      noLoginGuessing: true,
      exactHashBaseline: true,
      noGitAddDot: true,
      noCommitIfProtectedUiChanged: true,
      noLoginChangeWithoutUnlock: true,
      noBottomNavChangeWithoutUnlock: true,
      noRoutingChangeWithoutUnlock: true,
      noManifestChangeWithoutUnlock: true,
      noApiBridgeChangeWithoutUnlock: true,
      noSiagaInput: true,
      noRealSaveSendDelete: true
    },
    failures,
    warnings
  };

  fs.mkdirSync("docs/checkpoints", { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log("\n=== UI HARD LOCK REPORT ===");
  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) {
    console.error("\nSMARTWORK_UI_HARD_LOCK_GUARD=FAILED");
    process.exit(1);
  }

  console.log("\nSMARTWORK_UI_HARD_LOCK_GUARD=OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


