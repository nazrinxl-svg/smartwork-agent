import { chromium } from "playwright";

async function main() {
  console.log("SMARTWORK_REPAIR=CLEAR_AGENT_ZOOM_ONLY");
  console.log("RULE=NO_INPUT_NO_SAVE_NO_FORM_CHANGE");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id")) ||
    context.pages().find(p => !p.url().startsWith("chrome://")) ||
    context.pages()[0];

  if (!page) throw new Error("STOP: Tab tidak ditemukan.");

  await page.bringToFront();
  const session = await context.newCDPSession(page);

  // Bersihkan perubahan tampilan dari agent.
  await session.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 }).catch(() => {});

  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
    document.body.style.zoom = "";
    document.documentElement.style.transform = "";
    document.body.style.transform = "";
  }).catch(() => {});

  await page.waitForTimeout(500);

  console.log(`CURRENT_URL=${page.url()}`);
  console.log("SMARTWORK_CLEAR_AGENT_ZOOM=OK");
}

main().catch(error => {
  console.error("SMARTWORK_CLEAR_AGENT_ZOOM=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
