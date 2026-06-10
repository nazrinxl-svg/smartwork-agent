import fs from "fs";
import path from "path";

const file = path.join(process.cwd(), "public", "progress.html");

if (!fs.existsSync(file)) {
  console.log("progress.html not found, skip");
  process.exit(0);
}

let html = fs.readFileSync(file, "utf8");

if (html.includes("smartwork-e2e-progress-bridge.js")) {
  console.log("PROGRESS_BRIDGE=already_present");
  process.exit(0);
}

const tag = '<script src="./smartwork-e2e-progress-bridge.js"></script>';

if (html.includes("</body>")) {
  html = html.replace("</body>", `  ${tag}\n</body>`);
} else {
  html += `\n${tag}\n`;
}

fs.writeFileSync(file, html, "utf8");

console.log("PROGRESS_BRIDGE=injected");
