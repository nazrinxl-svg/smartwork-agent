const fs = require("fs");
const path = require("path");

const root = process.cwd();
const file = path.join(root, "scripts", "smartarmy-auto-loop.mjs");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function write(filePath, text) {
  fs.writeFileSync(filePath, text, "utf8");
}

function replaceFunction(src, functionName, replacement) {
  const needle = `function ${functionName}(`;
  const start = src.indexOf(needle);
  if (start < 0) throw new Error(`Function not found: ${functionName}`);

  const open = src.indexOf("{", start);
  if (open < 0) throw new Error(`Opening brace not found: ${functionName}`);

  let depth = 0;
  let quote = null;
  let escape = false;

  for (let i = open; i < src.length; i++) {
    const ch = src[i];

    if (quote) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return src.slice(0, start) + replacement.trim() + "\n\n" + src.slice(i + 1);
      }
    }
  }

  throw new Error(`Closing brace not found: ${functionName}`);
}

let src = read(file);

const helper = `
function readSmartDevAutoInternalReport() {
  const direct = readJson("reports/smartdev-auto-last.json", null);
  if (direct && typeof direct.ok === "boolean") {
    return {
      ok: direct.ok,
      source: "reports/smartdev-auto-last.json",
      runId: direct.runId || "",
      failed: direct.failed || []
    };
  }

  const reportsDir = path.join(root, "reports");
  if (!fs.existsSync(reportsDir)) return null;

  const latest = fs.readdirSync(reportsDir)
    .filter(name => /^smartdev-auto-.*\\.json$/.test(name))
    .map(name => {
      const full = path.join(reportsDir, name);
      const stat = fs.statSync(full);
      return { name, full, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)[0];

  if (!latest) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(latest.full, "utf8").replace(/^\\uFEFF/, ""));
    if (typeof parsed.ok === "boolean") {
      return {
        ok: parsed.ok,
        source: "reports/" + latest.name,
        runId: parsed.runId || "",
        failed: parsed.failed || []
      };
    }
  } catch {}

  return null;
}
`;

if (!src.includes("function readSmartDevAutoInternalReport")) {
  const marker = "function runSmartDevAuto";
  const idx = src.indexOf(marker);
  if (idx < 0) throw new Error("runSmartDevAuto marker not found");
  src = src.slice(0, idx) + helper + "\n" + src.slice(idx);
}

const replacement = `
function runSmartDevAuto(mode, task) {
  const devMode = smartdevMode(mode);
  const pkg = readJson("package.json", {});
  const hasSmartDevAuto = !!pkg.scripts?.["smartdev:auto"];

  if (!hasSmartDevAuto) {
    return { skipped: true, ok: true, reason: "package script smartdev:auto not found" };
  }

  const processResult = sh(\`npm run smartdev:auto -- \${devMode} "\${task.replace(/"/g, "'")}"\`, 240000);
  const internal = readSmartDevAutoInternalReport();
  const combinedText = \`\${processResult.output || ""}\\n\${processResult.error || ""}\`;

  let internalOk = processResult.ok;

  if (internal && typeof internal.ok === "boolean") {
    internalOk = internal.ok;
  } else if (/OK:\\s*false/i.test(combinedText) || /FAILED:/i.test(combinedText)) {
    internalOk = false;
  } else if (/OK:\\s*true/i.test(combinedText)) {
    internalOk = true;
  }

  return {
    ...processResult,
    processOk: processResult.ok,
    ok: internalOk,
    internalReportSource: internal?.source || null,
    internalRunId: internal?.runId || null,
    internalFailed: internal?.failed || []
  };
}
`;

src = replaceFunction(src, "runSmartDevAuto", replacement);

write(file, src);

console.log("PATCHED scripts/smartarmy-auto-loop.mjs internal SmartDev OK parsing");