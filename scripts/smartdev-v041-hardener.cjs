const fs = require("fs");
const path = require("path");

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "");
}

function write(file, text) {
  fs.writeFileSync(path.join(root, file), text, "utf8");
}

function addJsonCleanHelper(src) {
  if (src.includes("function __smartworkJsonClean")) return src;

  const helper = `
function __smartworkJsonClean(value) {
  let text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value ?? "");
  text = text.replace(/^\\uFEFF/, "").replace(/^\\uFFFD+/, "").trimStart();

  const firstJson = text.search(/[\\{\\[]/);
  if (firstJson > 0) text = text.slice(firstJson);

  text = text.replace(/[\\u0000-\\u001F]+$/g, "").trim();

  return text;
}
`;

  const lines = src.split(/\r?\n/);
  let insertAt = 0;

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s/.test(lines[i])) insertAt = i + 1;
  }

  lines.splice(insertAt, 0, helper);
  return lines.join("\n");
}

function replaceJsonParseCalls(src) {
  let out = "";
  let i = 0;
  const needle = "JSON.parse(";

  while (i < src.length) {
    const idx = src.indexOf(needle, i);
    if (idx === -1) {
      out += src.slice(i);
      break;
    }

    out += src.slice(i, idx);

    let j = idx + needle.length;
    let depth = 1;
    let quote = null;
    let escape = false;

    for (; j < src.length; j++) {
      const ch = src[j];

      if (quote) {
        if (escape) {
          escape = false;
        } else if (ch === "\\") {
          escape = true;
        } else if (ch === quote) {
          quote = null;
        }
        continue;
      }

      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }

      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      }
    }

    if (j >= src.length) {
      out += src.slice(idx);
      break;
    }

    const inside = src.slice(idx + needle.length, j);
    const cleanInside = inside.trim();

    if (cleanInside.startsWith("__smartworkJsonClean(")) {
      out += `JSON.parse(${inside})`;
    } else {
      out += `JSON.parse(__smartworkJsonClean(${inside}))`;
    }

    i = j + 1;
  }

  return out;
}

function hardenJsonFile(file) {
  if (!fs.existsSync(path.join(root, file))) {
    console.log(`SKIP missing ${file}`);
    return;
  }

  let src = read(file);
  const before = src;

  src = addJsonCleanHelper(src);
  src = replaceJsonParseCalls(src);

  if (src !== before) {
    write(file, src);
    console.log(`PATCHED JSON parse hardening: ${file}`);
  } else {
    console.log(`UNCHANGED: ${file}`);
  }
}

function patchAutoRunner(file) {
  if (!fs.existsSync(path.join(root, file))) {
    console.log(`SKIP missing ${file}`);
    return;
  }

  let src = read(file);
  const before = src;

  src = src.replace(
    `if (mode === "ui" || q.includes("ui") || q.includes("screenshot")) {`,
    `if (mode === "ui" || q.includes("screenshot")) {`
  );

  if (src !== before) {
    write(file, src);
    console.log(`PATCHED optional shot behavior: ${file}`);
  } else {
    console.log(`UNCHANGED optional shot behavior: ${file}`);
  }
}

hardenJsonFile("scripts/smartwork-phase5e-worker-lifecycle-bridge-check.mjs");
hardenJsonFile("scripts/smartwork-phase5f-app-progress-bridge-check.mjs");
patchAutoRunner("scripts/smartdev-auto-runner.mjs");