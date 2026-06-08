import fs from "fs";
import path from "path";

const root = process.cwd();
const reportDir = path.join(root, "reports");
fs.mkdirSync(reportDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportDir, `${stamp}-diagnose-smartwork-app-foundation.json`);

function exists(p) {
  return fs.existsSync(path.join(root, p));
}

function readJson(p) {
  const full = path.join(root, p);
  if (!fs.existsSync(full)) return null;
  try {
    return JSON.parse(fs.readFileSync(full, "utf8").replace(/^\uFEFF/, "").trim());
  } catch (error) {
    return { __error: error.message };
  }
}

function list(dir, max = 80) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .slice(0, max)
    .map(name => {
      const p = path.join(full, name);
      const st = fs.statSync(p);
      return {
        name,
        type: st.isDirectory() ? "dir" : "file",
        size: st.size,
        modified: st.mtime.toISOString()
      };
    });
}

const pkg = readJson("package.json");

const data = {
  root,
  packageExists: exists("package.json"),
  package: pkg ? {
    name: pkg.name,
    version: pkg.version,
    type: pkg.type,
    scripts: pkg.scripts || {},
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {}
  } : null,
  folders: {
    scripts: list("scripts"),
    memory: list("memory"),
    reports: list("reports", 25),
    shots: list("shots", 25),
    src: list("src"),
    public: list("public")
  },
  appCandidates: {
    hasSrc: exists("src"),
    hasIndexHtml: exists("index.html"),
    hasViteConfig: exists("vite.config.js") || exists("vite.config.mjs"),
    hasServer: exists("server.js") || exists("src/server.js"),
    hasElectron: Boolean(pkg?.dependencies?.electron || pkg?.devDependencies?.electron),
    hasExpress: Boolean(pkg?.dependencies?.express || pkg?.devDependencies?.express),
    hasVite: Boolean(pkg?.dependencies?.vite || pkg?.devDependencies?.vite)
  },
  recommendedNext: [
    "If no UI app exists, create local web control panel with Express + static HTML.",
    "Expose safe endpoints: brain, doctor, siaga stable, siaga save, reports, screenshots.",
    "Do not expose credentials in UI.",
    "Do not run destructive delete unless user confirms from UI.",
    "No zoom/viewport automation."
  ]
};

fs.writeFileSync(reportPath, JSON.stringify(data, null, 2), "utf8");

console.log("SMARTWORK_APP_FOUNDATION_DIAGNOSE=OK");
console.log(`REPORT=${reportPath}`);

console.log("\n=== PACKAGE SCRIPTS ===");
for (const [key, value] of Object.entries(data.package?.scripts || {})) {
  console.log(`${key} = ${value}`);
}

console.log("\n=== APP CANDIDATES ===");
console.log(JSON.stringify(data.appCandidates, null, 2));

console.log("\n=== NEXT DECISION ===");
console.log("Setelah ini baru kita pilih: Express Control Panel atau Vite UI.");
