import fs from "fs";

import { registerSmartWorkCleanup, runSmartWorkCleanup, writeSmartWorkExitReport, installSmartWorkProcessGuards } from "./smartwork-node-cleanup-agent.mjs";

installSmartWorkProcessGuards("SMARTWORK_SAVE_CONFIRMED_CLEAN_EXIT");
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
const shotsDir = path.join(root, "shots");
const profileRoot = path.join(root, "browser-profile", "parallel-siaga-real");

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const timePlanPath = path.join(reportsDir, "siaga-job-time-plan-preview-report.json");
const outputPath = path.join(reportsDir, "siaga-job-save-confirmed-report.json");

const CONFIRM_SAVE = process.env.CONFIRM_SAVE || "";
const TARGET_TEACHER_ID = process.env.TARGET_TEACHER_ID || "guru-001";
const TARGET_LIMIT = Number(process.env.TARGET_LIMIT || 1);
const TARGET_DATE = String(process.env.TARGET_DATE || "").slice(0, 10);
/* SMARTWORK_UI_REQUEST_TARGET_GUARD_V1 */
const UI_REQUEST_LOCAL_PATH = path.join(process.cwd(), "data", "siaga-attendance-request.local.json");

function readJsonSafeForUiGuard(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").trim());
  } catch {
    return fallback;
  }
}

function activeUiRequestRangeForSaveGuard() {
  const request = readJsonSafeForUiGuard(UI_REQUEST_LOCAL_PATH, {});
  const account = Array.isArray(request?.accounts) ? request.accounts[0] : {};
  const startDate = request?.startDate || account?.startDate || null;
  const endDate = request?.endDate || account?.endDate || null;
  const source = request?.source || null;
  return { source, startDate, endDate };
}

function assertTargetDateInsideActiveUiRequest() {
  const range = activeUiRequestRangeForSaveGuard();

  if (range.source !== "smartwork-user-request-form") return;

  if (!range.startDate || !range.endDate) {
    throw new Error("UI request aktif tidak punya startDate/endDate. Stop save-confirmed.");
  }

  if (!TARGET_DATE) {
    throw new Error(
      `TARGET_DATE wajib eksplisit untuk UI request ${range.startDate}..${range.endDate}. Jangan pakai TARGET_LIMIT fallback.`
    );
  }

  if (TARGET_DATE < range.startDate || TARGET_DATE > range.endDate) {
    throw new Error(
      `TARGET_DATE ${TARGET_DATE} di luar UI request aktif ${range.startDate}..${range.endDate}. Stop supaya tidak input tanggal lama.`
    );
  }
}
/* END_SMARTWORK_UI_REQUEST_TARGET_GUARD_V1 */


function now() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || "worker")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "worker";
}

function readJsonSafe(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
  if (!raw) return fallback;
  return JSON.parse(raw);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toHHMM(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return text;
  return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
}

function targetDateFromRow(row) {
  return `2026-06-${pad2(row.tanggal)}`;
}

async function screenshot(page, name, fullPage = false) {
  const file = path.join(
    shotsDir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${name}.png`
  );
  await page.screenshot({ path: file, fullPage });
  return file;
}

async function getTambahHref(page, target) {
  return await page.evaluate(({ target }) => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    const rows = Array.from(document.querySelectorAll("table tbody tr, table tr")).map((tr, index) => {
      const text = clean(tr.innerText || tr.textContent);
      const links = Array.from(tr.querySelectorAll("a, button")).map((el) => ({
        text: clean(el.innerText || el.textContent || el.value),
        href: el.href || el.getAttribute("href") || "",
        tag: el.tagName,
        className: String(el.className || "")
      }));

      return { index, text, links };
    });

    const row = rows.find((r) => {
      const parts = r.text.split(" ");
      return parts[0] === String(target.tanggal) && new RegExp(target.hari, "i").test(r.text);
    });

    if (!row) {
      return {
        ok: false,
        step: "find_row",
        reason: `Row tanggal ${target.tanggal} ${target.hari} tidak ditemukan`,
        rows: rows.map((r) => ({ index: r.index, text: r.text })).slice(0, 40)
      };
    }

    const alreadyFilled =
      /\d{2}:\d{2}:\d{2}/.test(row.text) ||
      /Ubah/i.test(row.text);

    if (alreadyFilled) {
      return {
        ok: true,
        skipped: true,
        step: "already_filled",
        rowText: row.text
      };
    }

    const tambah =
      row.links.find((x) => /^Tambah$/i.test(x.text)) ||
      row.links.find((x) => /Tambah/i.test(x.text)) ||
      row.links.find((x) => /create/i.test(x.href));

    if (!tambah) {
      return {
        ok: false,
        step: "find_tambah",
        reason: `Tombol Tambah tanggal ${target.tanggal} tidak ditemukan`,
        rowText: row.text,
        links: row.links
      };
    }

    return {
      ok: true,
      skipped: false,
      step: "found_tambah_href",
      rowIndex: row.index,
      rowText: row.text,
      href: tambah.href ? new URL(tambah.href, location.origin).href : null,
      text: tambah.text
    };
  }, { target });
}

async function fillTime(page, target) {
  return await page.evaluate(({ target }) => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    function fire(el) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("blur", { bubbles: true }));
    }

    const tanggal = document.querySelector('input[name="tanggal"]');
    const masuk = document.querySelector('input[name="jam_masuk"]') || document.querySelector("#jam_masuk");
    const pulang = document.querySelector('input[name="jam_pulang"]') || document.querySelector("#jam_pulang");

    if (!tanggal || tanggal.value !== target.date) {
      return {
        ok: false,
        step: "verify_date",
        reason: `Form bukan tanggal ${target.date}`,
        tanggalValue: tanggal ? tanggal.value : null,
        url: location.href,
        bodyPreview: clean(document.body.innerText || "").slice(0, 800)
      };
    }

    if (!masuk || !pulang) {
      return {
        ok: false,
        step: "find_time_inputs",
        reason: "Input jam_masuk/jam_pulang tidak ditemukan",
        inputNames: Array.from(document.querySelectorAll("input")).map((el) => ({
          name: el.name || "",
          id: el.id || "",
          type: el.type || "",
          value: el.value || ""
        }))
      };
    }

    masuk.focus();
    masuk.value = target.masuk;
    fire(masuk);

    pulang.focus();
    pulang.value = target.pulang;
    fire(pulang);

    return {
      ok: true,
      step: "filled_before_save",
      tanggal: tanggal.value,
      jamMasuk: masuk.value,
      jamPulang: pulang.value,
      bodyPreview: clean(document.body.innerText || "").slice(0, 800)
    };
  }, { target });
}

async function clickSaveDetail(page) {
  const beforeUrl = page.url();

  const button =
    page.locator('button:has-text("Simpan Detail Absensi")').first();

  let count = await button.count().catch(() => 0);
  let clickedText = "Simpan Detail Absensi";

  if (!count) {
    const fallback = page.locator('button:has-text("Simpan"), input[type="submit"], a:has-text("Simpan")').first();
    count = await fallback.count().catch(() => 0);

    if (!count) {
      return {
        ok: false,
        reason: "simpan_button_not_found",
        beforeUrl
      };
    }

    clickedText = await fallback.innerText({ timeout: 2000 }).catch(() => "Simpan");
    await fallback.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);

    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {}),
      fallback.click({ timeout: 10000 })
    ]);
  } else {
    clickedText = await button.innerText({ timeout: 2000 }).catch(() => "Simpan Detail Absensi");
    await button.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);

    await Promise.all([
      page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {}),
      button.click({ timeout: 10000 })
    ]);
  }

  await page.waitForTimeout(3500);

  return {
    ok: true,
    clickedText,
    beforeUrl,
    afterUrl: page.url(),
    clickMode: "playwright_locator_click"
  };
}

async function waitDetailTableReady(page, detailUrl, log, label = "detail") {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);

    const state = await page.evaluate(() => {
      const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();
      const bodyText = clean(document.body?.innerText || "");
      const rows = Array.from(document.querySelectorAll("table tbody tr, table tr")).map((tr, index) => ({
        index,
        text: clean(tr.innerText || tr.textContent)
      }));

      const hasDetailTitle = /Detail Absensi/i.test(bodyText);
      const hasDateRows = rows.some((r) => /^\d+\s+(Senin|Selasa|Rabu|Kamis|Jum|Sabtu|Minggu)/i.test(r.text));

      return {
        ok: bodyText.length > 100 && hasDetailTitle && hasDateRows,
        bodyLength: bodyText.length,
        hasDetailTitle,
        hasDateRows,
        rowCount: rows.length,
        bodyPreview: bodyText.slice(0, 500),
        url: location.href
      };
    });

    log.push(`[${now()}] WAIT_DETAIL_READY_${label}_ATTEMPT_${attempt}=${JSON.stringify(state)}`);

    if (state.ok) return state;

    await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  return {
    ok: false,
    reason: "detail_table_not_ready_after_retries",
    url: page.url()
  };
}
async function verifySavedOnDetail(page, detailUrl, target) {
  await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2500);

  return await page.evaluate(({ target }) => {
    const clean = (t) => String(t || "").replace(/\s+/g, " ").trim();

    const rows = Array.from(document.querySelectorAll("table tbody tr, table tr")).map((tr, index) => ({
      index,
      text: clean(tr.innerText || tr.textContent)
    }));

    const row = rows.find((r) => {
      const parts = r.text.split(" ");
      return parts[0] === String(target.tanggal) && new RegExp(target.hari, "i").test(r.text);
    });

    if (!row) {
      return {
        ok: false,
        step: "verify_row_not_found",
        rows: rows.slice(0, 40)
      };
    }

    const targetMasukHHMM = String(target.masuk || "").slice(0, 5);
    const targetPulangHHMM = String(target.pulang || "").slice(0, 5);
    const hasMasuk = row.text.includes(target.masuk) || row.text.includes(`${targetMasukHHMM}:00`) || row.text.includes(targetMasukHHMM);
    const hasPulang = row.text.includes(target.pulang) || row.text.includes(`${targetPulangHHMM}:00`) || row.text.includes(targetPulangHHMM);
    const hasUbah = /Ubah/i.test(row.text);

    return {
      ok: hasMasuk && hasPulang && hasUbah,
      step: "verify_saved_row",
      rowText: row.text,
      hasMasuk,
      hasPulang,
      hasUbah
    };
  }, { target });
}

async function runOneTeacher(teacherPlan) {
  const startedAt = now();
  const teacherId = teacherPlan.teacherId;
  const profileDir = path.join(profileRoot, `${teacherId}-siaga`);
  const detailUrl = teacherPlan.detailUrl;
  let plannedRows = (teacherPlan.rows || [])
    .filter((row) => row.status === "needs_plan");

  if (TARGET_DATE) {
    plannedRows = plannedRows.filter((row) => targetDateFromRow(row) === TARGET_DATE);
  } else {
    plannedRows = plannedRows.slice(0, TARGET_LIMIT);
  }

  const log = [];
  const results = [];
  const screenshots = [];

  log.push(`[${now()}] START teacher=${teacherId}`);
  log.push(`[${now()}] RULE=SAVE_CONFIRMED_TARGET_${TARGET_DATE || `LIMIT_${TARGET_LIMIT}`}`);
  log.push(`[${now()}] DETAIL_URL=${detailUrl}`);

  let browser;

  try {
    browser = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 720 },
      args: ["--start-maximized"]
    });

    const page = browser.pages()[0] || await browser.newPage();

    const initialReady = await waitDetailTableReady(page, detailUrl, log, "initial");
    if (!initialReady.ok) {
      log.push(`[${now()}] INITIAL_DETAIL_NOT_READY=${JSON.stringify(initialReady)}`);
    }

    screenshots.push({
      label: "before",
      path: path.relative(root, await screenshot(page, `${slugify(teacherId)}-save-confirmed-before`, true)).replaceAll("\\", "/")
    });

    for (const row of plannedRows) {
      const target = {
        tanggal: String(row.tanggal),
        hari: row.hari,
        date: targetDateFromRow(row),
        masuk: toHHMM(row.plan.masuk),
        pulang: toHHMM(row.plan.pulang),
        rule: row.plan.rule
      };

      log.push(`[${now()}] TARGET=${JSON.stringify(target)}`);

      const detailReady = await waitDetailTableReady(page, detailUrl, log, `target_${target.date}`);
      if (!detailReady.ok) {
        results.push({
          target,
          ok: false,
          status: "failed_detail_not_ready",
          detailReady
        });
        break;
      }

      const hrefResult = await getTambahHref(page, target);
      log.push(`[${now()}] HREF_RESULT=${JSON.stringify(hrefResult)}`);

      if (!hrefResult.ok || hrefResult.skipped || !hrefResult.href) {
        results.push({
          target,
          ok: false,
          hrefResult,
          status: hrefResult.skipped ? "skipped_already_filled" : "failed_find_tambah"
        });
        break;
      }

      await page.goto(hrefResult.href, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(1500);

      const fillResult = await fillTime(page, target);
      log.push(`[${now()}] FILL_RESULT=${JSON.stringify(fillResult)}`);

      if (fillResult.ok) {
        const masukInput = page.locator('input[name="jam_masuk"], #jam_masuk').first();
        const pulangInput = page.locator('input[name="jam_pulang"], #jam_pulang').first();

        await masukInput.fill(target.masuk, { timeout: 10000 });
        await masukInput.press("Tab").catch(() => {});
        await pulangInput.fill(target.pulang, { timeout: 10000 });
        await pulangInput.press("Tab").catch(() => {});
        await page.waitForTimeout(800);

        const realFillState = await page.evaluate(() => ({
          jamMasuk: document.querySelector('input[name="jam_masuk"], #jam_masuk')?.value || "",
          jamPulang: document.querySelector('input[name="jam_pulang"], #jam_pulang')?.value || ""
        }));

        log.push(`[${now()}] REAL_PLAYWRIGHT_FILL_STATE=${JSON.stringify(realFillState)}`);
      }

      screenshots.push({
        label: `before-save-${target.date}`,
        path: path.relative(root, await screenshot(page, `${slugify(teacherId)}-before-save-${target.date}`, false)).replaceAll("\\", "/")
      });

      if (!fillResult.ok) {
        results.push({
          target,
          ok: false,
          hrefResult,
          fillResult,
          status: "failed_fill_before_save"
        });
        break;
      }

      const saveResult = await clickSaveDetail(page);
      log.push(`[${now()}] SAVE_RESULT=${JSON.stringify(saveResult)}`);

      screenshots.push({
        label: `after-save-${target.date}`,
        path: path.relative(root, await screenshot(page, `${slugify(teacherId)}-after-save-${target.date}`, false)).replaceAll("\\", "/")
      });

      const verifyResult = await verifySavedOnDetail(page, detailUrl, target);
      log.push(`[${now()}] VERIFY_RESULT=${JSON.stringify(verifyResult)}`);

      screenshots.push({
        label: `verify-${target.date}`,
        path: path.relative(root, await screenshot(page, `${slugify(teacherId)}-verify-${target.date}`, true)).replaceAll("\\", "/")
      });

      results.push({
        target,
        ok: Boolean(saveResult.ok && verifyResult.ok),
        hrefResult,
        fillResult,
        saveResult,
        verifyResult,
        status: saveResult.ok && verifyResult.ok ? "saved_and_verified" : "save_needs_check"
      });

      if (!saveResult.ok || !verifyResult.ok) {
        break;
      }
    }

    const finalUrl = page.url();
    const finalBody = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");

    const browserCloseResult = await (async () => {
      try {
        await browser.close();
        browser = undefined;
        return { ok: true, reason: "persistent_context_closed_after_success" };
      } catch (error) {
        return { ok: false, error: String(error?.message || error) };
      }
    })();

    log.push(`[${now()}] BROWSER_CLOSE=${JSON.stringify(browserCloseResult)}`);
    return {
      ok: results.length > 0 && results.every((item) => item.ok),
      teacherId,
      teacherName: teacherPlan.teacherName,
      detailUrl,
      startedAt,
      endedAt: now(),
      status: results.length > 0 && results.every((item) => item.ok)
        ? "save_confirmed_success"
        : "save_confirmed_needs_check",
      finalUrl,
      finalBodyPreview: finalBody.replace(/\s+/g, " ").slice(0, 1500),
      plannedRowsCount: plannedRows.length,
      results,
      screenshots,
      log
    };
  } catch (error) {
    log.push(`[${now()}] ERROR=${error.message}`);

    return {
      ok: false,
      teacherId,
      teacherName: teacherPlan.teacherName,
      detailUrl,
      startedAt,
      endedAt: now(),
      status: "failed",
      error: error.message,
      results,
      screenshots,
      log
    };
  }
}

async function main() {
  console.log("SMARTWORK_SIAGA_JOB_SAVE_CONFIRMED=START");
  console.log("RULE=REQUIRES_CONFIRM_SAVE_YES_THEN_CLICK_SAVE_DETAIL_ABSENSI");
  console.log("CONFIRM_SAVE=" + CONFIRM_SAVE);
  console.log("TARGET_TEACHER_ID=" + TARGET_TEACHER_ID);
  console.log("TARGET_LIMIT=" + TARGET_LIMIT);
  console.log("TARGET_DATE=" + (TARGET_DATE || "-"));
  assertTargetDateInsideActiveUiRequest();

  if (CONFIRM_SAVE !== "YES") {
    const report = {
      ok: false,
      mode: "siaga-job-save-confirmed",
      status: "blocked_missing_confirm_save",
      rule: "SAVE_BLOCKED_UNLESS_CONFIRM_SAVE_EQUALS_YES",
      confirmSave: CONFIRM_SAVE,
      targetTeacherId: TARGET_TEACHER_ID,
      targetLimit: TARGET_LIMIT,
      targetDate: TARGET_DATE || null,
      summary: {
        blocked: 1,
        saved: 0,
        submitted: 0,
        deleted: 0
      },
      endedAt: now()
    };

    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

    console.error("SMARTWORK_SIAGA_JOB_SAVE_CONFIRMED=BLOCKED");
    console.error("CONFIRM_SAVE harus YES untuk klik Simpan.");
    console.error("REPORT=" + outputPath);
    process.exit(1);
  }

  if (!TARGET_TEACHER_ID) {
    throw new Error("TARGET_TEACHER_ID wajib diisi.");
  }

  if (!TARGET_DATE && (!TARGET_LIMIT || TARGET_LIMIT < 1 || TARGET_LIMIT > 5)) {
    throw new Error("TARGET_LIMIT wajib 1 sampai 5 untuk safety jika TARGET_DATE kosong.");
  }

  const timePlan = readJsonSafe(timePlanPath);

  if (!timePlan?.ok) {
    throw new Error("Time plan report belum ok. Jalankan npm run siaga:job:time-plan-preview dulu.");
  }

  const teacherPlan = (timePlan.results || []).find((item) => item.teacherId === TARGET_TEACHER_ID);

  if (!teacherPlan) {
    throw new Error(`Teacher plan tidak ditemukan: ${TARGET_TEACHER_ID}`);
  }

  const result = await runOneTeacher(teacherPlan);

  const savedCount = (result.results || []).filter((item) => item.status === "saved_and_verified").length;

  const report = {
    ok: Boolean(result.ok),
    mode: "siaga-job-save-confirmed",
    rule: "REQUIRES_CONFIRM_SAVE_YES_THEN_CLICK_SAVE_DETAIL_ABSENSI",
    targetTeacherId: TARGET_TEACHER_ID,
    targetLimit: TARGET_LIMIT,
      targetDate: TARGET_DATE || null,
    startedAt: now(),
    endedAt: now(),
    summary: {
      success: result.status === "save_confirmed_success" ? 1 : 0,
      needsCheck: result.status === "save_confirmed_needs_check" ? 1 : 0,
      failed: result.status === "failed" ? 1 : 0,
      saved: savedCount,
      submitted: 0,
      deleted: 0
    },
    result
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.log("SMARTWORK_SIAGA_JOB_SAVE_CONFIRMED=DONE");
  console.log("REPORT=" + outputPath);
  console.log(JSON.stringify(report.summary, null, 2));

  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  const report = {
    ok: false,
    mode: "siaga-job-save-confirmed",
    rule: "REQUIRES_CONFIRM_SAVE_YES_THEN_CLICK_SAVE_DETAIL_ABSENSI",
    error: error.message,
    endedAt: now(),
    summary: {
      saved: 0,
      submitted: 0,
      deleted: 0
    }
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.error("SMARTWORK_SIAGA_JOB_SAVE_CONFIRMED=FAILED");
  console.error(error.message);
  console.error("REPORT=" + outputPath);
  process.exit(1);
});





