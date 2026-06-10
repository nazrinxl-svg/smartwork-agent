import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const root = process.cwd();
const reportsDir = path.join(root, "reports");
const shotsDir = path.join(root, "shots");
const profileRoot = path.join(root, "browser-profile", "parallel-siaga-real");

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(shotsDir, { recursive: true });

const timePlanPath = path.join(reportsDir, "siaga-job-time-plan-preview-report.json");
const outputPath = path.join(reportsDir, "siaga-job-input-preview-no-save-report.json");

const TARGET_TEACHER_ID = process.env.TARGET_TEACHER_ID || "guru-001";
const TARGET_LIMIT = Number(process.env.TARGET_LIMIT || 1);

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

function targetDateFromRow(row) {
  // Saat ini target planner Juni 2026. Nanti bisa dibuat dinamis dari report target.
  return `2026-06-${pad2(row.tanggal)}`;
}

async function screenshot(page, name) {
  const file = path.join(
    shotsDir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${name}.png`
  );
  await page.screenshot({ path: file, fullPage: false });
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

async function fillTimeNoSave(page, target) {
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
      step: "filled_no_save",
      tanggal: tanggal.value,
      jamMasuk: masuk.value,
      jamPulang: pulang.value,
      saveButtonDetected: Boolean(
        Array.from(document.querySelectorAll("button, input[type='submit']")).find((el) =>
          /Simpan/i.test(clean(el.innerText || el.value || el.textContent))
        )
      ),
      bodyPreview: clean(document.body.innerText || "").slice(0, 800)
    };
  }, { target });
}

async function runOneTeacher(teacherPlan) {
  const startedAt = now();
  const teacherId = teacherPlan.teacherId;
  const profileDir = path.join(profileRoot, `${teacherId}-siaga`);
  const detailUrl = teacherPlan.detailUrl;

  const plannedRows = (teacherPlan.rows || [])
    .filter((row) => row.status === "needs_plan")
    .slice(0, TARGET_LIMIT);

  const log = [];
  const results = [];
  const screenshots = [];

  log.push(`[${now()}] START teacher=${teacherId}`);
  log.push(`[${now()}] RULE=INPUT_PREVIEW_NO_SAVE_TARGET_LIMIT_${TARGET_LIMIT}`);
  log.push(`[${now()}] DETAIL_URL=${detailUrl}`);

  let browser;

  try {
    browser = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 720 },
      args: ["--start-maximized"]
    });

    const page = browser.pages()[0] || await browser.newPage();

    await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);

    screenshots.push({
      label: "before",
      path: path.relative(root, await screenshot(page, `${slugify(teacherId)}-input-preview-before`)).replaceAll("\\", "/")
    });

    for (const row of plannedRows) {
      const target = {
        tanggal: String(row.tanggal),
        hari: row.hari,
        date: targetDateFromRow(row),
        masuk: row.plan.masuk,
        pulang: row.plan.pulang,
        rule: row.plan.rule
      };

      log.push(`[${now()}] TARGET=${JSON.stringify(target)}`);

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

      const fillResult = await fillTimeNoSave(page, target);
      log.push(`[${now()}] FILL_RESULT=${JSON.stringify(fillResult)}`);

      screenshots.push({
        label: `filled-no-save-${target.date}`,
        path: path.relative(root, await screenshot(page, `${slugify(teacherId)}-filled-no-save-${target.date}`)).replaceAll("\\", "/")
      });

      results.push({
        target,
        ok: Boolean(fillResult.ok),
        hrefResult,
        fillResult,
        status: fillResult.ok ? "filled_no_save" : "failed_fill"
      });

      // PREVIEW ONLY:
      // Tidak klik Simpan. Untuk target berikutnya, kembali ke detail list.
      // Input sebelumnya otomatis tidak permanen karena tidak disimpan.
      if (plannedRows.length > 1) {
        await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(1200);
      }
    }

    const finalUrl = page.url();
    const finalBody = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");

    await browser.close().catch(() => {});

    return {
      ok: results.length > 0 && results.every((item) => item.ok),
      teacherId,
      teacherName: teacherPlan.teacherName,
      detailUrl,
      startedAt,
      endedAt: now(),
      status: results.length > 0 && results.every((item) => item.ok)
        ? "input_preview_no_save_success"
        : "input_preview_no_save_needs_check",
      finalUrl,
      finalBodyPreview: finalBody.replace(/\s+/g, " ").slice(0, 1000),
      plannedRowsCount: plannedRows.length,
      results,
      screenshots,
      log
    };
  } catch (error) {
    log.push(`[${now()}] ERROR=${error.message}`);

    try {
      await browser?.close?.();
    } catch {}

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
  console.log("SMARTWORK_SIAGA_JOB_INPUT_PREVIEW_NO_SAVE=START");
  console.log("RULE=CLICK_TAMBAH_FILL_TARGET_LIMIT_NO_SAVE_NO_SUBMIT_NO_DELETE");
  console.log("TARGET_TEACHER_ID=" + TARGET_TEACHER_ID);
  console.log("TARGET_LIMIT=" + TARGET_LIMIT);

  const timePlan = readJsonSafe(timePlanPath);

  if (!timePlan?.ok) {
    throw new Error("Time plan report belum ok. Jalankan npm run siaga:job:time-plan-preview dulu.");
  }

  const teacherPlan = (timePlan.results || []).find((item) => item.teacherId === TARGET_TEACHER_ID);

  if (!teacherPlan) {
    throw new Error(`Teacher plan tidak ditemukan: ${TARGET_TEACHER_ID}`);
  }

  const result = await runOneTeacher(teacherPlan);

  const report = {
    ok: Boolean(result.ok),
    mode: "siaga-job-input-preview-no-save",
    rule: "CLICK_TAMBAH_FILL_TARGET_LIMIT_NO_SAVE_NO_SUBMIT_NO_DELETE",
    targetTeacherId: TARGET_TEACHER_ID,
    targetLimit: TARGET_LIMIT,
    startedAt: now(),
    endedAt: now(),
    summary: {
      success: result.status === "input_preview_no_save_success" ? 1 : 0,
      needsCheck: result.status === "input_preview_no_save_needs_check" ? 1 : 0,
      failed: result.status === "failed" ? 1 : 0,
      filledNoSave: (result.results || []).filter((item) => item.status === "filled_no_save").length,
      saved: 0,
      submitted: 0,
      deleted: 0
    },
    result
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.log("SMARTWORK_SIAGA_JOB_INPUT_PREVIEW_NO_SAVE=DONE");
  console.log("REPORT=" + outputPath);
  console.log(JSON.stringify(report.summary, null, 2));

  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  const report = {
    ok: false,
    mode: "siaga-job-input-preview-no-save",
    rule: "CLICK_TAMBAH_FILL_TARGET_LIMIT_NO_SAVE_NO_SUBMIT_NO_DELETE",
    error: error.message,
    endedAt: now()
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.error("SMARTWORK_SIAGA_JOB_INPUT_PREVIEW_NO_SAVE=FAILED");
  console.error(error.message);
  console.error("REPORT=" + outputPath);
  process.exit(1);
});


