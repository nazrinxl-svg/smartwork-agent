import fs from "fs";
import path from "path";
import http from "http";
import { spawn } from "child_process";

const root = process.cwd();
const profileDir = path.join(root, "browser-profile", "chrome");
fs.mkdirSync(profileDir, { recursive: true });

const debugPort = 9222;
const url = "https://siagapendis.kemenag.go.id/login";

function checkChromeDebug() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${debugPort}/json/version`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          data
        });
      });
    });

    req.on("error", () => resolve({ ok: false, data: "" }));
    req.setTimeout(900, () => {
      req.destroy();
      resolve({ ok: false, data: "" });
    });
  });
}

async function main() {
  const active = await checkChromeDebug();

  if (active.ok) {
    console.log("SMARTWORK_BROWSER=CHROME");
    console.log("SMARTWORK_TARGET=SIAGA_PENDIS");
    console.log(`SMARTWORK_DEBUG_PORT=${debugPort}`);
    console.log("SMARTWORK_OPEN_SIAGA=REUSE_EXISTING_CHROME");
    console.log("Chrome debug sudah aktif. Tidak membuka Chrome baru.");
    console.log("Lanjut jalankan: npm run siaga:login-test");
    return;
  }

  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
  ].filter(Boolean);

  const chromePath = candidates.find((p) => fs.existsSync(p));

  if (!chromePath) {
    console.error("SMARTWORK_OPEN_SIAGA=FAILED");
    console.error("Google Chrome tidak ditemukan. Install Chrome atau set CHROME_PATH.");
    process.exit(1);
  }

  const args = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-popup-blocking",
    "--start-maximized",
    url,
  ];

  console.log("SMARTWORK_BROWSER=CHROME");
  console.log("SMARTWORK_TARGET=SIAGA_PENDIS");
  console.log(`SMARTWORK_DEBUG_PORT=${debugPort}`);
  console.log(`SMARTWORK_PROFILE=${profileDir}`);
  console.log("SMARTWORK_OPEN_SIAGA=OK_NEW_CHROME");

  const child = spawn(chromePath, args, {
    detached: true,
    stdio: "ignore",
  });

  child.unref();
}

main().catch((error) => {
  console.error("SMARTWORK_OPEN_SIAGA=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
