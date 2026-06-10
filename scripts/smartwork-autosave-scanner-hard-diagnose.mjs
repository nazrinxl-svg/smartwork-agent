import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const out = path.join(ROOT, "reports", "autosave-scanner-hard-diagnose.json");
const shot = path.join(ROOT, "shots", `${new Date().toISOString().replace(/[:.]/g, "-")}-autosave-scanner-hard-diagnose.png`);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
}

function latestRequest() {
  const dir = path.join(ROOT, "intake", "requests");
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => ({ f, p: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a,b) => b.t - a.t)[0];
}

const latest = latestRequest();
const req = readJson(latest.p);
const account = req.accounts?.[0] || {};
const teacherId = account.teacherId || "guru-001";
const detailUrl = account.detailUrl || req.targetDetailUrl;

const browser = await chromium.launchPersistentContext(
  path.join(ROOT, "browser-profile", `${teacherId}-siaga`),
  { headless: false, viewport: null }
);

const page = browser.pages()[0] || await browser.newPage();

const logs = [];
page.on("framenavigated", frame => {
  if (frame === page.mainFrame()) logs.push({ type: "nav", url: frame.url(), at: new Date().toISOString() });
});

await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(e => {
  logs.push({ type: "goto_error", error: e.message });
});
await page.waitForTimeout(5000);

fs.mkdirSync(path.dirname(shot), { recursive: true });
await page.screenshot({ path: shot, fullPage: true }).catch(() => {});

const state = await page.evaluate(() => {
  const clean = v => String(v || "").replace(/\s+/g, " ").trim();
  const body = clean(document.body?.innerText || "");
  const rows = Array.from(document.querySelectorAll("table tbody tr, table tr")).map((tr, index) => ({
    index,
    text: clean(tr.innerText || tr.textContent || ""),
    cells: Array.from(tr.querySelectorAll("td, th")).map(td => clean(td.innerText || td.textContent || "")),
    links: Array.from(tr.querySelectorAll("a,button,input[type='button'],input[type='submit']")).map(a => ({
      tag: a.tagName,
      text: clean(a.innerText || a.textContent || a.value || ""),
      href: a.href || "",
      className: a.className || ""
    }))
  }));

  return {
    url: location.href,
    title: document.title,
    bodyLength: body.length,
    bodyPreview: body.slice(0, 2000),
    tableCount: document.querySelectorAll("table").length,
    rowCount: rows.length,
    rows: rows.slice(0, 80),
    hasAbsensiTitle: /Absensi/i.test(body),
    hasDetailAbsensi: /Detail Absensi/i.test(body),
    hasTambah: /Tambah/i.test(body),
    hasInput: /Input/i.test(body),
    hasLogin: /login|username|password|masuk/i.test(body)
  };
});

const report = {
  ok: true,
  requestFile: latest.f,
  teacherId,
  detailUrl,
  shot: path.relative(ROOT, shot).replaceAll("\\", "/"),
  logs,
  state,
  createdAt: new Date().toISOString()
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");

console.log("REPORT=" + out);
console.log("SHOT=" + shot);
console.log(JSON.stringify({
  url: state.url,
  title: state.title,
  bodyLength: state.bodyLength,
  tableCount: state.tableCount,
  rowCount: state.rowCount,
  hasDetailAbsensi: state.hasDetailAbsensi,
  hasTambah: state.hasTambah,
  hasLogin: state.hasLogin,
  firstRows: state.rows.slice(0, 8).map(r => r.text)
}, null, 2));

await browser.close();
