import { chromium } from "playwright";

async function main() {
  console.log("SMARTWORK_REPAIR=MAXIMIZE_CHROME_WINDOW_ONLY");
  console.log("RULE=NO_INPUT_NO_SAVE_NO_ZOOM_NO_VIEWPORT_CHANGE");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id")) ||
    context.pages().find(p => !p.url().startsWith("chrome://")) ||
    context.pages()[0];

  if (!page) throw new Error("STOP: Tab tidak ditemukan.");

  await page.bringToFront();

  const session = await context.newCDPSession(page);
  const win = await session.send("Browser.getWindowForTarget");

  await session.send("Browser.setWindowBounds", {
    windowId: win.windowId,
    bounds: {
      windowState: "maximized"
    }
  });

  await page.waitForTimeout(700);

  console.log(`CURRENT_URL=${page.url()}`);
  console.log("SMARTWORK_MAXIMIZE_CHROME_WINDOW=OK");
}

main().catch(error => {
  console.error("SMARTWORK_MAXIMIZE_CHROME_WINDOW=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
