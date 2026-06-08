import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
const downloadsDir = path.join(reportsDir, "downloads");
const shotsDir = path.join(root, "shots");
const profileRoot = path.join(root, "browser-profile", "parallel-siaga-real");

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const TARGET_TEACHER_ID = process.env.TARGET_TEACHER_ID || "guru-001";
const TARGET_TEACHER_NAME = process.env.TARGET_TEACHER_NAME || "Nazrin";
const TARGET_MONTH = process.env.TARGET_MONTH || "Juni";
const TARGET_YEAR = String(process.env.TARGET_YEAR || "2026");
const ABSENSI_URL = process.env.ABSENSI_URL || "https://siagapendis.kemenag.go.id/guru/absensi";

const reportPath = path.join(reportsDir, "siaga-job-download-presensi-pdf-report.json");

function now() {
  return new Date().toISOString();
}

function safeName(value) {
  return String(value || "siaga-presensi")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 140);
}

async function waitAbsensiListReady(page, log) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(ABSENSI_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);

    const state = await page.evaluate(({ TARGET_MONTH, TARGET_YEAR }) => {
      const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
      const bodyText = clean(document.body?.innerText || "");
      const rows = Array.from(document.querySelectorAll("table tbody tr, table tr")).map((tr, index) => ({
        index,
        text: clean(tr.innerText || tr.textContent)
      }));

      const hasTargetRow = rows.some((r) =>
        new RegExp(`\\b${TARGET_MONTH}\\b`, "i").test(r.text) &&
        new RegExp(`\\b${TARGET_YEAR}\\b`).test(r.text)
      );

      return {
        ok: bodyText.length > 100 && /Absensi|Presensi/i.test(bodyText) && hasTargetRow,
        bodyLength: bodyText.length,
        hasTargetRow,
        rowCount: rows.length,
        bodyPreview: bodyText.slice(0, 1000),
        url: location.href
      };
    }, { TARGET_MONTH, TARGET_YEAR });

    log.push(`[${now()}] WAIT_ABSENSI_LIST_ATTEMPT_${attempt}=${JSON.stringify(state)}`);

    if (state.ok) return state;

    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1500);
  }

  return { ok: false, reason: "absensi_list_not_ready", url: page.url() };
}

async function markTargetUnduh(page) {
  return await page.evaluate(({ TARGET_MONTH, TARGET_YEAR }) => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    document
      .querySelectorAll("[data-smartwork-unduh-presensi-target]")
      .forEach((el) => el.removeAttribute("data-smartwork-unduh-presensi-target"));

    const rows = Array.from(document.querySelectorAll("table tbody tr, table tr")).map((tr, index) => {
      const text = clean(tr.innerText || tr.textContent);
      const actions = Array.from(tr.querySelectorAll("a, button")).map((el, actionIndex) => ({
        el,
        actionIndex,
        tag: el.tagName,
        text: clean(el.innerText || el.textContent || el.value),
        href: el.href || el.getAttribute("href") || "",
        className: String(el.className || "")
      }));

      return { tr, index, text, actions };
    });

    const row = rows.find((r) =>
      new RegExp(`\\b${TARGET_MONTH}\\b`, "i").test(r.text) &&
      new RegExp(`\\b${TARGET_YEAR}\\b`).test(r.text)
    );

    if (!row) {
      return {
        ok: false,
        step: "find_target_row",
        reason: `Row ${TARGET_MONTH} ${TARGET_YEAR} tidak ditemukan`,
        rows: rows.map((r) => ({ index: r.index, text: r.text })).slice(0, 30)
      };
    }

    const unduh =
      row.actions.find((a) => /^Unduh$/i.test(a.text)) ||
      row.actions.find((a) => /Unduh/i.test(a.text)) ||
      row.actions.find((a) => /download|unduh/i.test(`${a.text} ${a.href}`));

    if (!unduh) {
      return {
        ok: false,
        step: "find_unduh_button",
        reason: `Tombol Unduh pada row ${TARGET_MONTH} ${TARGET_YEAR} tidak ditemukan`,
        rowText: row.text,
        actions: row.actions.map((a) => ({
          actionIndex: a.actionIndex,
          tag: a.tag,
          text: a.text,
          href: a.href,
          className: a.className
        }))
      };
    }

    unduh.el.setAttribute("data-smartwork-unduh-presensi-target", "1");

    return {
      ok: true,
      step: "marked_unduh_button",
      rowIndex: row.index,
      rowText: row.text,
      target: {
        actionIndex: unduh.actionIndex,
        tag: unduh.tag,
        text: unduh.text,
        href: unduh.href,
        className: unduh.className
      },
      allActions: row.actions.map((a) => ({
        actionIndex: a.actionIndex,
        tag: a.tag,
        text: a.text,
        href: a.href,
        className: a.className
      }))
    };
  }, { TARGET_MONTH, TARGET_YEAR });
}

async function main() {
  console.log("SMARTWORK_SIAGA_DOWNLOAD_PRESENSI_PDF=START");
  console.log("RULE=DOWNLOAD_UNDUH_ONLY_NO_INPUT_NO_SAVE_NO_SUBMIT_NO_DELETE");
  console.log("TARGET_TEACHER_ID=" + TARGET_TEACHER_ID);
  console.log("TARGET_MONTH=" + TARGET_MONTH);
  console.log("TARGET_YEAR=" + TARGET_YEAR);

  const log = [];
  const profileDir = path.join(profileRoot, `${TARGET_TEACHER_ID}-siaga`);

  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
    args: ["--start-maximized"]
  });

  const page = browser.pages()[0] || await browser.newPage();

  const listReady = await waitAbsensiListReady(page, log);

  const beforeShot = path.join(
    shotsDir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${TARGET_TEACHER_ID}-download-presensi-before.png`
  );

  await page.screenshot({ path: beforeShot, fullPage: true });

  if (!listReady.ok) {
    const report = {
      ok: false,
      mode: "siaga-job-download-presensi-pdf",
      rule: "DOWNLOAD_UNDUH_ONLY_NO_INPUT_NO_SAVE_NO_SUBMIT_NO_DELETE",
      targetTeacherId: TARGET_TEACHER_ID,
      targetMonth: TARGET_MONTH,
      targetYear: TARGET_YEAR,
      listReady,
      screenshots: [path.relative(root, beforeShot).replaceAll("\\", "/")],
      summary: { downloaded: 0, saved: 0, submitted: 0, deleted: 0 },
      log,
      endedAt: now()
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.error("SMARTWORK_SIAGA_DOWNLOAD_PRESENSI_PDF=FAILED_LIST_NOT_READY");
    console.error("REPORT=" + reportPath);
    process.exit(1);
  }

  const unduhInfo = await markTargetUnduh(page);

  if (!unduhInfo.ok) {
    const report = {
      ok: false,
      mode: "siaga-job-download-presensi-pdf",
      rule: "DOWNLOAD_UNDUH_ONLY_NO_INPUT_NO_SAVE_NO_SUBMIT_NO_DELETE",
      targetTeacherId: TARGET_TEACHER_ID,
      targetMonth: TARGET_MONTH,
      targetYear: TARGET_YEAR,
      listReady,
      unduhInfo,
      screenshots: [path.relative(root, beforeShot).replaceAll("\\", "/")],
      summary: { downloaded: 0, saved: 0, submitted: 0, deleted: 0 },
      log,
      endedAt: now()
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.error("SMARTWORK_SIAGA_DOWNLOAD_PRESENSI_PDF=FAILED_UNDUH_NOT_FOUND");
    console.error("REPORT=" + reportPath);
    process.exit(1);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  let suggested = `Presensi-${TARGET_TEACHER_ID}-${TARGET_MONTH}-${TARGET_YEAR}.pdf`;
  let outputPath = "";
  let downloadMethod = "unknown";

  const targetHref = unduhInfo?.target?.href || "";

  if (targetHref && !/^javascript:/i.test(targetHref)) {
    const absoluteUrl = new URL(targetHref, page.url()).href;

    console.log("DIRECT_DOWNLOAD_URL=" + absoluteUrl);

    const response = await page.request.get(absoluteUrl, {
      timeout: 60000,
      headers: {
        "Accept": "application/pdf,application/octet-stream,*/*"
      }
    });

    if (!response.ok()) {
      throw new Error(`Direct PDF request gagal: HTTP ${response.status()} ${response.statusText()}`);
    }

    const contentType = response.headers()["content-type"] || "";
    const contentDisposition = response.headers()["content-disposition"] || "";

    const cdName =
      contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ||
      contentDisposition.match(/filename="?([^";]+)"?/i)?.[1];

    if (cdName) {
      suggested = decodeURIComponent(cdName).replace(/[\\/]/g, "-");
    }

    if (!/\.pdf$/i.test(suggested)) {
      suggested = `${safeName(TARGET_TEACHER_ID)}-${safeName(TARGET_MONTH)}-${safeName(TARGET_YEAR)}-presensi.pdf`;
    }

    const outputFileName = `Presensi_${safeName(TARGET_TEACHER_NAME)}_${safeName(TARGET_MONTH)}_${safeName(TARGET_YEAR)}.pdf`;
    outputPath = path.join(downloadsDir, outputFileName);

    const buffer = await response.body();

    if (!buffer || buffer.length < 1000) {
      throw new Error(`Direct PDF request terlalu kecil: ${buffer?.length || 0} bytes, content-type=${contentType}`);
    }

    fs.writeFileSync(outputPath, buffer);
    downloadMethod = "direct_request_from_unduh_href";
  } else {
    const unduhLocator = page.locator('[data-smartwork-unduh-presensi-target="1"]').first();

    const popupPromise = page.waitForEvent("popup", { timeout: 10000 }).catch(() => null);
    const downloadPromise = page.waitForEvent("download", { timeout: 15000 }).catch(() => null);

    await unduhLocator.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);
    await unduhLocator.click({ timeout: 15000 });

    const download = await downloadPromise;

    if (download) {
      suggested = download.suggestedFilename() || suggested;

      if (!/\.pdf$/i.test(suggested)) {
        suggested = `${safeName(TARGET_TEACHER_ID)}-${safeName(TARGET_MONTH)}-${safeName(TARGET_YEAR)}-presensi.pdf`;
      }

      const outputFileName = `Presensi_${safeName(TARGET_TEACHER_NAME)}_${safeName(TARGET_MONTH)}_${safeName(TARGET_YEAR)}.pdf`;
      outputPath = path.join(downloadsDir, outputFileName);

      await download.saveAs(outputPath);
      downloadMethod = "playwright_download_event";
    } else {
      const popup = await popupPromise;
      const pdfPage = popup || page;
      await pdfPage.waitForTimeout(2500);

      const pdfUrl = pdfPage.url();
      console.log("PDF_VIEWER_URL=" + pdfUrl);

      if (!pdfUrl || /^about:blank/i.test(pdfUrl)) {
        throw new Error("Unduh membuka PDF viewer, tapi URL PDF tidak ditemukan.");
      }

      const response = await page.request.get(pdfUrl, {
        timeout: 60000,
        headers: {
          "Accept": "application/pdf,application/octet-stream,*/*"
        }
      });

      if (!response.ok()) {
        throw new Error(`PDF viewer request gagal: HTTP ${response.status()} ${response.statusText()}`);
      }

      suggested = `${safeName(TARGET_TEACHER_ID)}-${safeName(TARGET_MONTH)}-${safeName(TARGET_YEAR)}-presensi.pdf`;
      const outputFileName = `Presensi_${safeName(TARGET_TEACHER_NAME)}_${safeName(TARGET_MONTH)}_${safeName(TARGET_YEAR)}.pdf`;
      outputPath = path.join(downloadsDir, outputFileName);

      const buffer = await response.body();

      if (!buffer || buffer.length < 1000) {
        throw new Error(`PDF viewer request terlalu kecil: ${buffer?.length || 0} bytes`);
      }

      fs.writeFileSync(outputPath, buffer);
      downloadMethod = "request_from_pdf_viewer_url";
    }
  }

  const afterShot = path.join(
    shotsDir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${TARGET_TEACHER_ID}-download-presensi-after.png`
  );

  await page.screenshot({ path: afterShot, fullPage: true });

  const stat = fs.statSync(outputPath);

  const report = {
    ok: true,
    mode: "siaga-job-download-presensi-pdf",
    rule: "DOWNLOAD_UNDUH_ONLY_NO_INPUT_NO_SAVE_NO_SUBMIT_NO_DELETE",
    targetTeacherId: TARGET_TEACHER_ID,
    targetMonth: TARGET_MONTH,
    targetYear: TARGET_YEAR,
    listReady,
    unduhInfo,
    file: {
      suggestedFilename: suggested,
      savedAs: path.relative(root, outputPath).replaceAll("\\", "/"),
      sizeBytes: stat.size,
      isPdfLikely: /\.pdf$/i.test(suggested) || /\.pdf$/i.test(outputPath),
      downloadMethod
    },
    screenshots: [
      path.relative(root, beforeShot).replaceAll("\\", "/"),
      path.relative(root, afterShot).replaceAll("\\", "/")
    ],
    summary: {
      downloaded: 1,
      saved: 0,
      submitted: 0,
      deleted: 0
    },
    log,
    createdAt: now()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("SMARTWORK_SIAGA_DOWNLOAD_PRESENSI_PDF=DONE");
  console.log("REPORT=" + reportPath);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("FILE=" + outputPath);
}

main().catch((error) => {
  const report = {
    ok: false,
    mode: "siaga-job-download-presensi-pdf",
    rule: "DOWNLOAD_UNDUH_ONLY_NO_INPUT_NO_SAVE_NO_SUBMIT_NO_DELETE",
    error: error.message,
    summary: { downloaded: 0, saved: 0, submitted: 0, deleted: 0 },
    endedAt: now()
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.error("SMARTWORK_SIAGA_DOWNLOAD_PRESENSI_PDF=FAILED");
  console.error(error.stack || error.message);
  console.error("REPORT=" + reportPath);
  process.exit(1);
});
