import http from "http";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = process.cwd();

const PORT = Number(process.env.SMARTWORK_APP_PORT || 3107);

const jobs = new Map();

const actions = {
  brain: {
    label: "Brain",
    command: "npm",
    args: ["run", "brain"],
    destructive: false
  },
  doctor: {
    label: "Doctor",
    command: "npm",
    args: ["run", "doctor"],
    destructive: false
  },
  "open-siaga": {
    label: "Open SIAGA Browser",
    command: "npm",
    args: ["run", "open:siaga"],
    destructive: false
  },
  "siaga-stable": {
    label: "SIAGA Stable No Save",
    command: "npm",
    args: ["run", "siaga:stable"],
    destructive: false
  },
  "siaga-save": {
    label: "SIAGA Save",
    command: "npm",
    args: ["run", "siaga:save"],
    destructive: true
  },
  "siaga-open-input-juni": {
    label: "Open Input Juni 2026",
    command: "node",
    args: ["scripts/smartwork-siaga-open-input-juni-2026-only.mjs"],
    destructive: false
  },
  "siaga-fill-week1-rabu-libur": {
    label: "Fill Week 1 Rabu Libur",
    command: "node",
    args: ["scripts/smartwork-siaga-fill-week1-juni-2026-rabu-libur.mjs"],
    destructive: true
  },
  "siaga-dry-run-delete-juni": {
    label: "Dry Run Delete Juni",
    command: "node",
    args: ["scripts/smartwork-siaga-dry-run-delete-juni-2026.mjs"],
    destructive: false
  },
  "siaga-delete-continue-juni": {
    label: "Continue Delete Juni",
    command: "node",
    args: ["scripts/smartwork-siaga-delete-continue-detail-juni-2026.mjs"],
    destructive: true
  }
};

function json(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function text(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function safeJoin(base, rel) {
  const resolved = path.resolve(base, rel);
  if (!resolved.startsWith(path.resolve(base))) {
    throw new Error("Invalid path");
  }
  return resolved;
}

function listRecent(dir, limit = 25) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];

  return fs.readdirSync(full)
    .map(name => {
      const file = path.join(full, name);
      const st = fs.statSync(file);
      return {
        name,
        path: `/${dir}/${encodeURIComponent(name)}`,
        size: st.size,
        modified: st.mtime.toISOString()
      };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .slice(0, limit);
}

function startJob(actionId) {
  const action = actions[actionId];

  if (!action) {
    throw new Error(`Unknown action: ${actionId}`);
  }

  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const job = {
    id,
    actionId,
    label: action.label,
    command: `${action.command} ${action.args.join(" ")}`,
    status: "running",
    startedAt: new Date().toISOString(),
    endedAt: null,
    exitCode: null,
    output: ""
  };

  jobs.set(id, job);

  const child = spawn(action.command, action.args, {
    cwd: root,
    shell: true,
    env: process.env
  });

  child.stdout.on("data", chunk => {
    job.output += chunk.toString();
  });

  child.stderr.on("data", chunk => {
    job.output += chunk.toString();
  });

  child.on("error", error => {
    job.status = "error";
    job.endedAt = new Date().toISOString();
    job.output += `\nPROCESS_ERROR=${error.message}\n`;
  });

  child.on("close", code => {
    job.status = code === 0 ? "done" : "failed";
    job.exitCode = code;
    job.endedAt = new Date().toISOString();
  });

  return job;
}

function serveStatic(req, res, pathname) {
  if (pathname === "/" || pathname === "/app") {
    const htmlPath = path.join(root, "public", "smartwork-control.html");
    return text(res, 200, fs.readFileSync(htmlPath, "utf8"), "text/html; charset=utf-8");
  }

  if (pathname.startsWith("/shots/")) {
    const name = decodeURIComponent(pathname.replace("/shots/", ""));
    const file = safeJoin(path.join(root, "shots"), name);
    if (!fs.existsSync(file)) return text(res, 404, "Not found");
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
    return fs.createReadStream(file).pipe(res);
  }

  if (pathname.startsWith("/reports/")) {
    const name = decodeURIComponent(pathname.replace("/reports/", ""));
    const file = safeJoin(path.join(root, "reports"), name);
    if (!fs.existsSync(file)) return text(res, 404, "Not found");
    return text(res, 200, fs.readFileSync(file, "utf8"), name.endsWith(".json") ? "application/json; charset=utf-8" : "text/plain; charset=utf-8");
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname === "/api/actions") {
      return json(res, 200, {
        ok: true,
        actions: Object.fromEntries(
          Object.entries(actions).map(([id, a]) => [
            id,
            {
              label: a.label,
              command: `${a.command} ${a.args.join(" ")}`,
              destructive: a.destructive
            }
          ])
        )
      });
    }

    if (pathname === "/api/run") {
      if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

      let body = "";
      req.on("data", chunk => body += chunk.toString());
      req.on("end", () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const actionId = String(payload.actionId || "");

          const action = actions[actionId];
          if (!action) return json(res, 400, { ok: false, error: "Unknown action" });

          if (action.destructive && payload.confirm !== true) {
            return json(res, 400, {
              ok: false,
              error: "Confirmation required for destructive action"
            });
          }

          const job = startJob(actionId);
          return json(res, 200, { ok: true, job });
        } catch (error) {
          return json(res, 500, { ok: false, error: error.message });
        }
      });
      return;
    }

    if (pathname === "/api/jobs") {
      const data = Array.from(jobs.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      return json(res, 200, { ok: true, jobs: data });
    }

    if (pathname.startsWith("/api/jobs/")) {
      const id = pathname.split("/").pop();
      const job = jobs.get(id);
      if (!job) return json(res, 404, { ok: false, error: "Job not found" });
      return json(res, 200, { ok: true, job });
    }

    if (pathname === "/api/files") {
      return json(res, 200, {
        ok: true,
        reports: listRecent("reports", 30),
        shots: listRecent("shots", 30)
      });
    }

    const staticResult = serveStatic(req, res, pathname);
    if (staticResult !== false) return;

    return text(res, 404, "Not found");
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, () => {
  console.log("SMARTWORK_CONTROL_PANEL=OK");
  console.log(`URL=http://localhost:${PORT}`);
  console.log("RULE=LOCAL_ONLY_NO_AUTO_SIAGA_ACTION");
});
