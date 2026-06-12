import fs from "node:fs";

const file = "package.json";
const raw = fs.readFileSync(file, "utf8");

const cleaned = raw
  .replace(/^\uFEFF/, "")
  .replace(/^\u0000+/, "")
  .replace(/^[\s\uFEFF\u0000]*(?=\{)/, "");

const report = {
  ok: false,
  rawFirstCharCode: raw.length ? raw.charCodeAt(0) : null,
  cleanedFirstCharCode: cleaned.length ? cleaned.charCodeAt(0) : null,
  rawLength: raw.length,
  cleanedLength: cleaned.length,
  changed: raw !== cleaned
};

try {
  JSON.parse(cleaned);
  report.ok = true;
  if (raw !== cleaned) {
    fs.writeFileSync(file, cleaned, "utf8");
  }
} catch (error) {
  report.error = String(error?.message || error);
}

fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync(
  "reports/smartwork-package-json-sanitize-report.json",
  JSON.stringify(report, null, 2) + "\n",
  "utf8"
);

console.log(JSON.stringify(report, null, 2));

if (!report.ok) process.exit(1);
