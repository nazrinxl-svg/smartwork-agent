#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const argv = process.argv.slice(2);
const args = new Set(argv);

const mode =
  args.has("--mode=gate") || args.has("gate")
    ? "gate"
    : "audit";

const scopeArg = argv.find(a => a.startsWith("--scope="));
const scope = scopeArg ? scopeArg.split("=")[1] : (mode === "gate" ? "staged" : "worktree");

function git(cmdArgs) {
  try {
    return execFileSync("git", cmdArgs, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    return "";
  }
}

function norm(p) {
  return String(p || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return "";
  }
}

function writeJson(rel, data) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2));
}

function unique(list) {
  return [...new Set(list.filter(Boolean).map(norm))].sort();
}

function changedByScope() {
  if (scope === "staged") {
    return git(["diff", "--cached", "--name-only"]).split(/\r?\n/).filter(Boolean);
  }

  const diffTracked = git(["diff", "--name-only", "HEAD"]).split(/\r?\n/).filter(Boolean);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/).filter(Boolean);
  return [...diffTracked, ...untracked];
}

const changedFiles = unique(changedByScope());

const forbiddenPatterns = [
  /(^|\/)\.secrets(\/|$)/i,
  /(^|\/)release-local(\/|$)/i,
  /(^|\/)release(\/|$)/i,
  /(^|\/)play-console(\/|$)/i,
  /\.(jks|keystore|aab|apks|p12|pem)$/i,
  /keystore/i
];

const protectedPatterns = [
  /^public\/.*\.html$/i,
  /^public\/.*\.css$/i,
  /^public\/.*\.js$/i,
  /^public\/manifest\.json$/i,
  /^public\/manifest\.webmanifest$/i,
  /^public\/site\.webmanifest$/i,
  /^public\/icons\//i,
  /^public\/assets\//i,
  /^public\/smartwork-logo\.png$/i,
  /^android\/.*\/app\/src\/main\/AndroidManifest\.xml$/i,
  /^android\/.*\/app\/src\/main\/res\/mipmap.*\//i,
  /^android\/.*\/app\/src\/main\/res\/drawable.*\/.*launcher/i,
  /^android\/.*\/app\/src\/main\/res\/values\/.*launcher.*\.xml$/i
];

const globalPatchFiles = [
  "public/smartwork-5zu-a-mobile-fast.css",
  "public/smartwork-5zu-a-mobile-fast.js"
];

const forbiddenChanged = changedFiles.filter(file => forbiddenPatterns.some(re => re.test(file)));
const protectedChanged = changedFiles.filter(file => protectedPatterns.some(re => re.test(file)));
const globalPatchFilesPresent = globalPatchFiles.filter(exists);

const htmlFiles = git(["ls-files", "public/*.html"]).split(/\r?\n/).filter(Boolean).map(norm);
const htmlInjectionFindings = [];

for (const file of htmlFiles) {
  const text = read(file);
  for (const pattern of [
    "smartwork-5zu-a-mobile-fast.css",
    "smartwork-5zu-a-mobile-fast.js",
    "data-phase5zu-hidden-login-link"
  ]) {
    if (text.includes(pattern)) {
      htmlInjectionFindings.push({ file, pattern });
    }
  }
}

const approvalPath = "reports/approvals/smartarmy-ui-change-approval.json";
let approval = null;
let approvalValid = false;
let uncoveredProtectedChanges = protectedChanged;

if (exists(approvalPath)) {
  try {
    approval = JSON.parse(read(approvalPath));
    const allowedFiles = Array.isArray(approval.allowedFiles) ? approval.allowedFiles.map(norm) : [];
    const allowGlobs = Array.isArray(approval.allowedGlobs) ? approval.allowedGlobs.map(norm) : [];

    function allowedByApproval(file) {
      if (allowedFiles.includes(file)) return true;

      return allowGlobs.some(glob => {
        const escaped = glob
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/\*\*/g, "___DOUBLE_STAR___")
          .replace(/\*/g, "[^/]*")
          .replace(/___DOUBLE_STAR___/g, ".*");

        return new RegExp(`^${escaped}$`).test(file);
      });
    }

    uncoveredProtectedChanges = protectedChanged.filter(file => !allowedByApproval(file));

    approvalValid =
      approval.approved === true &&
      typeof approval.phase === "string" &&
      approval.phase.length > 0 &&
      (Array.isArray(approval.allowedFiles) || Array.isArray(approval.allowedGlobs));
  } catch {
    approvalValid = false;
  }
}

const violations = [];

if (forbiddenChanged.length > 0) {
  violations.push({
    code: "FORBIDDEN_RELEASE_OR_SECRET_CHANGE",
    message: "Keystore/AAB/release/secret path changed. Blocked.",
    files: forbiddenChanged
  });
}

if (globalPatchFilesPresent.length > 0) {
  violations.push({
    code: "GLOBAL_UI_PATCH_FILE_PRESENT",
    message: "Global CSS/JS patch file found. Blocked because it can change good UI broadly.",
    files: globalPatchFilesPresent
  });
}

if (htmlInjectionFindings.length > 0) {
  violations.push({
    code: "GLOBAL_UI_INJECTION_IN_HTML",
    message: "HTML contains phase5zu global injection. Blocked.",
    findings: htmlInjectionFindings
  });
}

if (protectedChanged.length > 0 && (!approvalValid || uncoveredProtectedChanges.length > 0)) {
  violations.push({
    code: "PROTECTED_UI_OR_LOGO_CHANGE_WITHOUT_SMARTARMY_APPROVAL",
    message: "Protected UI/logo/launcher files changed without SmartArmy approval.",
    protectedChanged,
    approvalPath,
    approvalValid,
    uncoveredProtectedChanges
  });
}

const report = {
  ok: violations.length === 0,
  mode,
  scope,
  gateName: "SmartArmy Hard Gate",
  phase: "SMARTARMY-GATE",
  branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
  head: git(["rev-parse", "--short", "HEAD"]),
  changedFiles,
  protectedChanged,
  forbiddenChanged,
  globalPatchFilesPresent,
  htmlInjectionFindings,
  approvalPath,
  approvalPresent: exists(approvalPath),
  approvalValid,
  uncoveredProtectedChanges,
  violations,
  safety: {
    keystoreTouchedAllowed: false,
    aabRebuildAllowedWithoutGate: false,
    playStoreUploadAllowed: false,
    globalUiPatchAllowed: false
  },
  timestamp: new Date().toISOString()
};

writeJson("reports/smartarmy-gate/smartarmy-hard-gate-latest.json", report);
console.log(JSON.stringify(report, null, 2));

if (mode === "gate" && !report.ok) {
  console.error("\nSMARTARMY HARD GATE BLOCKED THIS CHANGE.");
  process.exit(1);
}
