import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const ARMY_ROOT = path.join(ROOT, "tools", "agent-army");
const CHARACTER_ROOT = path.join(ARMY_ROOT, "characters");
const REPORT_DIR = path.join(ROOT, "reports");

const AGENTS = [
  {
    id: "smartbrain",
    name: "SmartBrain",
    role: "Brain / Commander",
    duty: "Membaca arah produk, membuat rencana aman, dan menjaga fokus workflow SmartWork.",
    character: "smartbrain.png"
  },
  {
    id: "smartguard",
    name: "SmartGuard",
    role: "Backup / Safety Guard",
    duty: "Mewajibkan backup sebelum patch, mencegah save/delete/send tanpa izin.",
    character: "smartguard.png"
  },
  {
    id: "smartdiagnose",
    name: "SmartDiagnose",
    role: "Diagnose",
    duty: "Membaca error, inspect file, cek alur request, dan menemukan titik rusak.",
    character: "smartdiagnose.png"
  },
  {
    id: "smartpaste",
    name: "SmartPaste",
    role: "Patch / Apply",
    duty: "Menerapkan perubahan code secara terarah dan kecil.",
    character: "smartpaste.png"
  },
  {
    id: "smartui",
    name: "SmartUI",
    role: "UI Screenshot / Visual Check",
    duty: "Mengecek tampilan mobile/web, screenshot fokus, dan masalah layout.",
    character: "smartui.png"
  },
  {
    id: "smartdoctor",
    name: "SmartDoctor",
    role: "Audit / Doctor",
    duty: "Menjalankan audit, test ringan, validasi struktur, dan laporan kesehatan.",
    character: "smartdoctor.png"
  },
  {
    id: "smartcompile",
    name: "SmartCompile",
    role: "Build / Compile",
    duty: "Menjalankan build/check command bila tersedia.",
    character: "smartcompile.png"
  },
  {
    id: "autoforge",
    name: "AutoForge",
    role: "Automation Script Forge",
    duty: "Membantu membuat atau memperbaiki script automation SmartWork.",
    character: "autoforge.png"
  },
  {
    id: "smartclean",
    name: "SmartClean",
    role: "Clean",
    duty: "Membersihkan file sementara dan menjaga folder reports/shots tetap rapi.",
    character: "smartclean.png"
  },
  {
    id: "smartdeploy",
    name: "SmartDeploy",
    role: "Commit / Deploy Guard",
    duty: "Membantu report commit/push hanya setelah patch aman.",
    character: "smartdeploy.png"
  },
  {
    id: "smartbuddy",
    name: "SmartBuddy",
    role: "Progress Summary",
    duty: "Merangkum progres agar user tahu status kerja tanpa bingung.",
    character: "smartbuddy.png"
  }
];

function existsSafe(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getAgentReadiness() {
  return AGENTS.map((agent) => {
    const characterPath = path.join(CHARACTER_ROOT, agent.character);
    return {
      ...agent,
      ready: existsSafe(characterPath),
      characterPath: path.relative(ROOT, characterPath).replaceAll("\\", "/")
    };
  });
}

function createReport() {
  ensureDir(REPORT_DIR);

  const readyAgents = getAgentReadiness();
  const report = {
    ok: readyAgents.every((agent) => agent.ready),
    mode: "SMARTWORK_AGENT_ARMY_CONTROLLER",
    generatedAt: new Date().toISOString(),
    root: ROOT,
    armyRoot: path.relative(ROOT, ARMY_ROOT).replaceAll("\\", "/"),
    totalAgents: readyAgents.length,
    readyCount: readyAgents.filter((agent) => agent.ready).length,
    missingCount: readyAgents.filter((agent) => !agent.ready).length,
    workflow: [
      "SmartBrain: plan",
      "SmartGuard: backup/safety",
      "SmartDiagnose: inspect",
      "SmartPaste: patch",
      "SmartCompile: build/check",
      "SmartUI: screenshot/check",
      "SmartDoctor: audit",
      "SmartBuddy: summary",
      "SmartDeploy: commit/deploy only if safe"
    ],
    agents: readyAgents
  };

  const out = path.join(REPORT_DIR, "smartwork-agent-army-controller-report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  return { report, out };
}

const { report, out } = createReport();

console.log(JSON.stringify({
  ok: report.ok,
  mode: report.mode,
  totalAgents: report.totalAgents,
  readyCount: report.readyCount,
  missingCount: report.missingCount,
  reportPath: path.relative(ROOT, out).replaceAll("\\", "/")
}, null, 2));

if (!report.ok) {
  process.exitCode = 1;
}
