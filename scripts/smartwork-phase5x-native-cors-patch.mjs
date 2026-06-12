import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repo = process.cwd();
const apiRel = "app/smartwork-production-queue-api.mjs";
const apiFile = path.join(repo, apiRel);
const reportPath = path.join(repo, "docs", "checkpoints", "smartwork-phase5x-native-cors-patch-report.json");

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function insertAfterFirstForInInstall(text, insertion) {
  const installMarker = "export function installSmartWorkProductionQueueApi(app) {";
  const installIndex = text.indexOf(installMarker);
  if (installIndex < 0) throw new Error("installSmartWorkProductionQueueApi marker not found.");

  const afterInstall = text.slice(installIndex);
  const forRegex = /^[ \t]*for \(const dir of Object\.values\(queue\)\) ensureDir\(dir\);[ \t]*(\r?\n)/m;
  const match = forRegex.exec(afterInstall);
  if (!match) throw new Error("Queue ensureDir line inside install function not found.");

  const insertAt = installIndex + match.index + match[0].length;
  return text.slice(0, insertAt) + insertion + text.slice(insertAt);
}

function main() {
  let text = fs.readFileSync(apiFile, "utf8");
  const original = text;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";

  if (text.includes("SMARTWORK_PHASE5X_NATIVE_CORS_START")) {
    throw new Error("Phase 5X native CORS marker already exists. Stop to avoid double patch.");
  }

  const helper = [
    "",
    "/* SMARTWORK_PHASE5X_NATIVE_CORS_START */",
    "function smartworkPhase5xAllowedOrigin(req) {",
    "  const allowedOrigins = String(",
    "    process.env.SMARTWORK_CORS_ORIGINS ||",
    '    "http://127.0.0.1:5197,http://localhost:5197,http://103.152.242.193:3107"',
    "  )",
    "    .split(\",\")",
    "    .map((item) => item.trim())",
    "    .filter(Boolean);",
    "",
    "  const origin = req.headers?.origin || \"\";",
    "  if (allowedOrigins.includes(\"*\")) return \"*\";",
    "  if (origin && allowedOrigins.includes(origin)) return origin;",
    "  return allowedOrigins[0] || \"*\";",
    "}",
    "",
    "function smartworkPhase5xApplyCors(req, res) {",
    "  res.setHeader(\"Access-Control-Allow-Origin\", smartworkPhase5xAllowedOrigin(req));",
    "  res.setHeader(\"Vary\", \"Origin\");",
    "  res.setHeader(\"Access-Control-Allow-Methods\", \"GET,POST,OPTIONS\");",
    "  res.setHeader(",
    "    \"Access-Control-Allow-Headers\",",
    "    \"Content-Type, X-SmartWork-Dry-Run, X-SmartWork-No-Siaga-Input, X-SmartWork-No-Browser-Open, X-SmartWork-No-Real-Save, X-SmartWork-No-Real-Send\"",
    "  );",
    "  res.setHeader(\"Access-Control-Max-Age\", \"86400\");",
    "  res.setHeader(\"Cache-Control\", \"no-store\");",
    "}",
    "",
    "function smartworkPhase5xHandleOptions(req, res) {",
    "  if (String(req.method || \"\").toUpperCase() !== \"OPTIONS\") return false;",
    "  res.statusCode = 204;",
    "  res.end();",
    "  return true;",
    "}",
    "/* SMARTWORK_PHASE5X_NATIVE_CORS_END */",
    ""
  ].join(eol);

  const installMarker = "export function installSmartWorkProductionQueueApi(app) {";
  if (!text.includes(installMarker)) throw new Error("Cannot find install function marker.");
  text = text.replace(installMarker, helper + eol + installMarker);

  const expressMiddleware = [
    "",
    "  app.use(\"/api/smartwork/jobs\", (req, res, next) => {",
    "    smartworkPhase5xApplyCors(req, res);",
    "    if (smartworkPhase5xHandleOptions(req, res)) return;",
    "    next();",
    "  });",
    ""
  ].join(eol);

  text = insertAfterFirstForInInstall(text, expressMiddleware);

  const nativeRegex = /  if \(!pathname\.startsWith\("\/api\/smartwork\/jobs"\)\) return false;\r?\n\r?\n  Promise\.resolve\(\)\.then\(async \(\) => \{/;
  if (!nativeRegex.test(text)) {
    throw new Error("Native handler insertion point not found.");
  }

  const nativePatch = [
    '  if (!pathname.startsWith("/api/smartwork/jobs")) return false;',
    "",
    "  smartworkPhase5xApplyCors(req, res);",
    "  if (smartworkPhase5xHandleOptions(req, res)) return true;",
    "",
    "  Promise.resolve().then(async () => {"
  ].join(eol);

  text = text.replace(nativeRegex, nativePatch);

  fs.writeFileSync(apiFile, text);

  const syntax = spawnSync(process.execPath, ["--check", apiFile], { encoding: "utf8" });

  const report = {
    ok: syntax.status === 0,
    phase: "5X",
    mode: "ROBUST_EXACT_NATIVE_AND_EXPRESS_CORS_PATCH_ONE_API_FILE",
    selectedApiFile: apiRel,
    changedFiles: [apiRel],
    checks: {
      syntaxOk: syntax.status === 0,
      hasCorsHeader: text.includes("Access-Control-Allow-Origin"),
      hasOptionsHandler: text.includes("smartworkPhase5xHandleOptions"),
      nativeHandlerPatched: text.includes("if (smartworkPhase5xHandleOptions(req, res)) return true;"),
      expressInstallerPatched: text.includes('app.use("/api/smartwork/jobs"'),
      phaseMarker: text.includes("SMARTWORK_PHASE5X_NATIVE_CORS_START"),
      onlyApiFilePatchedByScript: true
    },
    stderr: syntax.stderr,
    safety: {
      dryRunOnly: true,
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true
    },
    next: "Commit local patch, push, deploy/pull on VPS, restart API daemon, then direct browser proof without proxy.",
    createdAt: new Date().toISOString()
  };

  writeJson(reportPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    selectedApiFile: apiRel,
    changedFiles: report.changedFiles,
    checks: report.checks,
    reportPath: "docs/checkpoints/smartwork-phase5x-native-cors-patch-report.json"
  }, null, 2));

  if (!report.ok) {
    fs.writeFileSync(apiFile, original);
    process.exit(2);
  }
}

main();
