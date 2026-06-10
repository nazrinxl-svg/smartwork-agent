import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "reports");
const ARMY_DIR = path.join(ROOT, "tools", "agent-army");

const agents = [
  {
    id: "smartbrain",
    name: "SmartBrain",
    phase: "PLAN",
    requiredBeforePatch: true,
    control: [
      "Tujuan patch harus jelas.",
      "Scope file harus dibatasi.",
      "Jangan melebar dari request user."
    ]
  },
  {
    id: "smartguard",
    name: "SmartGuard",
    phase: "GUARD",
    requiredBeforePatch: true,
    control: [
      "Backup marker wajib ada.",
      "Git status wajib dibaca.",
      "Aksi save/delete/send nyata wajib izin."
    ]
  },
  {
    id: "smartdiagnose",
    name: "SmartDiagnose",
    phase: "DIAGNOSE",
    requiredBeforePatch: true,
    control: [
      "Inspect file target sebelum edit.",
      "Cari sumber error, bukan tebak.",
      "Bedakan masalah UI, server, runner, dan data."
    ]
  },
  {
    id: "smartpaste",
    name: "SmartPaste",
    phase: "PATCH",
    requiredBeforePatch: false,
    control: [
      "Patch kecil dan terarah.",
      "Jangan rewrite total kalau tidak perlu.",
      "Jaga style existing."
    ]
  },
  {
    id: "smartcompile",
    name: "SmartCompile",
    phase: "CHECK",
    requiredBeforePatch: false,
    control: [
      "Cek package script yang tersedia.",
      "Jalankan npm/build/doctor sesuai proyek.",
      "Catat error secara jujur."
    ]
  },
  {
    id: "smartui",
    name: "SmartUI",
    phase: "VISUAL",
    requiredBeforePatch: false,
    control: [
      "Jika UI berubah, wajib cek tampilan.",
      "Screenshot fokus area.",
      "Jangan generate gambar."
    ]
  },
  {
    id: "smartdoctor",
    name: "SmartDoctor",
    phase: "AUDIT",
    requiredBeforePatch: false,
    control: [
      "Audit hasil patch.",
      "Cek report JSON bila ada.",
      "Pastikan tidak merusak fitur lama."
    ]
  },
  {
    id: "autoforge",
    name: "AutoForge",
    phase: "AUTOMATION",
    requiredBeforePatch: false,
    control: [
      "Buat script automation jika dibutuhkan.",
      "Jangan jalankan aksi nyata tanpa guard.",
      "Pisahkan preview dan confirmed save."
    ]
  },
  {
    id: "smartclean",
    name: "SmartClean",
    phase: "CLEAN",
    requiredBeforePatch: false,
    control: [
      "Rapikan file sementara bila diminta.",
      "Jangan hapus report penting tanpa izin.",
      "Jangan hapus data intake/job tanpa backup."
    ]
  },
  {
    id: "smartdeploy",
    name: "SmartDeploy",
    phase: "DEPLOY",
    requiredBeforePatch: false,
    control: [
      "Commit hanya setelah user setuju.",
      "Push hanya setelah test aman.",
      "Jangan deploy kondisi rusak."
    ]
  },
  {
    id: "smartbuddy",
    name: "SmartBuddy",
    phase: "SUMMARY",
    requiredBeforePatch: false,
    control: [
      "Ringkas apa yang berubah.",
      "Sebut file yang disentuh.",
      "Sebut next step paling aman."
    ]
  }
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeExec(command) {
  try {
    return {
      ok: true,
      output: execSync(command, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      })
    };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout || ""}${error.stderr || ""}`.trim()
    };
  }
}

function readPackageScripts() {
  const pkgPath = path.join(ROOT, "package.json");
  if (!fs.existsSync(pkgPath)) return {};
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg.scripts || {};
  } catch {
    return {};
  }
}

function listImportantFiles() {
  const candidates = [
    "app",
    "public",
    "scripts",
    "intake",
    "tools/agent-army",
    "reports"
  ];

  return candidates.map((rel) => {
    const abs = path.join(ROOT, rel);
    return {
      path: rel,
      exists: fs.existsSync(abs)
    };
  });
}

ensureDir(REPORT_DIR);

const gitStatus = safeExec("git status --short");
const scripts = readPackageScripts();
const importantFiles = listImportantFiles();

const dangerousChangedFiles = [];
if (gitStatus.ok) {
  for (const line of gitStatus.output.split(/\r?\n/).filter(Boolean)) {
    if (
      line.includes(".env") ||
      line.includes("browser-profile") ||
      line.includes(".smartwork-browser")
    ) {
      dangerousChangedFiles.push(line);
    }
  }
}

const report = {
  ok: dangerousChangedFiles.length === 0,
  mode: "SMARTWORK_AGENT_ARMY_CODING_CONTROL",
  generatedAt: new Date().toISOString(),
  root: ROOT,
  doctrinePath: "tools/agent-army/smartwork-coding-doctrine.md",
  agents,
  requiredCodingFlow: [
    "Brain",
    "Guard",
    "Diagnose",
    "Patch",
    "Compile/Check",
    "SmartUI if UI changed",
    "Doctor",
    "Buddy summary",
    "Deploy only after user approval"
  ],
  safety: {
    dangerousChangedFiles,
    noDangerousFilesChanged: dangerousChangedFiles.length === 0,
    mustAskBefore: [
      "save real SIAGA data",
      "delete real data",
      "send email",
      "send WhatsApp",
      "commit",
      "push",
      "deploy"
    ]
  },
  project: {
    importantFiles,
    packageScripts: scripts
  },
  gitStatus: gitStatus.output || ""
};

const out = path.join(REPORT_DIR, "smartwork-agent-army-coding-control-report.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");

console.log(JSON.stringify({
  ok: report.ok,
  mode: report.mode,
  totalAgents: agents.length,
  dangerousChangedFiles: dangerousChangedFiles.length,
  reportPath: path.relative(ROOT, out).replaceAll("\\", "/")
}, null, 2));

if (!report.ok) process.exitCode = 1;
