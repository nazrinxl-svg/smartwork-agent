import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const shotsDir = path.join(root, "shots");
const reportsDir = path.join(root, "reports");
fs.mkdirSync(shotsDir, { recursive: true });
fs.mkdirSync(reportsDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const allowedHost = "siagapendis.kemenag.go.id";

const targetMonth = "Juni";
const targetYear = "2026";

const report = {
  id: `siaga-select-train-${stamp}`,
  mode: "select-train-form-only",
  dryRun: true,
  targetValues: {
    sekolah: "first valid school",
    bulan: targetMonth,
    tahun: targetYear,
    statusCuti: "Tidak ada cuti"
  },
  steps: [],
  screenshots: []
};

function step(name, status, note = "") {
  report.steps.push({
    time: new Date().toISOString(),
    name,
    status,
    note
  });
  console.log(`${name}: ${status}${note ? " - " + note : ""}`);
}

function safeUrl(url) {
  try {
    return new URL(url).hostname === allowedHost;
  } catch {
    return false;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shot(context, page, name) {
  const file = path.join(shotsDir, `${stamp}-${name}.png`);
  try {
    await page.bringToFront().catch(() => {});
    await page.setViewportSize({ width: 1366, height: 768 }).catch(() => {});
    await wait(300);

    const session = await context.newCDPSession(page);
    const result = await session.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false
    });

    fs.writeFileSync(file, Buffer.from(result.data, "base64"));
    report.screenshots.push(file);
    console.log(`SCREENSHOT=${file}`);
  } catch (error) {
    step(`screenshot_${name}`, "WARN", error.message);
  }
}

async function bodyText(page) {
  return await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
}

async function readSelects(page) {
  return await page.evaluate(() => {
    function visible(el) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 20 && r.height > 10 && s.display !== "none" && s.visibility !== "hidden";
    }

    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    return Array.from(document.querySelectorAll("select"))
      .filter(visible)
      .map((select, index) => {
        const r = select.getBoundingClientRect();
        return {
          index,
          name: select.name || "",
          id: select.id || "",
          value: select.value || "",
          selectedText: clean(select.options[select.selectedIndex]?.textContent || ""),
          box: {
            x: Math.round(r.left),
            y: Math.round(r.top),
            w: Math.round(r.width),
            h: Math.round(r.height)
          },
          options: Array.from(select.options).map((o, optionIndex) => ({
            optionIndex,
            value: o.value,
            text: clean(o.textContent),
            disabled: o.disabled
          }))
        };
      });
  });
}

async function setSelectByIndex(page, index, mode) {
  const result = await page.evaluate(({ index, mode, targetMonth, targetYear }) => {
    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    const selects = Array.from(document.querySelectorAll("select")).filter((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 20 && r.height > 10 && s.display !== "none" && s.visibility !== "hidden";
    });

    const select = selects[index];
    if (!select) {
      return { ok: false, reason: `select index ${index} not found` };
    }

    const options = Array.from(select.options || []);
    let chosen = null;

    if (mode === "school") {
      chosen =
        options.find((o) => /SDN 4 DWI TUNGGAL|SD N 4 DWI TUNGGAL|SD NEGERI 4 DWI TUNGGAL|DWI TUNGGAL/i.test(clean(o.textContent))) ||
        options.find((o) => o.value && !/Pilih|--|Select/i.test(clean(o.textContent)));
    }

    if (mode === "month") {
      chosen = options.find((o) => clean(o.textContent).toLowerCase() === targetMonth.toLowerCase());
    }

    if (mode === "year") {
      chosen = options.find((o) => clean(o.textContent) === targetYear || String(o.value) === targetYear);
    }

    if (!chosen) {
      return {
        ok: false,
        reason: `option not found for ${mode}`,
        options: options.map((o) => clean(o.textContent))
      };
    }

    select.focus();
    select.value = chosen.value;
    select.selectedIndex = options.indexOf(chosen);

    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));

    if (window.jQuery) {
      window.jQuery(select).val(chosen.value).trigger("change");
    }

    return {
      ok: true,
      mode,
      value: chosen.value,
      text: clean(chosen.textContent),
      selectedIndex: select.selectedIndex
    };
  }, { index, mode, targetMonth, targetYear });

  step(`set_${mode}`, result.ok ? "OK" : "FAILED", result.ok ? result.text : result.reason);
  return result;
}

async function chooseNoCuti(page) {
  const result = await page.evaluate(() => {
    function clean(t) {
      return String(t || "").replace(/\s+/g, " ").trim();
    }

    const labels = Array.from(document.querySelectorAll("label, span, div"));
    const label = labels.find((el) => /Tidak ada cuti/i.test(clean(el.innerText || el.textContent)));

    const radios = Array.from(document.querySelectorAll('input[type="radio"]'));

    if (label) {
      const inside = label.querySelector('input[type="radio"]');
      if (inside) {
        inside.checked = true;
        inside.dispatchEvent(new Event("input", { bubbles: true }));
        inside.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, method: "inside label" };
      }

      const lr = label.getBoundingClientRect();
      const near = radios
        .map((r) => {
          const rr = r.getBoundingClientRect();
          return {
            radio: r,
            score: Math.abs((rr.top + rr.height / 2) - (lr.top + lr.height / 2))
          };
        })
        .sort((a, b) => a.score - b.score)[0]?.radio;

      if (near) {
        near.checked = true;
        near.dispatchEvent(new Event("input", { bubbles: true }));
        near.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, method: "near label" };
      }
    }

    if (radios[0]) {
      radios[0].checked = true;
      radios[0].dispatchEvent(new Event("input", { bubbles: true }));
      radios[0].dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true, method: "first radio fallback" };
    }

    return { ok: false, method: "radio not found" };
  });

  step("set_status_cuti", result.ok ? "OK" : "FAILED", result.method);
  return result.ok;
}

async function writeReport(page) {
  const jsonFile = path.join(reportsDir, `${stamp}-siaga-select-train.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-select-train.md`);

  report.finalUrl = page.url();
  report.bodyPreview = (await bodyText(page)).slice(0, 1600);
  report.selectsAfter = await readSelects(page);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(mdFile, [
    "# SIAGA Select Trainer",
    "",
    `- Result: ${report.result}`,
    `- Target Bulan: ${targetMonth}`,
    `- Target Tahun: ${targetYear}`,
    "- Simpan: tidak diklik",
    "",
    "## Steps",
    ...report.steps.map((s) => `- ${s.name}: ${s.status}${s.note ? " — " + s.note : ""}`),
    "",
    "## Screenshots",
    ...report.screenshots.map((s) => `- ${s}`),
    ""
  ].join("\n"), "utf8");

  console.log(`REPORT_JSON=${jsonFile}`);
  console.log(`REPORT_MD=${mdFile}`);
  console.log(`SMARTWORK_SELECT_TRAIN=${report.result}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SIAGA SELECT TRAINER V3 ===");
  console.log(`TARGET_MONTH=${targetMonth}`);
  console.log(`TARGET_YEAR=${targetYear}`);

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const context = browser.contexts()[0] || await browser.newContext();
  const page = context.pages().find((p) => safeUrl(p.url())) || context.pages()[0];

  if (!page) throw new Error("Tab SIAGA tidak ditemukan.");
  await page.bringToFront().catch(() => {});
  await wait(600);

  if (!safeUrl(page.url())) {
    throw new Error(`Domain tidak diizinkan: ${page.url()}`);
  }

  const text = await bodyText(page);

  if (/\/login/i.test(page.url()) || /Masukkan Nomor Akun|Masukan Kata Kunci/i.test(text.slice(0, 1200))) {
    step("page_check", "STOP", "Masih di login. Login dulu.");
    report.result = "STOP_LOGIN_REQUIRED";
    await shot(context, page, "01-login-required");
    await writeReport(page);
    return;
  }

  if (!/Pilih Sekolah|Pilih Bulan|Pilih Tahun|Status Cuti/i.test(text)) {
    step("page_check", "STOP", "Form tambah absensi belum terbuka. Buka tombol Tambah dulu.");
    report.result = "STOP_FORM_NOT_OPEN";
    await shot(context, page, "01-form-not-open");
    await writeReport(page);
    return;
  }

  step("page_check", "OK", "Form tambah absensi terbuka.");
  await shot(context, page, "01-before-select");

  const selectsBefore = await readSelects(page);
  report.selectsBefore = selectsBefore;
  step("select_count", selectsBefore.length >= 3 ? "OK" : "WARN", String(selectsBefore.length));

  console.log("=== SELECT OPTIONS DETECTED ===");
  selectsBefore.forEach((s) => {
    console.log(`SELECT[${s.index}] name=${s.name} id=${s.id} selected=${s.selectedText}`);
    s.options.forEach((o) => console.log(`  - [${o.optionIndex}] value=${o.value} text=${o.text}`));
  });

  const school = await setSelectByIndex(page, 0, "school");
  await wait(500);

  const month = await setSelectByIndex(page, 1, "month");
  await wait(500);

  const year = await setSelectByIndex(page, 2, "year");
  await wait(500);

  const cuti = await chooseNoCuti(page);
  await wait(800);

  await shot(context, page, "02-after-select-no-save");

  if (school.ok && month.ok && year.ok && cuti) {
    step("final", "OK", "Semua pilihan terisi. Tombol Simpan tidak diklik.");
    report.result = "OK_SELECTED_NO_SAVE";
  } else {
    step("final", "WARN", `school=${school.ok}, month=${month.ok}, year=${year.ok}, cuti=${cuti}`);
    report.result = "WARN_SELECTED_PARTIAL_NO_SAVE";
  }

  await writeReport(page);
}

main().catch((error) => {
  console.error("SMARTWORK_SELECT_TRAIN=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
