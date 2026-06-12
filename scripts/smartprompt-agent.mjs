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

function readTextSafe(file) {
  try {
    return fs.readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "");
  } catch {
    return "";
  }
}

function readJsonSafe(file, fallback = {}) {
  try {
    const raw = readTextSafe(file);
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeTextSafe(file, text) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text, "utf8");
}

function appendLineSafe(file, obj) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.appendFileSync(full, JSON.stringify(obj) + "\n", "utf8");
}

function latestFiles(dir, n = 8) {
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

function tailLines(file, max = 12) {
  const txt = readTextSafe(file);
  if (!txt.trim()) return [];
  return txt.split(/\r?\n/).filter(Boolean).slice(-max);
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
    mode: "next",
    clip: false,
    fromClip: false,
    learn: false,
    text: []
  };

  const aliases = {
    eror: "error",
    error: "error",
    bug: "bug",
    fitur: "fitur",
    feature: "fitur",
    ui: "ui",
    ux: "ui",
    vps: "vps",
    release: "release",
    rilis: "release",
    terminal: "terminal",
    commit: "commit",
    next: "next",
    lanjut: "next",
    learn: "learn",
    belajar: "learn",
    doctor: "doctor"
  };

  for (const a of raw) {
    const lower = String(a).toLowerCase();
    if (a === "--clip" || a === "-c") out.clip = true;
    else if (a === "--from-clip" || a === "--paste") out.fromClip = true;
    else if (aliases[lower]) out.mode = aliases[lower];
    else out.text.push(a);
  }
  return out;
}

function inferModeText(mode, doctrine) {
  const rules = doctrine.modeRules || {};
  return rules[mode] || {
    next: "Lanjutkan fase berikutnya dari checkpoint terakhir.",
    doctor: "Audit sistem SmartPrompting dan beri command perbaikan jika ada masalah."
  }[mode] || "Buat prompt kerja cerdas sesuai konteks.";
}

function buildPrompt(opt, doctrine) {
  let task = opt.text.join(" ").trim();
  const clipText = opt.fromClip ? getClipboard() : "";
  if (!task && clipText) task = clipText;
  if (!task) task = "Lanjutkan dari checkpoint terakhir dan pilih next best step.";

  const branch = sh("git rev-parse --abbrev-ref HEAD");
  const commit = sh("git log -1 --oneline");
  const status = sh("git status --short");
  const diffName = sh("git diff --name-only");
  const reports = latestFiles("reports", 12);
  const shots = latestFiles("shots", 8);
  const recentLessons = tailLines("data/smartprompt/lessons.jsonl", 10);

  const modeText = inferModeText(opt.mode, doctrine);
  const doctrineLines = Array.isArray(doctrine.doctrine) ? doctrine.doctrine : [];

  const answerContract = {
    error: [
      "Mulai dengan diagnosis evidence-based dari error/log.",
      "Jangan langsung patch sebelum root cause masuk akal.",
      "Beri satu blok PowerShell untuk diagnosis/patch aman.",
      "Sertakan verifikasi report JSON/screenshot yang harus dicek."
    ],
    bug: [
      "Jelaskan expected vs actual.",
      "Cari file kandidat dan titik gagal paling mungkin.",
      "Beri patch kecil dengan backup.",
      "Tambahkan regression check agar bug tidak balik."
    ],
    fitur: [
      "Ubah permintaan fitur jadi requirement jelas.",
      "Jaga UX sederhana dan arah produk akhir.",
      "Beri patch bertahap: data-flow, UI, guard, test.",
      "Beri done criteria."
    ],
    ui: [
      "Diagnosis DOM/computed CSS/screenshot dulu.",
      "Bandingkan baseline, jangan tebak CSS.",
      "Patch presisi dan screenshot ulang."
    ],
    vps: [
      "Utamakan dry-run VPS/cloud worker.",
      "No real save/send/delete.",
      "Cek healthcheck, PM2/systemd, env, rollback, log."
    ],
    terminal: [
      "Beri satu blok PowerShell siap tempel.",
      "Jangan banyak teori.",
      "Output harus punya report/check yang jelas."
    ]
  }[opt.mode] || [
    "Jangan mulai dari nol.",
    "Beri diagnosis singkat.",
    "Beri satu blok command siap tempel.",
    "Beri cara verifikasi."
  ];

  return `BRO, AKTIFKAN SMARTPROMPTING AGENT v0.2 + AGENT ARMY.

JENIS KASUS:
${opt.mode.toUpperCase()} — ${modeText}

TUGAS / INPUT USER:
${task}

KONTEKS REPO:
- Project: ${doctrine?.defaultContext?.project || "SmartWork Agent"}
- Path: ${doctrine?.defaultContext?.repoPath || root}
- Branch fokus: ${doctrine?.defaultContext?.branchFocus || "(tidak ada)"}
- Branch sekarang: ${branch || "(tidak terbaca)"}
- Commit terakhir: ${commit || "(tidak terbaca)"}
- Arah terakhir: ${doctrine?.defaultContext?.latestKnownDirection || "lanjut dari checkpoint terakhir"}

STATUS GIT:
${status || "clean / tidak ada perubahan terdeteksi"}

FILE BERUBAH DI DIFF:
${diffName || "(tidak ada diff tracked)"}

REPORT TERBARU:
${reports.length ? reports.map(x => "- " + x).join("\n") : "- belum ada"}

SCREENSHOT TERBARU:
${shots.length ? shots.map(x => "- " + x).join("\n") : "- belum ada"}

PELAJARAN TERSIMPAN:
${recentLessons.length ? recentLessons.map(x => "- " + x).join("\n") : "- belum ada lesson tersimpan"}

DOKTRIN WAJIB:
${doctrineLines.map(x => "- " + x).join("\n")}

KONTRAK JAWABAN:
${answerContract.map((x, i) => `${i + 1}. ${x}`).join("\n")}

FORMAT OUTPUT YANG DIMINTA:
1. Diagnosis singkat berbasis evidence.
2. Risiko/guard yang harus dijaga.
3. Satu blok PowerShell siap tempel.
4. Report/screenshot/output yang harus dicek.
5. Kesimpulan next step, tanpa bertanya “mau?”.
`;
}

const opt = parse(args);
const doctrine = readJsonSafe("data/smartprompt/doctrine.json", {});

if (opt.mode === "learn") {
  const lesson = opt.text.join(" ").trim() || getClipboard();
  if (!lesson) {
    console.log("Tidak ada lesson. Contoh: swp learn \"Jangan ulang input tanggal yang sudah verified\" --clip");
    process.exit(0);
  }
  const row = {
    at: new Date().toISOString(),
    lesson
  };
  appendLineSafe("data/smartprompt/lessons.jsonl", row);
  const msg = `Lesson tersimpan untuk SmartPrompting Agent:\n- ${lesson}`;
  writeTextSafe("reports/smartprompt-last.md", msg);
  console.log(msg);
  if (opt.clip) copyClipboard(msg);
  process.exit(0);
}

const prompt = buildPrompt(opt, doctrine);
writeTextSafe("reports/smartprompt-last.md", prompt);

const historyRow = {
  at: new Date().toISOString(),
  mode: opt.mode,
  task: opt.text.join(" ").trim(),
  fromClip: opt.fromClip
};
appendLineSafe("data/smartprompt/history.jsonl", historyRow);

console.log("\n=== SMARTPROMPT READY v0.2 ===\n");
console.log(prompt);
console.log("\nSaved: reports\\smartprompt-last.md");

if (opt.clip) {
  const ok = copyClipboard(prompt);
  console.log(ok ? "\nCopied to clipboard." : "\nClipboard copy failed, but prompt was saved.");
}