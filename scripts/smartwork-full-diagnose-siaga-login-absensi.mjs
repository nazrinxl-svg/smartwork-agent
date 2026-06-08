import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
const shotsDir = path.join(root, "shots");

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(reportsDir, `${stamp}-full-diagnose-siaga-login-absensi.json`);
const shotPath = path.join(shotsDir, `${stamp}-full-diagnose-siaga-login-absensi.png`);

const CDP_URL = "http://127.0.0.1:9222";
const HOST = "siagapendis.kemenag.go.id";

function readEnvKeys() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) {
    return { exists: false, keys: [] };
  }

  const text = fs.readFileSync(envPath, "utf8");
  const keys = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();

    keys.push({
      key,
      hasValue: Boolean(value),
      valueLength: value.length
    });
  }

  return { exists: true, keys };
}

function listFiles(dir, pattern) {
  const targetDir = path.join(root, dir);
  if (!fs.existsSync(targetDir)) return [];

  return fs.readdirSync(targetDir)
    .filter(name => pattern.test(name))
    .map(name => {
      const full = path.join(targetDir, name);
      const st = fs.statSync(full);
      return {
        name,
        size: st.size,
        modified: st.mtime.toISOString()
      };
    })
    .sort((a, b) => String(b.modified).localeCompare(String(a.modified)))
    .slice(0, 25);
}

async function safePageInfo(page, index) {
  const url = page.url();

  let title = "";
  let bodyText = "";
  let formState = null;

  try {
    title = await page.title();
  } catch {}

  try {
    bodyText = await page.locator("body").innerText({ timeout: 5000 });
  } catch {}

  try {
    formState = await page.evaluate(() => {
      const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

      const inputs = Array.from(document.querySelectorAll("input")).map((i, idx) => ({
        index: idx,
        type: i.type || "",
        name: i.name || "",
        id: i.id || "",
        className: String(i.className || ""),
        placeholder: i.placeholder || "",
        valueLength: String(i.value || "").length,
        checked: Boolean(i.checked)
      }));

      const selects = Array.from(document.querySelectorAll("select")).map((s, idx) => ({
        index: idx,
        name: s.name || "",
        id: s.id || "",
        className: String(s.className || ""),
        value: s.value || "",
        selectedText: clean(s.options[s.selectedIndex]?.textContent || ""),
        options: Array.from(s.options || []).map((o, optionIndex) => ({
          optionIndex,
          value: o.value,
          text: clean(o.textContent),
          selected: Boolean(o.selected),
          disabled: Boolean(o.disabled)
        }))
      }));

      const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], a")).slice(0, 80).map((b, idx) => ({
        index: idx,
        tag: b.tagName,
        type: b.getAttribute("type") || "",
        text: clean(b.innerText || b.value || b.textContent),
        href: b.getAttribute("href") || ""
      }));

      return {
        location: location.href,
        hasLoginText: /Masuk|Login|Nomor Akun|Kata Kunci|Password|Masukkan/i.test(clean(document.body.innerText || "")),
        hasDashboardText: /Dashboard|Portofolio|Status Pegawai|Absensi|Logout/i.test(clean(document.body.innerText || "")),
        hasAbsensiFormText: /Sekolah|Bulan|Tahun|Status Cuti|Simpan/i.test(clean(document.body.innerText || "")),
        inputs,
        selects,
        buttons
      };
    });
  } catch (error) {
    formState = { error: error.message };
  }

  return {
    index,
    url,
    title,
    bodyPreview: String(bodyText || "").replace(/\s+/g, " ").trim().slice(0, 2000),
    formState
  };
}

async function main() {
  console.log("SMARTWORK_DIAGNOSE=FULL_SIAGA_LOGIN_ABSENSI");
  console.log("RULE=DIAGNOSE_ONLY_NO_LOGIN_SUBMIT_NO_SAVE");

  const result = {
    createdAt: new Date().toISOString(),
    cwd: root,
    env: readEnvKeys(),
    files: {
      scripts: listFiles("scripts", /siaga|smartwork|login|absensi|bulan|tahun|sekolah|cuti/i),
      reports: listFiles("reports", /siaga|login|absensi|bulan|tahun|sekolah|cuti|diagnose|final/i),
      shots: listFiles("shots", /siaga|login|absensi|bulan|tahun|sekolah|cuti|diagnose|final/i)
    },
    cdp: null,
    pages: [],
    screenshot: shotPath
  };

  console.log("STEP=CHECK_CDP_VERSION");

  try {
    const versionRes = await fetch(`${CDP_URL}/json/version`);
    result.cdp = {
      ok: versionRes.ok,
      status: versionRes.status,
      version: versionRes.ok ? await versionRes.json() : null
    };
  } catch (error) {
    result.cdp = {
      ok: false,
      error: error.message
    };
  }

  console.log("CDP=" + JSON.stringify(result.cdp, null, 2));

  if (!result.cdp.ok) {
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), "utf8");
    console.log(`REPORT=${reportPath}`);
    throw new Error("STOP: Chrome debug 9222 tidak aktif. Jalankan npm run open:siaga dulu.");
  }

  console.log("STEP=CONNECT_CDP");
  const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 0 });
  const contexts = browser.contexts();

  result.contextCount = contexts.length;

  const pages = contexts
    .flatMap(ctx => ctx.pages())
    .filter(p => !p.url().startsWith("chrome://"));

  result.pageCount = pages.length;

  console.log(`CONTEXT_COUNT=${result.contextCount}`);
  console.log(`PAGE_COUNT=${result.pageCount}`);

  for (let i = 0; i < pages.length; i++) {
    const info = await safePageInfo(pages[i], i);
    result.pages.push(info);

    console.log(`\n=== PAGE[${i}] ===`);
    console.log(`URL=${info.url}`);
    console.log(`TITLE=${info.title}`);
    console.log(`BODY=${info.bodyPreview.slice(0, 500)}`);

    if (info.formState) {
      console.log(`HAS_LOGIN=${info.formState.hasLoginText}`);
      console.log(`HAS_DASHBOARD=${info.formState.hasDashboardText}`);
      console.log(`HAS_ABSENSI_FORM=${info.formState.hasAbsensiFormText}`);

      console.log("INPUTS=");
      for (const input of info.formState.inputs || []) {
        console.log(`  [${input.index}] type="${input.type}" name="${input.name}" id="${input.id}" placeholder="${input.placeholder}" valueLength=${input.valueLength} checked=${input.checked}`);
      }

      console.log("SELECTS=");
      for (const select of info.formState.selects || []) {
        console.log(`  [${select.index}] name="${select.name}" class="${select.className}" value="${select.value}" selected="${select.selectedText}"`);
      }

      console.log("BUTTONS/LINKS=");
      for (const b of (info.formState.buttons || []).slice(0, 35)) {
        console.log(`  [${b.index}] ${b.tag} type="${b.type}" text="${b.text}" href="${b.href}"`);
      }
    }
  }

  const siagaPage =
    pages.find(p => p.url().includes(HOST)) ||
    pages[0];

  if (siagaPage) {
    await siagaPage.bringToFront().catch(() => {});
    await siagaPage.waitForTimeout(300);
    await siagaPage.screenshot({ path: shotPath, fullPage: false }).catch(error => {
      result.screenshotError = error.message;
    });
  }

  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), "utf8");

  console.log(`\nREPORT=${reportPath}`);
  console.log(`SCREENSHOT=${shotPath}`);

  const currentSiaga = result.pages.find(p => p.url.includes(HOST));
  if (!currentSiaga) {
    console.log("DIAGNOSE_RESULT=NO_SIAGA_TAB");
  } else if (currentSiaga.formState?.hasAbsensiFormText) {
    console.log("DIAGNOSE_RESULT=ON_ABSENSI_FORM");
  } else if (currentSiaga.formState?.hasDashboardText) {
    console.log("DIAGNOSE_RESULT=ON_DASHBOARD");
  } else if (currentSiaga.formState?.hasLoginText) {
    console.log("DIAGNOSE_RESULT=ON_LOGIN_PAGE");
  } else {
    console.log("DIAGNOSE_RESULT=UNKNOWN_SIAGA_STATE");
  }

  console.log("SMARTWORK_FULL_DIAGNOSE_SIAGA=OK");
}

main().catch(error => {
  console.error("SMARTWORK_FULL_DIAGNOSE_SIAGA=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
