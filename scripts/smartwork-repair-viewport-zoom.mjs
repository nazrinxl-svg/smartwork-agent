import { chromium } from "playwright";

async function main() {
  console.log("SMARTWORK_REPAIR=RESET_VIEWPORT_ZOOM");
  console.log("RULE=NO_INPUT_NO_SAVE");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id")) ||
    context.pages().find(p => !p.url().startsWith("chrome://")) ||
    context.pages()[0];

  if (!page) throw new Error("Tab tidak ditemukan.");

  await page.bringToFront();

  const session = await context.newCDPSession(page);

  await session.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 }).catch(() => {});

  await page.keyboard.press("Control+0").catch(() => {});
  await page.evaluate(() => {
    document.body.style.zoom = "";
    document.documentElement.style.zoom = "";
  }).catch(() => {});

  await page.waitForTimeout(800);

  console.log(`CURRENT_URL=${page.url()}`);
  console.log("SMARTWORK_REPAIR_VIEWPORT_ZOOM=OK");
}

main().catch(err => {
  console.error("SMARTWORK_REPAIR_VIEWPORT_ZOOM=FAILED");
  console.error(err.stack || err.message);
  process.exit(1);
});
