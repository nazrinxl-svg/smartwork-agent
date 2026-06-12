import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PORT || 3108);
const ROOT = process.env.SMARTWORK_STATIC_ROOT || "/opt/smartwork-agent/public";
const API_TARGET = process.env.SMARTWORK_API_TARGET || "http://127.0.0.1:3107";

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

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  });
  res.end(body);
}

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-SmartWork-Dry-Run, X-SmartWork-No-Siaga-Input, X-SmartWork-No-Browser-Open, X-SmartWork-No-Real-Save, X-SmartWork-No-Real-Send"
  };
}

async function proxyApi(req, res) {
  const incoming = new URL(req.url || "/", "http://127.0.0.1");
  const target = new URL(incoming.pathname + incoming.search, API_TARGET);

  const headers = { ...req.headers };
  delete headers.host;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body
  });

  const outHeaders = {};
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!["content-encoding", "transfer-encoding", "connection"].includes(lower)) {
      outHeaders[key] = value;
    }
  });

  Object.assign(outHeaders, corsHeaders(req.headers.origin || "*"));

  res.writeHead(upstream.status, outHeaders);
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

function safePath(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/home.html";
  const full = path.resolve(ROOT, "." + pathname);
  const rootResolved = path.resolve(ROOT);
  if (!full.startsWith(rootResolved)) return null;
  return full;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (url.pathname.startsWith("/api/")) {
      if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders(req.headers.origin || "*"));
        return res.end();
      }
      return await proxyApi(req, res);
    }

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
    const fileBody = fs.readFileSync(file);
    res.writeHead(200, {
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    });
    res.end(fileBody);
  } catch (error) {
    send(res, 500, `Static staging error: ${error.message}`);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({
    ok: true,
    service: "smartwork-static-staging",
    mode: "STATIC_AND_SAME_ORIGIN_API_PROXY",
    root: ROOT,
    apiTarget: API_TARGET,
    port: PORT
  }));
});