import { chromium } from "playwright";

async function main() {
  console.log("SMARTWORK_REPAIR=SET_SIAGA_ZOOM_80");
  console.log("RULE=NO_INPUT_NO_SAVE_NO_VIEWPORT_CHANGE");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id")) ||
    context.pages().find(p => !p.url().startsWith("chrome://")) ||
    context.pages()[0];

  if (!page) throw new Error("STOP: Tab SIAGA tidak ditemukan.");

  await page.bringToFront();
  await page.waitForTimeout(300);

  const session = await context.newCDPSession(page);

  // Tidak ubah viewport, hanya scale halaman.
  await session.send("Emulation.setPageScaleFactor", {
    pageScaleFactor: 0.8
  }).catch(() => {});

  // Fallback CSS zoom kalau Chrome CDP tidak menempel.
  await page.evaluate(() => {
    document.documentElement.style.zoom = "80%";
    document.body.style.zoom = "80%";
  }).catch(() => {});

  await page.waitForTimeout(500);

  console.log(`CURRENT_URL=${page.url()}`);
  console.log("SMARTWORK_SET_ZOOM_80=OK_NO_INPUT_NO_SAVE");
}

main().catch(error => {
  console.error("SMARTWORK_SET_ZOOM_80=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
