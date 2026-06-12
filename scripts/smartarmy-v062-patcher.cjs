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
function readSmartDevAutoInternalReport(startedAtMs = 0, outputText = "") {
  const explicit = String(outputText || "").match(/Report JSON:\\s*(reports[\\\\/][^\\s]+\\.json)/i);
  if (explicit) {
    const explicitPath = explicit[1].replace(/\\\\/g, "/");
    const parsed = readJson(explicitPath, null);
    if (parsed && typeof parsed.ok === "boolean") {
      return {
        ok: parsed.ok,
        source: explicitPath,
        runId: parsed.runId || "",
        failed: parsed.failed || [],
        strategy: "explicit-output-report-json"
      };
    }
  }

  const reportsDir = path.join(root, "reports");
  if (fs.existsSync(reportsDir)) {
    const latestCurrent = fs.readdirSync(reportsDir)
      .filter(name => /^smartdev-auto-.*\\.json$/.test(name))
      .map(name => {
        const full = path.join(reportsDir, name);
        const stat = fs.statSync(full);
        return { name, full, mtime: stat.mtimeMs };
      })
      .filter(x => x.mtime >= startedAtMs - 1500)
      .sort((a, b) => b.mtime - a.mtime)[0];

    if (latestCurrent) {
      try {
        const parsed = JSON.parse(fs.readFileSync(latestCurrent.full, "utf8").replace(/^\\uFEFF/, ""));
        if (typeof parsed.ok === "boolean") {
          return {
            ok: parsed.ok,
            source: "reports/" + latestCurrent.name,
            runId: parsed.runId || "",
            failed: parsed.failed || [],
            strategy: "latest-current-mtime-report-json"
          };
        }
      } catch {}
    }
  }

  const directPath = path.join(root, "reports", "smartdev-auto-last.json");
  if (fs.existsSync(directPath)) {
    const stat = fs.statSync(directPath);
    if (stat.mtimeMs >= startedAtMs - 1500) {
      const direct = readJson("reports/smartdev-auto-last.json", null);
      if (direct && typeof direct.ok === "boolean") {
        return {
          ok: direct.ok,
          source: "reports/smartdev-auto-last.json",
          runId: direct.runId || "",
          failed: direct.failed || [],
          strategy: "fresh-last-json"
        };
      }
    }
  }

  return null;
}
`;

src = src.replace(/function readSmartDevAutoInternalReport\(\)[\s\S]*?\n}\n\nfunction runSmartDevAuto/, helper.trim() + "\n\nfunction runSmartDevAuto");

const replacement = `
function runSmartDevAuto(mode, task) {
  const devMode = smartdevMode(mode);
  const pkg = readJson("package.json", {});
  const hasSmartDevAuto = !!pkg.scripts?.["smartdev:auto"];

  if (!hasSmartDevAuto) {
    return { skipped: true, ok: true, reason: "package script smartdev:auto not found" };
  }

  const startedAtMs = Date.now();
  const processResult = sh(\`npm run smartdev:auto -- \${devMode} "\${task.replace(/"/g, "'")}"\`, 240000);
  const combinedText = \`\${processResult.output || ""}\\n\${processResult.error || ""}\`;
  const internal = readSmartDevAutoInternalReport(startedAtMs, combinedText);

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
    internalReportStrategy: internal?.strategy || null,
    internalRunId: internal?.runId || null,
    internalFailed: internal?.failed || []
  };
}
`;

src = replaceFunction(src, "runSmartDevAuto", replacement);

write(file, src);

console.log("PATCHED scripts/smartarmy-auto-loop.mjs current SmartDev report selection");