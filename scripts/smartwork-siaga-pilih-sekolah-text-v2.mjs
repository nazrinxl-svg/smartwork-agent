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
const TARGET_SCHOOL = "SDN 4 DWI TUNGGAL";

const report = {
  id: `siaga-pilih-sekolah-text-v2-${stamp}`,
  mode: "pilih-sekolah-by-text-v2-only",
  target: {
    sekolah: TARGET_SCHOOL
  },
  safety: {
    noLogin: true,
    noDashboard: true,
    noTambah: true,
    noSave: true,
    noSubmit: true,
    noDelete: true,
    noSend: true,
    noArrowDown: true
  },
  steps: [],
  screenshots: []
};

function step(name, status, note = "") {
  report.steps.push({ time: new Date().toISOString(), name, status, note });
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

async function bodyText(page) {
  return await page.locator("body").innerText({ timeout: 10000 }).catch(() => "");
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

async function debugState(page, title) {
  const data = await page.evaluate(() => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    function visible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    }

    const selects = Array.from(document.querySelectorAll("select"))
      .filter(visible)
      .map((select, index) => ({
        index,
        name: select.name || "",
        id: select.id || "",
        value: select.value || "",
        selectedText: clean(select.options[select.selectedIndex]?.textContent || ""),
        options: Array.from(select.options || []).map((o, optionIndex) => ({
          optionIndex,
          value: o.value,
          text: clean(o.textContent),
          disabled: o.disabled
        }))
      }));

    const body = clean(document.body.innerText || "");

    return {
      url: location.href,
      bodyPreview: body.slice(0, 1800),
      selects
    };
  });

  report[title] = data;

  console.log(`\n=== ${title} ===`);
  console.log(`URL=${data.url}`);
  data.selects.forEach((s) => {
    console.log(`SELECT[${s.index}] name=${s.name} id=${s.id} selected="${s.selectedText}" value="${s.value}"`);
  });

  return data;
}

async function pilihSekolahByText(page) {
  return await page.evaluate(async ({ TARGET_SCHOOL }) => {
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    function visible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    }

    function centerClick(el) {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;

      const opts = {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        view: window
      };

      el.dispatchEvent(new MouseEvent("mouseover", opts));
      el.dispatchEvent(new MouseEvent("mousemove", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
    }

    const bodyText = clean(document.body.innerText || "");

    if (!/Sekolah/i.test(bodyText) || !/Bulan/i.test(bodyText) || !/Tahun/i.test(bodyText) || !/Simpan/i.test(bodyText)) {
      return {
        ok: false,
        step: "form_check",
        reason: "Form Tambah Absensi belum terlihat"
      };
    }

    // 1) Coba kalau ternyata ada native select sekolah yang tersembunyi/terlihat.
    const selects = Array.from(document.querySelectorAll("select")).filter(visible);

    const schoolSelect = selects.find((select) => {
      const optionsText = Array.from(select.options || []).map(o => clean(o.textContent)).join(" ");
      return /sekolah|school/i.test(`${select.name || ""} ${select.id || ""}`) ||
        /SDN 4 DWI TUNGGAL|DWI TUNGGAL|Pilih Sekolah/i.test(optionsText);
    });

    if (schoolSelect) {
      const options = Array.from(schoolSelect.options || []);
      const chosen =
        options.find(o => !o.disabled && clean(o.textContent).toUpperCase() === TARGET_SCHOOL.toUpperCase()) ||
        options.find(o => !o.disabled && /DWI TUNGGAL|SDN 4/i.test(clean(o.textContent))) ||
        options.find(o => !o.disabled && o.value && !/Pilih|Select|--/i.test(clean(o.textContent)));

      if (chosen) {
        schoolSelect.focus();
        schoolSelect.value = chosen.value;
        schoolSelect.selectedIndex = options.indexOf(chosen);
        schoolSelect.dispatchEvent(new Event("input", { bubbles: true }));
        schoolSelect.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(600);

        return {
          ok: true,
          method: "native_select_school",
          value: chosen.value,
          text: clean(chosen.textContent),
          selectedIndex: schoolSelect.selectedIndex
        };
      }
    }

    // 2) Kalau sekolah bukan native select, klik teks SDN 4 DWI TUNGGAL di blok Sekolah.
    const candidates = Array.from(document.querySelectorAll("label, div, span, p, button, a, li"))
      .filter(visible)
      .map(el => {
        const r = el.getBoundingClientRect();
        return {
          el,
          text: clean(el.innerText || el.textContent),
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          area: r.width * r.height
        };
      })
      .filter(item => {
        return item.text.includes("SDN 4 DWI TUNGGAL") ||
          item.text.includes("SDN 4") ||
          item.text.includes("DWI TUNGGAL");
      })
      .sort((a, b) => a.area - b.area);

    if (!candidates.length) {
      return {
        ok: false,
        step: "find_school_text",
        reason: "Teks SDN 4 DWI TUNGGAL tidak ditemukan sebagai elemen klik",
        bodyPreview: bodyText.slice(0, 1200)
      };
    }

    const target = candidates[0];
    target.el.scrollIntoView({ block: "center", inline: "center" });
    await sleep(300);
    centerClick(target.el);
    await sleep(800);

    return {
      ok: true,
      method: "clicked_visible_school_text",
      text: target.text,
      box: {
        x: target.x,
        y: target.y,
        w: target.w,
        h: target.h
      }
    };
  }, { TARGET_SCHOOL });
}

async function writeReport(page) {
  report.finalUrl = page.url();
  report.bodyPreview = (await bodyText(page)).slice(0, 1800);

  const jsonFile = path.join(reportsDir, `${stamp}-siaga-pilih-sekolah-text-v2.json`);
  const mdFile = path.join(reportsDir, `${stamp}-siaga-pilih-sekolah-text-v2.md`);

  fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2), "utf8");

  fs.writeFileSync(mdFile, [
    "# SIAGA Pilih Sekolah Text V2",
    "",
    `- Result: ${report.result}`,
    "- Login: tidak dilakukan",
    "- Dashboard/Tambah: tidak diklik",
    "- ArrowDown: tidak dipakai",
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
  console.log(`SMARTWORK_PILIH_SEKOLAH_TEXT_V2=${report.result}`);
  console.log("SMARTWORK_BROWSER_LEFT_OPEN=TRUE");
}

async function main() {
  console.log("=== SIAGA PILIH SEKOLAH BY TEXT V2 ===");
  console.log("Target: SDN 4 DWI TUNGGAL");
  console.log("Safety: NO LOGIN, NO DASHBOARD, NO TAMBAH, NO ARROWDOWN, NO SAVE");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 0 });
  const context = browser.contexts()[0] || await browser.newContext();

  const page =
    context.pages().find((p) => p.url().includes("/guru/absensi/create")) ||
    context.pages().find((p) => safeUrl(p.url())) ||
    context.pages()[0];

  if (!page) throw new Error("Tab SIAGA tidak ditemukan.");

  await page.bringToFront().catch(() => {});
  await wait(700);

  const currentUrl = page.url();
  console.log(`CURRENT_URL=${currentUrl}`);

  if (!currentUrl.includes("/guru/absensi/create")) {
    step("page_check", "STOP", "Belum di form Tambah Absensi. Agent ini tidak login/dashboard/tambah ulang.");
    await shot(context, page, "01-not-form");
    report.result = "STOP_NOT_FORM";
    await writeReport(page);
    return;
  }

  const text = await bodyText(page);

  if (!/Sekolah|Bulan|Tahun|Status Cuti|Simpan/i.test(text)) {
    step("page_check", "STOP", "Form Tambah Absensi belum terlihat.");
    await shot(context, page, "01-not-form-visible");
    report.result = "STOP_FORM_NOT_VISIBLE";
    await writeReport(page);
    return;
  }

  step("page_check", "OK", "Form Tambah Absensi terlihat.");
  await shot(context, page, "01-before-pilih-sekolah-text-v2");

  await debugState(page, "before_pilih_sekolah_text_v2");

  const result = await pilihSekolahByText(page);

  if (result.ok) {
    step("pilih_sekolah_text_v2", "OK", `${result.method}: ${result.text || result.value || ""}`);
  } else {
    step("pilih_sekolah_text_v2", "FAILED", `${result.step || ""} ${result.reason || ""}`);
  }

  await wait(1000);

  const after = await debugState(page, "after_pilih_sekolah_text_v2");
  await shot(context, page, "02-after-pilih-sekolah-text-v2-no-save");

  const afterBody = after.bodyPreview || "";

  const schoolVisible = /SDN 4 DWI TUNGGAL/i.test(afterBody);

  if (result.ok && schoolVisible) {
    step("final", "OK", "Sekolah SDN 4 DWI TUNGGAL terlihat/terklik. Simpan tidak diklik.");
    report.result = "OK_SEKOLAH_TEXT_SELECTED_NO_SAVE";
    report.resultDetail = result;
  } else {
    step("final", "WARN", "Sekolah belum bisa diverifikasi terpilih. Simpan tidak diklik.");
    report.result = "WARN_SEKOLAH_TEXT_NOT_VERIFIED_NO_SAVE";
    report.resultDetail = result;
  }

  await writeReport(page);
}

main().catch((error) => {
  console.error("SMARTWORK_PILIH_SEKOLAH_TEXT_V2=FAILED");
  console.error(error.stack || error.message);
  process.exit(1);
});
