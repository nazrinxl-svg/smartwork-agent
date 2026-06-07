import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const root = process.cwd();
const profileDir = path.join(root, "browser-profile", "chrome");
fs.mkdirSync(profileDir, { recursive: true });

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

const url = "https://siagapendis.kemenag.go.id/login";

const args = [
  "--remote-debugging-port=9222",
  `--user-data-dir=${profileDir}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-popup-blocking",
  "--start-maximized",
  url,
];

console.log("SMARTWORK_BROWSER=CHROME");
console.log("SMARTWORK_TARGET=SIAGA_PENDIS");
console.log("SMARTWORK_DEBUG_PORT=9222");
console.log(`SMARTWORK_PROFILE=${profileDir}`);
console.log("SMARTWORK_OPEN_SIAGA=OK");

const child = spawn(chromePath, args, {
  detached: true,
  stdio: "ignore",
});

child.unref();
