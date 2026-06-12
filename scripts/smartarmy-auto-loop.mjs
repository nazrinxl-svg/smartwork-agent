import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const args = process.argv.slice(2);
const registryPath = "agents/_registry/smartlearn-agent-army.json";

function nowId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function readText(file, fallback = "") {
  try {
    return fs.readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "");
  } catch {
    return fallback;
  }
}

function writeText(file, text) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text, "utf8");
}

function readJson(file, fallback) {
  try {
    const raw = readText(file, "");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  writeText(file, JSON.stringify(data, null, 2));
}

function sh(cmd, timeout = 120000) {
  try {
    const out = execSync(cmd, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout
    });
    return { ok: true, cmd, output: String(out || "").trim(), error: "" };
  } catch (err) {
    return {
      ok: false,
      cmd,
      status: err.status ?? null,
      signal: err.signal ?? null,
      output: String(err.stdout || "").trim(),
      error: String(err.stderr || err.message || "").trim()
    };
  }
}

function copyClipboard(text) {
  try {
    const r = spawnSync("clip.exe", [], { input: text, encoding: "utf8" });
    return r.status === 0;
  } catch {
    return false;
  }
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "task";
}

function capify(value) {
  return slugify(value).replace(/-/g, "_");
}

function parse(raw) {
  const out = {
    mode: "auto",
    clip: false,
    file: "",
    agent: "",
    task: []
  };

  const modes = new Set(["auto", "ui", "vps", "bug", "feature", "agent", "delivery", "doctor", "progress"]);

  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    const lower = String(a).toLowerCase();

    if (modes.has(lower)) out.mode = lower;
    else if (a === "--clip" || a === "-c") out.clip = true;
    else if (a === "--file") out.file = raw[++i] || "";
    else if (a === "--agent") out.agent = raw[++i] || "";
    else out.task.push(a);
  }

  return out;
}

function loadRegistry() {
  return readJson(registryPath, {
    name: "SmartLearn Agent Army Registry",
    version: "0.6.0",
    agents: []
  });
}

function saveRegistry(reg) {
  reg.updatedAt = new Date().toISOString();
  writeJson(registryPath, reg);

  for (const agent of reg.agents || []) {
    const dir = `agents/smartlearn-army/${agent.id}`;
    writeJson(`${dir}/agent.json`, agent);
    writeText(`${dir}/README.md`, buildAgentReadme(agent));
  }
}

function buildAgentReadme(agent) {
  return `# ${agent.name}

ID: ${agent.id}
Type: ${agent.type}
Version: ${agent.version}

## Mission
${agent.mission}

## Capabilities
${(agent.capabilities || []).map(x => `- ${x}`).join("\n")}

## Guards
${(agent.guards || []).map(x => `- ${x}`).join("\n")}

## Run
\`\`\`powershell
safarmy run --agent ${agent.id} "tugas agent" --clip
\`\`\`

## Evolve
\`\`\`powershell
safarmy evolve --agent ${agent.id} --capability "kemampuan baru"
\`\`\`
`;
}

function inferMode(task, requestedMode) {
  const q = task.toLowerCase();
  if (requestedMode && requestedMode !== "auto") return requestedMode;
  if (/vps|cloud|server|deploy|pm2|systemd|worker 24|24 jam/.test(q)) return "vps";
  if (/ui|layout|tampilan|css|screenshot|button|card|mobile/.test(q)) return "ui";
  if (/bug|error|gagal|failed|stuck|rusak|root cause/.test(q)) return "bug";
  if (/progress|finalizer|hasil siap|80%|100%/.test(q)) return "progress";
  if (/whatsapp|wa|email|delivery|kirim|preview/.test(q)) return "delivery";
  if (/agent|army|evolve|evolution|kemampuan|buat agent|bikin agent|factory/.test(q)) return "agent";
  if (/fitur|feature|tambah|buat sistem|kembangkan/.test(q)) return "feature";
  return "doctor";
}

function scoreAgent(agent, task, mode) {
  const hay = [
    agent.id,
    agent.name,
    agent.type,
    agent.mission,
    ...(agent.capabilities || [])
  ].join(" ").toLowerCase();

  const q = task.toLowerCase();
  let score = 0;

  for (const word of q.split(/[^a-z0-9]+/).filter(x => x.length >= 4)) {
    if (hay.includes(word)) score += 2;
  }

  if (mode === "agent" && /evolution|builder|forge|factory|agent/.test(hay)) score += 20;
  if (mode === "ui" && /ui|screenshot|webcheck|audit|designer/.test(hay)) score += 20;
  if (mode === "vps" && /deploy|vercel|vps|server/.test(hay)) score += 20;
  if (mode === "bug" && /diagnose|doctor|root|brain/.test(hay)) score += 20;
  if (mode === "progress" && /brain|runner|diagnose|doctor/.test(hay)) score += 12;
  if (mode === "delivery" && /feature|builder|mission|agent/.test(hay)) score += 12;
  if (mode === "feature" && /feature|commander|builder|mission/.test(hay)) score += 20;
  if (mode === "doctor" && /doctor|guard|brain/.test(hay)) score += 20;

  if (agent.id === "army-evolution-agent" && mode === "agent") score += 50;

  return score;
}

function pickAgent(reg, task, mode, forcedAgent) {
  const agents = reg.agents || [];
  if (!agents.length) throw new Error("Registry kosong. Jalankan safarmy import --inject-link dulu.");

  if (forcedAgent) {
    const key = slugify(forcedAgent);
    const found = agents.find(a => a.id === forcedAgent || a.id === key || slugify(a.name) === key);
    if (!found) throw new Error(`Forced agent tidak ditemukan: ${forcedAgent}`);
    return found;
  }

  return [...agents]
    .map(agent => ({ agent, score: scoreAgent(agent, task, mode) }))
    .sort((a, b) => b.score - a.score)[0].agent;
}

function bumpPatch(version) {
  const parts = String(version || "0.1.0").split(".").map(x => Number(x) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;
  return parts.slice(0, 3).join(".");
}

function evolveIfNeeded(reg, agent, task, mode) {
  const q = task.toLowerCase();
  const shouldEvolve = /evolve|evolution|kembangkan|kemampuan|bisa|buat agent|bikin agent|factory|upgrade/.test(q);

  if (!shouldEvolve) {
    return { evolved: false, addedCapability: "" };
  }

  const cap = capify(`${mode} ${task}`).slice(0, 90);
  agent.capabilities = Array.isArray(agent.capabilities) ? agent.capabilities : [];

  if (!agent.capabilities.includes(cap)) {
    agent.capabilities.push(cap);
    agent.version = bumpPatch(agent.version);
    agent.updatedAt = new Date().toISOString();
    agent.evolutionLog = Array.isArray(agent.evolutionLog) ? agent.evolutionLog : [];
    agent.evolutionLog.push({
      at: agent.updatedAt,
      capability: cap,
      note: task,
      mode,
      source: "smartarmy-auto-loop"
    });
    saveRegistry(reg);
    return { evolved: true, addedCapability: cap };
  }

  return { evolved: false, addedCapability: cap };
}

function smartdevMode(mode) {
  if (mode === "vps") return "vps";
  if (mode === "ui") return "ui";
  if (mode === "bug") return "bug";
  if (mode === "progress") return "progress";
  if (mode === "feature" || mode === "delivery" || mode === "agent") return "doctor";
  return "doctor";
}

function generateMission(agent, task, mode, evolution) {
  const branch = sh("git rev-parse --abbrev-ref HEAD").output;
  const commit = sh("git log -1 --oneline").output;
  const status = sh("git status --short").output;
  const latestAuto = readText("reports/smartdev-auto-last.md", "").slice(0, 1800);
  const latestArmy = readText("reports/smartlearn-army-run-last.md", "").slice(0, 1800);

  return `# SMARTLEARN ARMY AUTO EVOLUTION MISSION

Mode: ${mode}
Selected Agent: ${agent.name}
Agent ID: ${agent.id}
Agent Version: ${agent.version}
Evolved This Run: ${evolution.evolved}
Added Capability: ${evolution.addedCapability || "(none)"}

## Task
${task}

## Repo
- Branch: ${branch || "(unknown)"}
- Commit: ${commit || "(unknown)"}

## Git Status
${status || "clean / no changes detected"}

## Mission
${agent.mission}

## Capabilities
${(agent.capabilities || []).map(x => `- ${x}`).join("\n")}

## Guards
${(agent.guards || []).map(x => `- ${x}`).join("\n")}

## Latest SmartDev Auto
${latestAuto || "(none)"}

## Latest Army Run
${latestArmy || "(none)"}

## Execution Contract
1. Jangan mulai dari nol.
2. Gunakan checkpoint terakhir.
3. Diagnosis dulu sebelum patch.
4. No real save/send/delete.
5. Patch kecil dan backup dulu.
6. Verifikasi dengan doctor/check/report/screenshot jika UI.
7. Next step tunggal, tanpa bertanya "mau?".

## Prompt Siap Tempel
BRO, AKTIFKAN SMARTLEARN ARMY AUTO EVOLUTION.

Agent terpilih: ${agent.name} (${agent.id})
Mode: ${mode}

Tugas:
${task}

Kerjakan dengan Agent Army + SmartDev Team. Diagnosis evidence dulu, jangan mulai dari nol, jangan real save/send/delete, jangan ulang input SIAGA tanggal verified/filled. Beri satu blok PowerShell siap tempel, verifikasi, report path, dan next step tunggal.
`;
}


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
    .filter(name => /^smartdev-auto-.*\.json$/.test(name))
    .map(name => {
      const full = path.join(reportsDir, name);
      const stat = fs.statSync(full);
      return { name, full, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)[0];

  if (!latest) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(latest.full, "utf8").replace(/^\uFEFF/, ""));
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

function runSmartDevAuto(mode, task) {
  const devMode = smartdevMode(mode);
  const pkg = readJson("package.json", {});
  const hasSmartDevAuto = !!pkg.scripts?.["smartdev:auto"];

  if (!hasSmartDevAuto) {
    return { skipped: true, ok: true, reason: "package script smartdev:auto not found" };
  }

  const processResult = sh(`npm run smartdev:auto -- ${devMode} "${task.replace(/"/g, "'")}"`, 240000);
  const internal = readSmartDevAutoInternalReport();
  const combinedText = `${processResult.output || ""}\n${processResult.error || ""}`;

  let internalOk = processResult.ok;

  if (internal && typeof internal.ok === "boolean") {
    internalOk = internal.ok;
  } else if (/OK:\s*false/i.test(combinedText) || /FAILED:/i.test(combinedText)) {
    internalOk = false;
  } else if (/OK:\s*true/i.test(combinedText)) {
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



function run(opt) {
  let task = opt.task.join(" ").trim();

  if (opt.file) {
    const full = path.isAbsolute(opt.file) ? opt.file : path.join(root, opt.file);
    task = readText(full, task);
  }

  if (!task) {
    throw new Error("Task kosong. Contoh: armyauto auto \"buat agent WA preview no real send\"");
  }

  const reg = loadRegistry();
  const mode = inferMode(task, opt.mode);
  const agent = pickAgent(reg, task, mode, opt.agent);
  const evolution = evolveIfNeeded(reg, agent, task, mode);
  const runId = `smartarmy-auto-${nowId()}`;

  const mission = generateMission(agent, task, mode, evolution);
  writeText(`reports/${runId}.md`, mission);
  writeText("reports/smartarmy-auto-last.md", mission);

  const smartdev = runSmartDevAuto(mode, task);

  const report = {
    ok: smartdev.skipped ? true : !!smartdev.ok,
    runId,
    at: new Date().toISOString(),
    mode,
    task,
    selectedAgent: {
      id: agent.id,
      name: agent.name,
      version: agent.version
    },
    evolution,
    safety: {
      autoPatch: false,
      realSaveSendDelete: false,
      safeChecksOnly: true
    },
    smartdev,
    outputs: {
      mission: `reports/${runId}.md`,
      latest: "reports/smartarmy-auto-last.md"
    }
  };

  writeJson(`reports/${runId}.json`, report);
  writeJson("reports/smartarmy-auto-last.json", report);

  if (opt.clip) copyClipboard(mission);

  return [
    "SMARTLEARN ARMY AUTO EVOLUTION DONE",
    `OK: ${report.ok}`,
    `Mode: ${mode}`,
    `Agent: ${agent.name} (${agent.id})`,
    `Evolved: ${evolution.evolved}`,
    `Capability: ${evolution.addedCapability || "(none)"}`,
    "",
    "Reports:",
    `- reports/${runId}.json`,
    `- reports/${runId}.md`,
    "- reports/smartarmy-auto-last.json",
    "- reports/smartarmy-auto-last.md",
    "",
    smartdev.skipped ? `SmartDev Auto: SKIPPED ${smartdev.reason}` : `SmartDev Auto: ${smartdev.ok ? "OK" : "FAILED"}`,
    opt.clip ? "Copied to clipboard." : ""
  ].join("\n");
}

const opt = parse(args);

try {
  const out = run(opt);
  console.log(out);
  process.exit(0);
} catch (err) {
  console.error(`SMARTARMY_AUTO_ERROR: ${err.message}`);
  process.exit(1);
}