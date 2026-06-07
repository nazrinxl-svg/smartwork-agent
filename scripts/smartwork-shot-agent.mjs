import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const CDP_URL = process.env.SMARTWORK_CDP || "http://127.0.0.1:9222";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const shotPath = path.join("shots", `smartwork-shot-${stamp}.png`);
const reportPath = path.join("reports", `smartwork-shot-${stamp}.json`);

fs.mkdirSync("shots", { recursive: true });
fs.mkdirSync("reports", { recursive: true });

const browser = await chromium.connectOverCDP(CDP_URL).catch(() => null);

if (!browser) {
  console.log("SMARTWORK_SHOT=CDP_NOT_CONNECTED");
  process.exit(2);
}

let page = null;

for (const context of browser.contexts()) {
  for (const p of context.pages()) {
    if (!page || p.url().includes("localhost:5173") || p.url().includes("127.0.0.1")) {
      page = p;
    }
  }
}

if (!page) {
  console.log("SMARTWORK_SHOT=NO_PAGE");
  await browser.close();
  process.exit(3);
}

await page.bringToFront();

const target = page.locator("main").first();

await target.screenshot({ path: shotPath }).catch(async () => {
  await page.screenshot({ path: shotPath, fullPage: true });
});

const title = await page.title().catch(() => "");
const url = page.url();

fs.writeFileSync(reportPath, JSON.stringify({
  createdAt: new Date().toISOString(),
  title,
  url,
  shotPath
}, null, 2));

console.log("SMARTWORK_SHOT=OK");
console.log(`SHOT=${shotPath}`);
console.log(`REPORT=${reportPath}`);

await browser.close();