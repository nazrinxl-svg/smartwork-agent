import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const args = process.argv.slice(2);

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function readText(file) {
  try {
    return fs.readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "");
  } catch {
    return "";
  }
}

function readJson(file, fallback = {}) {
  try {
    const raw = readText(file);
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeText(file, text) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text, "utf8");
}

function appendJsonl(file, row) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.appendFileSync(full, JSON.stringify(row) + "\n", "utf8");
}

function latestFiles(dir, n = 10) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .map(name => {
      const p = path.join(full, name);
      const s = fs.statSync(p);
      return { name, mtime: s.mtimeMs, size: s.size };
    })
    .filter(x => x.size > 0)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, n)
    .map(x => `${dir}/${x.name}`);
}

function tail(file, n = 10) {
  const txt = readText(file);
  if (!txt.trim()) return [];
  return txt.split(/\r?\n/).filter(Boolean).slice(-n);
}

function getClipboard() {
  try {
    return execSync("powershell -NoProfile -Command Get-Clipboard -Raw", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

function copyClipboard(text) {
  try {
    const r = spawnSync("clip.exe", [], { input: text, encoding: "utf8" });
    if (r.status === 0) return true;
  } catch {}
  try {
    const ps = `Set-Clipboard -Value @'\n${text.replace(/'/g, "''")}\n'@`;
    execSync(`powershell -NoProfile -Command ${JSON.stringify(ps)}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function parse(raw) {
  const out = {
    mode: "auto",
    clip: false,
    fromClip: false,
    saveOnly: false,
    text: []
  };

  const aliases = {
    auto: "auto",
    team: "auto",
    tim: "auto",
    error: "error",
    eror: "error",
    bug: "bug",
    fitur: "fitur",
    feature: "fitur",
    ui: "ui",
    ux: "ui",
    vps: "vps",
    release: "release",
    rilis: "release",
    commit: "commit",
    doctor: "doctor"
  };

  for (const a of raw) {
    const lower = String(a).toLowerCase();
    if (a === "--clip" || a === "-c") out.clip = true;
    else if (a === "--from-clip" || a === "--paste") out.fromClip = true;
    else if (a === "--save-only") out.saveOnly = true;
    else if (aliases[lower]) out.mode = aliases[lower];
    else out.text.push(a);
  }

  return out;
}

function packageScripts() {
  const pkg = readJson("package.json", {});
  return pkg?.scripts ? Object.keys(pkg.scripts).sort() : [];
}

function candidateFiles(task, mode) {
  const q = `${mode} ${task}`.toLowerCase();
  const all = sh("git ls-files");
  const files = all ? all.split(/\r?\n/).filter(Boolean) : [];

  const weights = [
    ["smartprompt", 8],
    ["smartdev", 8],
    ["smartwork", 5],
    ["server", 4],
    ["worker", 4],
    ["watch", 4],
    ["request", 4],
    ["progress", 4],
    ["ui", 3],
    ["vps", 5],
    ["deploy", 5],
    ["doctor", 5],
    ["guard", 5],
    ["report", 3]
  ];

  return files
    .map(file => {
      const f = file.toLowerCase();
      let score = 0;
      for (const [key, w] of weights) {
        if (q.includes(key) && f.includes(key)) score += w;
        if (f.includes(key)) score += 1;
      }
      if (mode === "ui" && /\.(html|css|jsx|tsx|js)$/.test(f)) score += 2;
      if (mode === "vps" && /(pm2|systemd|deploy|vps|health|server|env)/.test(f)) score += 4;
      if ((mode === "error" || mode === "bug") && /(doctor|diagnose|guard|test|check|report)/.test(f)) score += 3;
      return { file, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(x => x.file);
}

function modeGoal(mode) {
  return {
    auto: "Tim developer otomatis memilih alur terbaik berdasarkan request.",
    error: "Diagnosis error dulu, root cause jelas, baru patch aman.",
    bug: "Reproduksi bug, expected vs actual, patch minimal, regression check.",
    fitur: "Ubah ide fitur menjadi requirement, arsitektur kecil, patch bertahap, test.",
    ui: "Diagnosis UI presisi via DOM/computed/screenshot, patch minimal, screenshot ulang.",
    vps: "Lanjut VPS/cloud worker 24/7 dengan dry-run, healthcheck, rollback.",
    release: "Siapkan release aman: doctor, build/test, report, commit/tag.",
    commit: "Review diff, guard, report, commit message, push jika valid.",
    doctor: "Audit sistem agent dan temukan masalah konfigurasi/workflow."
  }[mode] || "Selesaikan request dengan alur developer-team aman.";
}

function buildMission(opt) {
  const doctrine = readJson("data/smartprompt/doctrine.json", {});
  const team = readJson("data/smartprompt/team.json", {});
  const taskFromClip = opt.fromClip ? getClipboard() : "";
  const task = opt.text.join(" ").trim() || taskFromClip || "Lanjutkan dari checkpoint terakhir dan pilih next best step.";

  const now = new Date();
  const missionId = `smartdev-team-${now.toISOString().replace(/[:.]/g, "-")}`;

  const branch = sh("git rev-parse --abbrev-ref HEAD");
  const commit = sh("git log -1 --oneline");
  const status = sh("git status --short");
  const diffStat = sh("git diff --stat");
  const diffNames = sh("git diff --name-only");
  const reports = latestFiles("reports", 15);
  const shots = latestFiles("shots", 10);
  const lessons = tail("data/smartprompt/lessons.jsonl", 12);
  const scripts = packageScripts();
  const candidates = candidateFiles(task, opt.mode);

  const roleSections = (team.roles || []).map((role, idx) => {
    const roleContracts = {
      Commander: [
        "Tetapkan target akhir dan batasan.",
        "Pilih urutan fase: diagnose -> plan -> patch -> verify -> report.",
        "Jangan izinkan kerja melebar dari request."
      ],
      Brain: [
        "Baca checkpoint, report terbaru, screenshot, git status, dan lesson.",
        "Gunakan known-good checkpoint, jangan mulai dari nol."
      ],
      Diagnose: [
        "Cari root cause dari evidence.",
        "Kalau evidence kurang, buat command diagnosis dulu."
      ],
      Architect: [
        "Buat desain perubahan kecil.",
        "Jaga kompatibilitas dengan flow SmartWork yang sudah proven."
      ],
      Coder: [
        "Patch kecil, reversible, backup dulu.",
        "Jangan sentuh file rahasia."
      ],
      Guard: [
        "Blok real save/send/delete tanpa izin eksplisit.",
        "Blok pengulangan input tanggal verified/filled.",
        "Pastikan ada rollback/report."
      ],
      Tester: [
        "Jalankan doctor/build/check sesuai package script yang tersedia.",
        "Minta screenshot/report fokus jika UI."
      ],
      Reviewer: [
        "Review diff dan risiko regression.",
        "Pastikan done criteria tercapai."
      ],
      Reporter: [
        "Tulis hasil akhir, report path, screenshot path, dan next step tunggal."
      ]
    }[role.name] || [role.job];

    return `### ${idx + 1}. ${role.name}
Tugas: ${role.job}
Checklist:
${roleContracts.map(x => `- ${x}`).join("\n")}`;
  }).join("\n\n");

  const availableChecks = scripts.length
    ? scripts.filter(s => /(brain|doctor|check|test|build|guard|ui|shot|vps|smoke|lint)/i.test(s)).slice(0, 30)
    : [];

  const suggestedCommand = `cd "${root}"
Write-Host "\`n=== SMARTDEV TEAM: EVIDENCE FIRST ==="

Write-Host "\`n--- GIT STATUS ---"
git status --short

Write-Host "\`n--- LAST COMMIT ---"
git log -1 --oneline

Write-Host "\`n--- LATEST REPORTS ---"
Get-ChildItem reports -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 12 Name,Length,LastWriteTime | Format-Table -AutoSize

Write-Host "\`n--- LATEST SHOTS ---"
Get-ChildItem shots -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 8 Name,Length,LastWriteTime | Format-Table -AutoSize

Write-Host "\`n--- PACKAGE CHECK SCRIPTS ---"
node -e "const p=require('./package.json'); for (const [k,v] of Object.entries(p.scripts||{})) if(/brain|doctor|check|test|build|guard|ui|shot|vps|smoke|lint/i.test(k)) console.log(k+' = '+v)"

Write-Host "\`n--- SMARTPROMPT TEAM MISSION ---"
Get-Content "reports\\smartdev-team-last.md" -Raw`;

  const mission = `# SMARTDEV TEAM MISSION

Mission ID: ${missionId}
Mode: ${opt.mode.toUpperCase()}
Goal: ${modeGoal(opt.mode)}

## Request
${task}

## Repo Evidence
- Project: ${doctrine?.defaultContext?.project || "SmartWork Agent"}
- Path: ${doctrine?.defaultContext?.repoPath || root}
- Branch focus: ${doctrine?.defaultContext?.branchFocus || "(not set)"}
- Branch now: ${branch || "(unknown)"}
- Last commit: ${commit || "(unknown)"}
- Direction: ${doctrine?.defaultContext?.latestKnownDirection || "Continue from latest known-good checkpoint."}

## Git Status
${status || "clean / no working-tree changes detected"}

## Diff Stat
${diffStat || "(no tracked diff)"}

## Changed Files
${diffNames || "(no tracked changed files)"}

## Latest Reports
${reports.length ? reports.map(x => `- ${x}`).join("\n") : "- none"}

## Latest Screenshots
${shots.length ? shots.map(x => `- ${x}`).join("\n") : "- none"}

## Candidate Files
${candidates.length ? candidates.map(x => `- ${x}`).join("\n") : "- belum terdeteksi; lakukan diagnosis file dulu"}

## Relevant Package Scripts
${availableChecks.length ? availableChecks.map(x => `- npm run ${x}`).join("\n") : "- belum ada script check terdeteksi"}

## Saved Lessons
${lessons.length ? lessons.map(x => `- ${x}`).join("\n") : "- none"}

## Doctrine
${Array.isArray(doctrine.doctrine) ? doctrine.doctrine.map(x => `- ${x}`).join("\n") : "- no doctrine loaded"}

## Team Roles
${roleSections}

## Execution Contract For The Next AI/Agent
1. Mulai dari diagnosis berbasis evidence di atas.
2. Jangan mulai dari nol dan jangan mengulang flow yang sudah proven.
3. Jangan real save/send/delete tanpa guard dan izin eksplisit.
4. Beri satu blok PowerShell siap tempel.
5. Patch harus kecil, backup dulu, dan punya verifikasi.
6. Setelah patch, cek report JSON/screenshot/build/doctor.
7. Akhiri dengan kesimpulan next step tunggal, tanpa bertanya 'mau?'.

## Suggested Evidence Command
\`\`\`powershell
${suggestedCommand}
\`\`\`

## Prompt Siap Tempel
BRO, AKTIFKAN SMARTDEV TEAM ORCHESTRATOR.

Mode: ${opt.mode.toUpperCase()}
Tugas: ${task}

Gunakan evidence repo, report, screenshot, lesson, candidate files, doctrine, dan role team dari mission ini. Bertindak seperti tim developer: Commander -> Brain -> Diagnose -> Architect -> Coder -> Guard -> Tester -> Reviewer -> Reporter.

Output wajib:
1. Diagnosis singkat berbasis evidence.
2. Root cause atau hipotesis kuat.
3. Risiko/guard.
4. Satu blok PowerShell siap tempel untuk diagnosis/patch/verifikasi.
5. Report/screenshot/output yang harus dicek.
6. Kesimpulan next step tunggal, tanpa bertanya 'mau?'.
`;

  const json = {
    missionId,
    at: now.toISOString(),
    mode: opt.mode,
    task,
    branch,
    commit,
    status,
    diffNames,
    reports,
    shots,
    candidates,
    availableChecks
  };

  return { missionId, mission, json };
}

const opt = parse(args);
const result = buildMission(opt);

writeText("reports/smartdev-team-last.md", result.mission);
writeText(`reports/${result.missionId}.md`, result.mission);
writeText(`reports/${result.missionId}.json`, JSON.stringify(result.json, null, 2));
appendJsonl("data/smartprompt/team-history.jsonl", {
  at: new Date().toISOString(),
  missionId: result.missionId,
  mode: opt.mode
});

console.log("\n=== SMARTDEV TEAM READY v0.3 ===\n");
console.log(result.mission);
console.log(`\nSaved: reports\\smartdev-team-last.md`);
console.log(`Saved: reports\\${result.missionId}.md`);
console.log(`Saved: reports\\${result.missionId}.json`);

if (opt.clip) {
  const ok = copyClipboard(result.mission);
  console.log(ok ? "\nCopied to clipboard." : "\nClipboard copy failed, but mission was saved.");
}