const fs = require("fs");

const file = "scripts/smartwork-phase5zd-phone-public-like-submit-proof.mjs";
let s = fs.readFileSync(file, "utf8");

const oldBlock = `async function browserFetchJson(page, url, options = {}) {
  return await page.evaluate(async ({ url, options }) => {
    const res = await fetch(url, options);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, json, text };
  }, { url, options });
}`;

const newBlock = `async function browserFetchJson(page, url, options = {}) {
  try {
    return await page.evaluate(async ({ url, options }) => {
      const res = await fetch(url, options);
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return {
        ok: res.ok,
        status: res.status,
        json,
        text,
        verifier: "browser_fetch"
      };
    }, { url, options });
  } catch (browserErr) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}

      return {
        ok: res.ok,
        status: res.status,
        json,
        text,
        verifier: "node_fetch_fallback_after_browser_fetch_failed",
        browserError: String(browserErr?.stack || browserErr)
      };
    } catch (nodeErr) {
      return {
        ok: false,
        status: 0,
        json: null,
        text: "",
        verifier: "node_fetch_fallback_failed",
        browserError: String(browserErr?.stack || browserErr),
        error: String(nodeErr?.stack || nodeErr)
      };
    }
  }
}`;

if (!s.includes(oldBlock)) {
  throw new Error("browserFetchJson old block not found. Refusing blind patch.");
}

s = s.replace(oldBlock, newBlock);
fs.writeFileSync(file, s);

console.log(JSON.stringify({
  ok: true,
  patched: file,
  verifierFallback: "node_fetch_fallback_after_browser_fetch_failed"
}, null, 2));
