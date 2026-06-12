import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const args = process.argv.slice(2);

const defaultArmyHtml = "C:\\Users\\Digitalisasi\\Desktop\\SmartLearn-Agent-Army\\smartlearn-agent-army.html";
const registryPath = "agents/_registry/smartlearn-agent-army.json";

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&[^;]+;/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "agent";
}

function titleCase(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function readText(file, fallback = "") {
  try {
    return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return fallback;
  }
}

function readRepoText(file, fallback = "") {
  return readText(path.join(root, file), fallback);
}

function writeRepoText(file, text) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text, "utf8");
}

function readJsonRepo(file, fallback) {
  try {
    const raw = readRepoText(file, "");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function sh(cmd) {
  try {
    return execSync(cmd, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    return "";
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

function parse(raw) {
  const out = {
    cmd: "help",
    html: defaultArmyHtml,
    injectLink: false,
    clip: false,
    agent: "",
    capability: "",
    text: []
  };

  const commands = new Set(["import", "scan", "list", "run", "evolve", "doctor", "help"]);

  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    const lower = String(a).toLowerCase();

    if (commands.has(lower)) out.cmd = lower === "scan" ? "import" : lower;
    else if (a === "--html") out.html = raw[++i] || out.html;
    else if (a === "--inject-link") out.injectLink = true;
    else if (a === "--clip" || a === "-c") out.clip = true;
    else if (a === "--agent") out.agent = raw[++i] || "";
    else if (a === "--capability") out.capability = raw[++i] || "";
    else out.text.push(a);
  }

  if (!out.capability && out.cmd === "evolve") out.capability = out.text.join(" ");

  return out;
}

function attr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i");
  const m = tag.match(re);
  return m ? m[1].trim() : "";
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferMission(name) {
  const low = String(name).toLowerCase();

  if (low.includes("ui")) return "Diagnosis UI presisi dari DOM, computed CSS, screenshot, baseline, lalu patch kecil.";
  if (low.includes("doctor")) return "Audit kesehatan project, guard, dan report sebelum patch.";
  if (low.includes("guard")) return "Menjaga safety, no secret, no real save/send/delete, dan anti-loop.";
  if (low.includes("brain")) return "Membaca checkpoint, memory, report, screenshot, dan status repo.";
  if (low.includes("runner")) return "Menjalankan safe checks dan membuat report eksekusi.";
  if (low.includes("backup")) return "Membuat backup sebelum perubahan dan memastikan rollback tersedia.";
  if (low.includes("diagnose")) return "Mencari root cause dari log, report, screenshot, dan git diff.";
  if (low.includes("feature")) return "Mengubah ide fitur menjadi requirement, patch plan, test, dan done criteria.";
  if (low.includes("evolution")) return "Mengembangkan kemampuan agent lain melalui capability, lesson, prompt contract, dan guard.";

  return "Menjadi visual agent dalam SmartLearn Agent Army dan menerima kemampuan evolution dari terminal bridge.";
}

function defaultCapabilities(name) {
  const base = [
    "visual_roster_identity",
    "read_repo_context",
    "produce_mission_prompt",
    "write_report",
    "receive_evolution_capability"
  ];

  const low = String(name).toLowerCase();

  if (low.includes("ui")) base.push("diagnose_dom_computed_css");
  if (low.includes("doctor")) base.push("run_doctor_checks");
  if (low.includes("guard")) base.push("safety_gate_before_patch");
  if (low.includes("brain")) base.push("read_checkpoint_memory");
  if (low.includes("runner")) base.push("run_safe_checks");
  if (low.includes("diagnose")) base.push("root_cause_analysis");
  if (low.includes("feature")) base.push("feature_requirement_builder");

  return [...new Set(base)];
}

function extractAgentsFromHtml(html, htmlPath) {
  const found = new Map();

  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  for (const tag of imgTags) {
    const src = attr(tag, "src");
    const alt = attr(tag, "alt");
    const title = attr(tag, "title");
    const dataName = attr(tag, "data-name") || attr(tag, "data-agent");

    let name = dataName || alt || title || "";
    if (!name && src) {
      name = path.basename(src).replace(/\.[a-z0-9]+$/i, "");
    }

    name = titleCase(name);
    if (!name || name.length < 2) continue;

    const id = slugify(name);
    if (!found.has(id)) {
      found.set(id, {
        id,
        name,
        sourceImage: src,
        sourceHtml: htmlPath
      });
    }
  }

  const buttonText = [...html.matchAll(/<(button|a|h1|h2|h3|h4|div|span)[^>]*>([\s\S]{0,160}?)<\/\1>/gi)]
    .map(m => stripHtml(m[2]))
    .filter(t => /agent|brain|doctor|guard|runner|ui|backup|diagnose|feature|evolution/i.test(t))
    .filter(t => t.length >= 3 && t.length <= 60);

  for (const nameRaw of buttonText) {
    const name = titleCase(nameRaw);
    const id = slugify(name);
    if (!found.has(id)) {
      found.set(id, {
        id,
        name,
        sourceImage: "",
        sourceHtml: htmlPath
      });
    }
  }

  if (!found.has("army-evolution-agent")) {
    found.set("army-evolution-agent", {
      id: "army-evolution-agent",
      name: "Army Evolution Agent",
      sourceImage: "",
      sourceHtml: htmlPath
    });
  }

  if (!found.size) {
    found.set("smartlearn-agent-army-core", {
      id: "smartlearn-agent-army-core",
      name: "SmartLearn Agent Army Core",
      sourceImage: "",
      sourceHtml: htmlPath
    });
  }

  return [...found.values()].map(a => ({
    id: a.id,
    name: a.name,
    type: "smartlearn-visual-agent",
    status: "imported",
    version: "0.1.0",
    mission: inferMission(a.name),
    sourceHtml: a.sourceHtml,
    sourceImage: a.sourceImage,
    capabilities: defaultCapabilities(a.name),
    guards: [
      "no_secret_leak",
      "no_real_save_send_delete_without_permission",
      "backup_before_patch",
      "report_after_run",
      "do_not_start_from_zero"
    ],
    promptContract: [
      "Jangan mulai dari nol.",
      "Baca checkpoint, report, screenshot, dan git status.",
      "Diagnosis dulu sebelum patch.",
      "Beri satu blok PowerShell siap tempel.",
      "Jaga guard dan safety.",
      "Akhiri dengan next step tunggal."
    ],
    evolutionLog: [],
    importedAt: nowIso(),
    updatedAt: nowIso()
  }));
}

function fileUrl(filePath) {
  return "file:///" + path.resolve(filePath).replace(/\\/g, "/").replace(/ /g, "%20");
}

function buildPanelHtml(registry, companionPath) {
  const cards = registry.agents.map(a => `
    <article class="card">
      <div class="avatar">${a.sourceImage ? `<img src="${a.sourceImage}" alt="${a.name}">` : `<div class="bot">AI</div>`}</div>
      <div>
        <h3>${a.name}</h3>
        <p>${a.mission}</p>
        <small>ID: ${a.id} | v${a.version}</small>
        <pre>safarmy run --agent ${a.id} "tugas agent" --clip</pre>
        <pre>safarmy evolve --agent ${a.id} --capability "kemampuan baru"</pre>
      </div>
    </article>
  `).join("\n");

  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SmartLearn Agent Army Evolution</title>
  <style>
    body{margin:0;font-family:'Plus Jakarta Sans',Arial,sans-serif;background:#f8fafc;color:#0f172a;font-size:12px}
    .wrap{max-width:1100px;margin:auto;padding:24px}
    .hero{border:1px solid #dbeafe;background:linear-gradient(135deg,#eff6ff,#ffffff);border-radius:22px;padding:20px;box-shadow:0 10px 30px rgba(15,23,42,.06)}
    h1{font-size:22px;margin:0 0 8px;font-weight:800}
    p{line-height:1.6;color:#475569}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:18px}
    .card{border:1px solid #e2e8f0;background:white;border-radius:18px;padding:14px;display:flex;gap:12px;box-shadow:0 8px 20px rgba(15,23,42,.05)}
    .avatar{width:54px;height:54px;border-radius:16px;background:#eff6ff;display:grid;place-items:center;overflow:hidden;flex:0 0 auto}
    img{width:100%;height:100%;object-fit:cover}
    .bot{font-weight:800;color:#2563eb}
    h3{font-size:14px;margin:0 0 6px}
    small{color:#64748b}
    pre{white-space:pre-wrap;background:#0f172a;color:#dbeafe;border-radius:12px;padding:10px;font-size:11px;overflow:auto}
    .cmd{background:#ecfeff;border:1px solid #bae6fd;border-radius:16px;padding:12px;margin-top:14px}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <h1>SmartLearn Agent Army Evolution Bridge</h1>
      <p>Dashboard ini menghubungkan roster visual SmartLearn Agent Army ke SmartAgent Factory di terminal. Browser tetap sebagai markas visual; terminal menjalankan brain, registry, evolve, run, doctor, dan report.</p>
      <div class="cmd">
        <b>Command utama:</b>
        <pre>safarmy list
safarmy run --agent army-evolution-agent "kembangkan kemampuan agent" --clip
safarmy evolve --agent army-evolution-agent --capability "create_and_upgrade_visual_agents_from_html_roster"
safarmy doctor</pre>
      </div>
      <p>Generated: ${nowIso()}<br>Panel: ${companionPath}</p>
    </section>
    <section class="grid">
      ${cards}
    </section>
  </main>
</body>
</html>`;
}

function writeAgentFiles(registry) {
  for (const agent of registry.agents) {
    const dir = `agents/smartlearn-army/${agent.id}`;
    writeRepoText(`${dir}/agent.json`, JSON.stringify(agent, null, 2));
    writeRepoText(`${dir}/README.md`, `# ${agent.name}

ID: ${agent.id}
Type: ${agent.type}
Version: ${agent.version}

## Mission
${agent.mission}

## Capabilities
${agent.capabilities.map(x => `- ${x}`).join("\n")}

## Guards
${agent.guards.map(x => `- ${x}`).join("\n")}

## Run
\`\`\`powershell
safarmy run --agent ${agent.id} "tugas agent" --clip
\`\`\`

## Evolve
\`\`\`powershell
safarmy evolve --agent ${agent.id} --capability "kemampuan baru"
\`\`\`
`);
  }
}

function importArmy(opt) {
  const htmlPath = path.resolve(opt.html || defaultArmyHtml);
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`HTML tidak ditemukan: ${htmlPath}`);
  }

  const html = readText(htmlPath);
  const agents = extractAgentsFromHtml(html, htmlPath);

  const companionPath = path.join(path.dirname(htmlPath), "smartlearn-agent-army-evolution.html");

  const registry = {
    name: "SmartLearn Agent Army Registry",
    version: "0.5.2",
    sourceHtml: htmlPath,
    companionHtml: companionPath,
    importedAt: nowIso(),
    updatedAt: nowIso(),
    agents
  };

  writeRepoText(registryPath, JSON.stringify(registry, null, 2));
  writeAgentFiles(registry);

  const panelHtml = buildPanelHtml(registry, companionPath);
  fs.writeFileSync(companionPath, panelHtml, "utf8");

  if (opt.injectLink) {
    injectLink(htmlPath, companionPath);
  }

  const report = {
    ok: true,
    action: "import",
    sourceHtml: htmlPath,
    companionHtml: companionPath,
    agentCount: agents.length,
    agents: agents.map(a => ({ id: a.id, name: a.name }))
  };

  writeRepoText("reports/smartlearn-army-import-report.json", JSON.stringify(report, null, 2));

  return [
    "SMARTLEARN AGENT ARMY IMPORT OK",
    `Source: ${htmlPath}`,
    `Companion: ${companionPath}`,
    `Agents: ${agents.length}`,
    "",
    ...agents.map(a => `- ${a.id} | ${a.name}`),
    "",
    "Reports:",
    "- reports/smartlearn-army-import-report.json"
  ].join("\n");
}

function injectLink(htmlPath, companionPath) {
  let html = readText(htmlPath);
  const marker = "<!-- SMARTLEARN_ARMY_EVOLUTION_BRIDGE -->";

  if (html.includes(marker)) return;

  const companionUrl = fileUrl(companionPath);

  const block = `
${marker}
<div style="position:fixed;right:14px;bottom:14px;z-index:99999;font-family:Arial,sans-serif">
  <a href="${companionUrl}" style="display:inline-flex;align-items:center;gap:8px;padding:10px 12px;border-radius:999px;background:#2563eb;color:white;text-decoration:none;font-size:12px;box-shadow:0 10px 30px rgba(37,99,235,.35)">
    SmartAgent Evolution
  </a>
</div>
<!-- /SMARTLEARN_ARMY_EVOLUTION_BRIDGE -->
`;

  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `${block}\n</body>`);
  } else {
    html += block;
  }

  fs.writeFileSync(htmlPath, html, "utf8");
}

function loadRegistry() {
  return readJsonRepo(registryPath, null);
}

function findAgent(reg, id) {
  const key = slugify(id);
  const agent = (reg.agents || []).find(a => a.id === id || a.id === key || slugify(a.name) === key);
  if (!agent) throw new Error(`Agent tidak ditemukan: ${id}`);
  return agent;
}

function saveRegistry(reg) {
  reg.updatedAt = nowIso();
  writeRepoText(registryPath, JSON.stringify(reg, null, 2));
  writeAgentFiles(reg);
}

function evolve(opt) {
  const reg = loadRegistry();
  if (!reg) throw new Error("Registry belum ada. Jalankan: safarmy import --inject-link");
  if (!opt.agent) throw new Error("Pilih agent: --agent agent-id");
  if (!opt.capability) throw new Error("Isi capability: --capability kemampuan_baru");

  const agent = findAgent(reg, opt.agent);
  const cap = slugify(opt.capability).replace(/-/g, "_");

  if (!agent.capabilities.includes(cap)) agent.capabilities.push(cap);

  const parts = String(agent.version || "0.1.0").split(".").map(x => Number(x) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1;

  agent.version = parts.slice(0, 3).join(".");
  agent.updatedAt = nowIso();
  agent.evolutionLog = Array.isArray(agent.evolutionLog) ? agent.evolutionLog : [];
  agent.evolutionLog.push({ at: agent.updatedAt, capability: cap, note: opt.capability });

  saveRegistry(reg);

  const report = {
    ok: true,
    action: "evolve",
    agent: agent.id,
    version: agent.version,
    capability: cap,
    note: opt.capability
  };

  writeRepoText(`reports/smartlearn-army-evolve-${agent.id}.json`, JSON.stringify(report, null, 2));

  return [
    "SMARTLEARN ARMY AGENT EVOLVED",
    `Agent: ${agent.name}`,
    `ID: ${agent.id}`,
    `Version: ${agent.version}`,
    `Capability: ${cap}`,
    "",
    `Report: reports/smartlearn-army-evolve-${agent.id}.json`
  ].join("\n");
}

function run(opt) {
  const reg = loadRegistry();
  if (!reg) throw new Error("Registry belum ada. Jalankan: safarmy import --inject-link");
  if (!opt.agent) throw new Error("Pilih agent: --agent agent-id");

  const agent = findAgent(reg, opt.agent);
  const task = opt.text.join(" ").trim() || "Jalankan misi agent.";

  const branch = sh("git rev-parse --abbrev-ref HEAD");
  const commit = sh("git log -1 --oneline");
  const status = sh("git status --short");
  const latestAuto = readRepoText("reports/smartdev-auto-last.md").slice(0, 2200);
  const latestTeam = readRepoText("reports/smartdev-team-last.md").slice(0, 2200);

  const prompt = `BRO, AKTIFKAN SMARTLEARN AGENT ARMY: ${agent.name}

AGENT ID:
${agent.id}

MISSION:
${agent.mission}

TASK:
${task}

SOURCE:
${reg.sourceHtml}

REPO:
- Branch: ${branch || "(unknown)"}
- Commit: ${commit || "(unknown)"}

GIT STATUS:
${status || "clean / no changes detected"}

CAPABILITIES:
${agent.capabilities.map(x => `- ${x}`).join("\n")}

GUARDS:
${agent.guards.map(x => `- ${x}`).join("\n")}

LATEST SMARTDEV AUTO:
${latestAuto || "(none)"}

LATEST SMARTDEV TEAM:
${latestTeam || "(none)"}

OUTPUT WAJIB:
1. Diagnosis singkat berbasis evidence.
2. Plan kecil dan aman.
3. Satu blok PowerShell siap tempel.
4. Cara verifikasi.
5. Report path yang harus dicek.
6. Next step tunggal, tanpa bertanya "mau?".
`;

  writeRepoText(`reports/smartlearn-army-run-${agent.id}-last.md`, prompt);
  writeRepoText("reports/smartlearn-army-run-last.md", prompt);

  if (opt.clip) copyClipboard(prompt);

  return [
    prompt,
    "",
    "Saved:",
    `- reports/smartlearn-army-run-${agent.id}-last.md`,
    "- reports/smartlearn-army-run-last.md",
    opt.clip ? "Copied to clipboard." : ""
  ].join("\n");
}

function list() {
  const reg = loadRegistry();
  if (!reg) return "Registry belum ada. Jalankan: safarmy import --inject-link";
  return [
    "SMARTLEARN AGENT ARMY REGISTRY",
    `Source: ${reg.sourceHtml}`,
    `Companion: ${reg.companionHtml}`,
    "",
    ...(reg.agents || []).map(a => `- ${a.id} | v${a.version} | ${a.name}`)
  ].join("\n");
}

function doctor() {
  const reg = loadRegistry();
  const checks = [];

  checks.push({ name: "sourceHtmlExists", ok: fs.existsSync(defaultArmyHtml) });
  checks.push({ name: "registryExists", ok: fs.existsSync(path.join(root, registryPath)) });
  checks.push({ name: "registryReadable", ok: !!reg });
  checks.push({ name: "agentsPresent", ok: !!reg && Array.isArray(reg.agents) && reg.agents.length > 0 });

  if (reg?.companionHtml) checks.push({ name: "companionHtmlExists", ok: fs.existsSync(reg.companionHtml) });

  for (const a of reg?.agents || []) {
    checks.push({
      name: `agentFile:${a.id}`,
      ok: fs.existsSync(path.join(root, "agents", "smartlearn-army", a.id, "agent.json"))
    });
  }

  const ok = checks.every(c => c.ok);
  const report = { ok, at: nowIso(), checks };

  writeRepoText("reports/smartlearn-army-bridge-doctor.json", JSON.stringify(report, null, 2));

  return [
    "SMARTLEARN ARMY BRIDGE DOCTOR",
    `OK: ${ok}`,
    "",
    ...checks.map(c => `- ${c.ok ? "OK" : "FAIL"} ${c.name}`),
    "",
    "Report:",
    "- reports/smartlearn-army-bridge-doctor.json"
  ].join("\n");
}

function help() {
  return `SMARTLEARN AGENT ARMY BRIDGE v0.5.2

Commands:
  safarmy import --inject-link
  safarmy list
  safarmy run --agent army-evolution-agent "kembangkan agent" --clip
  safarmy evolve --agent army-evolution-agent --capability "kemampuan_baru"
  safarmy doctor

Purpose:
  Menghubungkan SmartLearn-Agent-Army HTML dengan SmartAgent evolution engine di terminal.
`;
}

const opt = parse(args);

try {
  let out = "";

  if (opt.cmd === "import") out = importArmy(opt);
  else if (opt.cmd === "list") out = list();
  else if (opt.cmd === "run") out = run(opt);
  else if (opt.cmd === "evolve") out = evolve(opt);
  else if (opt.cmd === "doctor") out = doctor();
  else out = help();

  console.log(out);
} catch (err) {
  console.error(`SMARTLEARN_ARMY_BRIDGE_ERROR: ${err.message}`);
  process.exit(1);
}