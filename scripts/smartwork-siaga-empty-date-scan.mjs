import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const REQUEST_DIR = path.join(ROOT, "intake", "requests");
const REPORT_PATH = path.join(ROOT, "reports", "autosave-empty-date-scan-report.json");
const PROFILE_ROOT = path.join(ROOT, "browser-profile");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function latestRequest() {
  const files = fs.readdirSync(REQUEST_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      name: f,
      path: path.join(REQUEST_DIR, f),
      time: fs.statSync(path.join(REQUEST_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);

  if (!files.length) throw new Error("Tidak ada request di intake/requests.");
  return files[0];
}

function monthNumber(monthName) {
  const map = {
    januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
    juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  };
  return map[String(monthName || "").toLowerCase()] || 6;
}

function ymd(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function inRange(date, startDate, endDate) {
  if (startDate && date < String(startDate).slice(0, 10)) return false;
  if (endDate && date > String(endDate).slice(0, 10)) return false;
  return true;
}

async function isLoginPage(page) {
  return await page.evaluate(() => {
    const body = String(document.body?.innerText || "").toLowerCase();
    return location.href.includes("/login") || (
      body.includes("username") &&
      body.includes("password")
    );
  }).catch(() => false);
}

async function autoLoginIfNeeded(page, account) {
  if (!(await isLoginPage(page))) return { ok: true, skipped: true };

  const username = account.username || "";
  const password = account.password || "";

  if (!username || !password) {
    return { ok: false, reason: "USERNAME_PASSWORD_EMPTY" };
  }

  const userInput = page.locator(
    'input[name="no_akun"], #no_akun, input[name="username"], input[name="email"], input[type="text"]'
  ).first();

  const passInput = page.locator(
    'input[name="password"], input[type="password"]'
  ).first();

  const userCount = await userInput.count().catch(() => 0);
  const passCount = await passInput.count().catch(() => 0);

  if (!userCount || !passCount) {
    return { ok: false, reason: "LOGIN_INPUT_NOT_FOUND", url: page.url() };
  }

  await userInput.click({ timeout: 10000 });
  await userInput.fill(username, { timeout: 10000 });

  await passInput.click({ timeout: 10000 });
  await passInput.fill(password, { timeout: 10000 });

  const loginButton = page.locator(
    'button.btn-login, button[type="submit"], input[type="submit"], button:has-text("Masuk"), button:has-text("Login")'
  ).first();

  const btnCount = await loginButton.count().catch(() => 0);

  if (btnCount) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null),
      loginButton.click({ timeout: 10000 }),
    ]);
  } else {
    await passInput.press("Enter");
    await page.waitForLoadState("domcontentloaded", { timeout: 45000 }).catch(() => null);
  }

  await page.waitForTimeout(5000);

  return {
    ok: !(await isLoginPage(page)),
    reason: (await isLoginPage(page)) ? "LOGIN_STILL_ON_LOGIN_PAGE" : "",
    url: page.url(),
  };
}

async function openDetailPage(page, detailUrl, account) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2500);

    const loginResult = await autoLoginIfNeeded(page, account);
    if (!loginResult.ok) {
      return {
        ok: false,
        reason: loginResult.reason || "LOGIN_FAILED",
        state: loginResult,
        attempt,
      };
    }

    if (!loginResult.skipped) {
      await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(5000);
    }

    const state = await page.evaluate(() => {
      const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
      const body = clean(document.body.innerText || "");
      const rowTexts = Array.from(document.querySelectorAll("table tbody tr, table tr"))
        .map((tr) => clean(tr.innerText || tr.textContent || ""))
        .filter(Boolean);

      const hasDetailRows = rowTexts.some((text) =>
        /^\d+\s+(Senin|Selasa|Rabu|Kamis|Jum'?at|Sabtu|Minggu)\b/i.test(text)
      );

      const hasMonthRows = rowTexts.some((text) =>
        /(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+2026/i.test(text)
      );

      return {
        url: location.href,
        title: document.title,
        bodyPreview: body.slice(0, 600),
        rowCount: rowTexts.length,
        firstRows: rowTexts.slice(0, 10),
        hasDetailRows,
        hasMonthRows,
      };
    });

    if (state.hasDetailRows) return { ok: true, state, attempt };

    if (attempt === 4) {
      return {
        ok: false,
        reason: state.hasMonthRows ? "WRONG_PAGE_MONTH_LIST" : "DETAIL_ROWS_NOT_FOUND",
        state,
        attempt,
      };
    }
  }
}

async function main() {
  const latest = latestRequest();
  const request = readJson(latest.path);
  const account = request.accounts?.[0] || {};

  const teacherId = account.teacherId || request.teacherId || "guru-001";
  const detailUrl = account.detailUrl || request.targetDetailUrl || "";
  const targetMonth = request.targetMonth || "Juni";
  const targetYear = Number(request.targetYear || 2026);
  const startDate = account.startDate || request.startDate || "";
  const endDate = account.endDate || request.endDate || "";

  if (!detailUrl) throw new Error("detailUrl kosong.");

  const profileDir = path.join(PROFILE_ROOT, `${teacherId}-siaga`);
  const browser = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: null,
  });

  const page = browser.pages()[0] || await browser.newPage();
  const ready = await openDetailPage(page, detailUrl, account);

  if (!ready.ok) {
    const report = {
      ok: false,
      mode: "siaga-empty-date-scan",
      requestFile: latest.name,
      teacherId,
      detailUrl,
      error: ready.reason,
      detailReady: ready,
      emptyDates: [],
      summary: {
        totalRows: 0,
        emptyCanAdd: 0,
        filled: 0,
        skippedSunday: 0,
        outOfRange: 0,
        needsCheck: 1,
      },
      createdAt: new Date().toISOString(),
    };
    writeJson(REPORT_PATH, report);
    await browser.close();
    throw new Error(`Scanner gagal masuk detail: ${ready.reason}`);
  }

  const rows = await page.evaluate(() => {
    const clean = (v) => String(v || "").replace(/\s+/g, " ").trim();
    const trs = Array.from(document.querySelectorAll("table tbody tr, table tr"));

    return trs.map((tr, index) => {
      const text = clean(tr.innerText || tr.textContent || "");
      const cells = Array.from(tr.querySelectorAll("td, th")).map((td) => clean(td.innerText || td.textContent || ""));
      const links = Array.from(tr.querySelectorAll("a, button")).map((a) => ({
        text: clean(a.innerText || a.textContent || a.value || ""),
        href: a.href || "",
      }));

      const first = cells[0] || text.split(" ")[0];
      const dayNumber = Number(first);
      const dayName = cells[1] || "";
      const hasTime = /\d{2}:\d{2}:\d{2}/.test(text) || /\d{2}:\d{2}/.test(text);
      const hasUbah = /Ubah/i.test(text);
      const hasTambah = /Tambah/i.test(text) || links.some((x) => /Tambah|create/i.test(`${x.text} ${x.href}`));

      return {
        index,
        dayNumber,
        dayName,
        text,
        links,
        hasTime,
        hasUbah,
        hasTambah,
      };
    }).filter((r) => Number.isFinite(r.dayNumber) && r.dayNumber >= 1 && r.dayNumber <= 31);
  });

  const month = monthNumber(targetMonth);

  const analyzed = rows.map((row) => {
    const date = ymd(targetYear, month, row.dayNumber);
    const isSunday = /Minggu/i.test(row.dayName || row.text);
    const insideRange = inRange(date, startDate, endDate);
    const alreadyFilled = row.hasTime || row.hasUbah;
    const emptyCanAdd = insideRange && !isSunday && !alreadyFilled && row.hasTambah;

    return {
      ...row,
      date,
      insideRange,
      isSunday,
      alreadyFilled,
      emptyCanAdd,
      status: !insideRange ? "OUT_OF_RANGE"
        : isSunday ? "SKIPPED_SUNDAY"
        : alreadyFilled ? "FILLED"
        : row.hasTambah ? "EMPTY_CAN_ADD"
        : "NEEDS_CHECK",
    };
  });

  const emptyDates = analyzed.filter((r) => r.emptyCanAdd).map((r) => r.date);

  const report = {
    ok: true,
    mode: "siaga-empty-date-scan",
    requestFile: latest.name,
    teacherId,
    detailUrl,
    currentUrl: page.url(),
    targetMonth,
    targetYear,
    startDate,
    endDate,
    emptyDates,
    summary: {
      totalRows: analyzed.length,
      emptyCanAdd: emptyDates.length,
      filled: analyzed.filter((r) => r.status === "FILLED").length,
      skippedSunday: analyzed.filter((r) => r.status === "SKIPPED_SUNDAY").length,
      outOfRange: analyzed.filter((r) => r.status === "OUT_OF_RANGE").length,
      needsCheck: analyzed.filter((r) => r.status === "NEEDS_CHECK").length,
    },
    rows: analyzed,
    createdAt: new Date().toISOString(),
  };

  writeJson(REPORT_PATH, report);
  await browser.close();

  console.log(JSON.stringify(report.summary, null, 2));
  console.log("CURRENT_URL=" + report.currentUrl);
  console.log("EMPTY_DATES=" + emptyDates.join(","));
  console.log("REPORT=" + REPORT_PATH);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


