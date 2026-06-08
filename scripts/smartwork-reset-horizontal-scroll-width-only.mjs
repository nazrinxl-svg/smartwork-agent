import { chromium } from "playwright";

async function main() {
  console.log("SMARTWORK_REPAIR=RESET_HORIZONTAL_SCROLL_WIDTH_ONLY");
  console.log("RULE=NO_INPUT_NO_SAVE_NO_ZOOM_NO_VIEWPORT_SET");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find(p => p.url().includes("siagapendis.kemenag.go.id")) ||
    context.pages().find(p => !p.url().startsWith("chrome://")) ||
    context.pages()[0];

  if (!page) throw new Error("STOP: Tab SIAGA tidak ditemukan.");

  await page.bringToFront();

  const session = await context.newCDPSession(page);

  // Bersihkan sisa emulation, tapi tidak set viewport baru.
  await session.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 }).catch(() => {});

  const before = await page.evaluate(() => ({
    url: location.href,
    innerWidth: window.innerWidth,
    outerWidth: window.outerWidth,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    docScrollLeft: document.documentElement.scrollLeft,
    bodyScrollLeft: document.body.scrollLeft,
    docClientWidth: document.documentElement.clientWidth,
    bodyClientWidth: document.body.clientWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    htmlZoom: document.documentElement.style.zoom || "",
    bodyZoom: document.body.style.zoom || ""
  }));

  console.log("BEFORE_REPAIR=" + JSON.stringify(before, null, 2));

  await page.evaluate(() => {
    // Reset zoom/style buatan script sebelumnya kalau masih ada.
    document.documentElement.style.zoom = "";
    document.body.style.zoom = "";
    document.documentElement.style.transform = "";
    document.body.style.transform = "";

    // Reset horizontal scroll halaman utama.
    window.scrollTo(0, 0);
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;

    // Reset semua container yang mungkin ke-scroll ke kanan.
    for (const el of document.querySelectorAll("*")) {
      try {
        if (el.scrollLeft && el.scrollLeft !== 0) {
          el.scrollLeft = 0;
        }
      } catch {}
    }
  });

  await page.waitForTimeout(700);

  const after = await page.evaluate(() => ({
    url: location.href,
    innerWidth: window.innerWidth,
    outerWidth: window.outerWidth,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    docScrollLeft: document.documentElement.scrollLeft,
    bodyScrollLeft: document.body.scrollLeft,
    docClientWidth: document.documentElement.clientWidth,
    bodyClientWidth: document.body.clientWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    htmlZoom: document.documentElement.style.zoom || "",
    bodyZoom: document.body.style.zoom || ""
  }));

  console.log("AFTER_REPAIR=" + JSON.stringify(after, null, 2));
  console.log("SMARTWORK_RESET_HORIZONTAL_SCROLL_WIDTH=OK");
}

main().catch(error => {
  console.error("SMARTWORK_RESET_HORIZONTAL_SCROLL_WIDTH=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
