import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawnSync } from "node:child_process";
import { URL } from "node:url";

const root = process.cwd();
const host = "127.0.0.1";
const port = Number(process.env.SMARTARMY_UI_PORT || 8765);

function readText(file, fallback = "") {
  try {
    return fs.readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "");
  } catch {
    return fallback;
  }
}

function readJson(file, fallback = null) {
  try {
    const raw = readText(file, "");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, JSON.stringify(data, null, 2), "utf8");
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": type + "; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(type === "application/json" ? JSON.stringify(body, null, 2) : body);
}

function runNode(args, timeout = 300000) {
  const r = spawnSync("node", args, {
    cwd: root,
    encoding: "utf8",
    timeout,
    shell: false
  });

  return {
    ok: r.status === 0,
    status: r.status,
    signal: r.signal,
    stdout: String(r.stdout || ""),
    stderr: String(r.stderr || "")
  };
}

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", chunk => raw += chunk);
    req.on("end", () => {
      try {
        resolve(raw.trim() ? JSON.parse(raw) : {});
      } catch {
        resolve({ raw });
      }
    });
  });
}

function agents() {
  const reg = readJson("agents/_registry/smartlearn-agent-army.json", { agents: [] });
  return Array.isArray(reg.agents) ? reg.agents : [];
}

function latestStatus() {
  return {
    ok: true,
    at: new Date().toISOString(),
    repo: {
      branch: spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8" }).stdout?.trim(),
      commit: spawnSync("git", ["log", "-1", "--oneline"], { cwd: root, encoding: "utf8" }).stdout?.trim()
    },
    latestArmy: readJson("reports/smartarmy-auto-last.json", null),
    latestSmartDev: readJson("reports/smartdev-auto-last.json", null),
    safety: {
      autoPatch: false,
      realSaveSendDelete: false,
      localOnly: true,
      host
    }
  };
}

function html() {
  return readText("tools/smartarmy-ui/smartarmy-ui.html", "<h1>SmartLearn Army UI missing</h1>");
}

async function route(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, { ok: true });

  const url = new URL(req.url, `http://${host}:${port}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/ui")) {
    return send(res, 200, html(), "text/html");
  }

  if (req.method === "GET" && url.pathname === "/api/army/health") {
    return send(res, 200, {
      ok: true,
      service: "smartarmy-ui-server",
      version: "0.7.0",
      host,
      port,
      safety: {
        localOnly: true,
        noRealSaveSendDelete: true,
        noBrowserAutomation: true
      }
    });
  }

  if (req.method === "GET" && url.pathname === "/api/army/status") {
    return send(res, 200, latestStatus());
  }

  if (req.method === "GET" && url.pathname === "/api/army/agents") {
    const list = agents().map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      version: a.version,
      mission: a.mission,
      capabilities: a.capabilities || [],
      guards: a.guards || []
    }));
    return send(res, 200, { ok: true, count: list.length, agents: list });
  }

  if (req.method === "GET" && url.pathname === "/api/army/latest") {
    return send(res, 200, {
      ok: true,
      armyJson: readJson("reports/smartarmy-auto-last.json", null),
      armyMd: readText("reports/smartarmy-auto-last.md", ""),
      smartdevJson: readJson("reports/smartdev-auto-last.json", null),
      smartdevMd: readText("reports/smartdev-auto-last.md", "")
    });
  }

  if (req.method === "POST" && url.pathname === "/api/army/run") {
    const body = await parseBody(req);
    const mode = String(body.mode || "auto");
    const task = String(body.task || "").trim();
    const agent = String(body.agent || "").trim();
    const clip = body.clip !== false;

    if (!task) return send(res, 400, { ok: false, error: "Task kosong." });

    const args = ["scripts/smartarmy-auto-loop.mjs", mode, task];
    if (agent) args.push("--agent", agent);
    if (clip) args.push("--clip");

    const startedAt = new Date().toISOString();
    const result = runNode(args);

    const report = {
      ok: result.ok && (readJson("reports/smartarmy-auto-last.json", {})?.ok !== false),
      startedAt,
      endedAt: new Date().toISOString(),
      mode,
      task,
      agent,
      process: result,
      latest: readJson("reports/smartarmy-auto-last.json", null),
      safety: {
        autoPatch: false,
        realSaveSendDelete: false,
        localOnly: true
      }
    };

    writeJson("reports/smartarmy-ui-last-run.json", report);
    return send(res, report.ok ? 200 : 500, report);
  }

  if (req.method === "POST" && url.pathname === "/api/army/doctor") {
    const task = "SmartArmy UI server doctor safe checks only.";
    const result = runNode(["scripts/smartarmy-auto-loop.mjs", "doctor", task]);
    const report = {
      ok: result.ok && (readJson("reports/smartarmy-auto-last.json", {})?.ok !== false),
      at: new Date().toISOString(),
      process: result,
      latest: readJson("reports/smartarmy-auto-last.json", null)
    };
    writeJson("reports/smartarmy-ui-doctor-last.json", report);
    return send(res, report.ok ? 200 : 500, report);
  }

  return send(res, 404, { ok: false, error: "Not found", path: url.pathname });
}

const server = http.createServer((req, res) => {
  route(req, res).catch(err => send(res, 500, { ok: false, error: err.message }));
});

server.listen(port, host, () => {
  console.log(`SMARTARMY_UI_SERVER=OK http://${host}:${port}`);
  console.log("Open: http://127.0.0.1:8765/ui");
});
