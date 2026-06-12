import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 3108);
const ROOT = process.env.SMARTWORK_STATIC_ROOT || "/opt/smartwork-agent/public";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

function safePath(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/home.html";
  const full = path.resolve(ROOT, "." + pathname);
  const rootResolved = path.resolve(ROOT);
  if (!full.startsWith(rootResolved)) return null;
  return full;
}

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  try {
    let file = safePath(req.url || "/");
    if (!file) return send(res, 403, "Forbidden");

    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, "index.html");
    }

    if (!fs.existsSync(file)) {
      file = path.join(ROOT, "index.html");
    }

    if (!fs.existsSync(file)) {
      return send(res, 404, "Not found");
    }

    const ext = path.extname(file);
    const contentType = types[ext] || "application/octet-stream";
    const body = fs.readFileSync(file);
    res.writeHead(200, {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    res.end(body);
  } catch (error) {
    send(res, 500, `Static staging error: ${error.message}`);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({
    ok: true,
    service: "smartwork-static-staging",
    root: ROOT,
    port: PORT
  }));
});