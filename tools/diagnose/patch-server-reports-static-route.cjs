const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "app", "smartwork-control-server.mjs");
let src = fs.readFileSync(file, "utf8");

if (src.includes("SMARTWORK_REPORTS_STATIC_ROUTE_PATCH_V1")) {
  console.log("PATCH_ALREADY_EXISTS");
  process.exit(0);
}

const marker = `const __filename = fileURLToPath(import.meta.url);`;
if (!src.includes(marker)) {
  throw new Error("Cannot find __filename marker. Need manual insertion point.");
}

src = src.replace(marker, `${marker}

/**
 * SMARTWORK_REPORTS_STATIC_ROUTE_PATCH_V1
 * Native Node static file serving for generated SmartWork reports.
 * Do not use Express app.get here because this server is not Express.
 */
const REPORTS_ROOT = path.join(ROOT, "reports");

function smartworkSafeJoinReports(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0]);
  const relativePath = decodedPath.replace(/^\\/reports\\//, "");
  const fullPath = path.normalize(path.join(REPORTS_ROOT, relativePath));

  if (!fullPath.startsWith(REPORTS_ROOT)) {
    return null;
  }

  return fullPath;
}

function smartworkContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") return "application/pdf";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".txt") return "text/plain; charset=utf-8";
  if (ext === ".html") return "text/html; charset=utf-8";

  return "application/octet-stream";
}

function tryServeSmartworkReports(req, res) {
  if (!req.url || !req.url.startsWith("/reports/")) return false;

  const filePath = smartworkSafeJoinReports(req.url);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({
      ok: false,
      error: "REPORT_FILE_NOT_FOUND",
      url: req.url
    }));
    return true;
  }

  res.writeHead(200, {
    "Content-Type": smartworkContentType(filePath),
    "Cache-Control": "no-store",
    "X-SmartWork-Static": "reports"
  });

  fs.createReadStream(filePath).pipe(res);
  return true;
}
`);

const serverMarkers = [
  "const server = http.createServer(async (req, res) => {",
  "const server = http.createServer((req, res) => {",
  "http.createServer(async (req, res) => {",
  "http.createServer((req, res) => {"
];

let patched = false;

for (const m of serverMarkers) {
  if (src.includes(m)) {
    src = src.replace(m, `${m}
  if (tryServeSmartworkReports(req, res)) return;`);
    patched = true;
    break;
  }
}

if (!patched) {
  throw new Error("Cannot find native http.createServer request handler marker.");
}

fs.writeFileSync(file, src, "utf8");
console.log("PATCHED_REPORTS_STATIC_ROUTE_OK");
