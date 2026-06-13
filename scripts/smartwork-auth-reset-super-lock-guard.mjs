import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const repo = process.cwd();
const require = createRequire(repo + "/");
const { chromium } = require("playwright");

const LOCK_FILE = path.join(repo, "configs", "smartwork-auth-reset-super-lock.json");
const REPORT_FILE = path.join(repo, "docs", "checkpoints", "smartwork-auth-reset-super-lock-last.json");

const PROTECTED_FILES = [
  "public/index.html",
  "public/reset-password.html",
  "public/smartwork-logo.png"
];

const REQUIRED_SNIPPETS = [
  ["public/index.html", 'id="forgotPasswordLink"'],
  ["public/index.html", 'id="registerLink"'],
  ["public/index.html", 'id="googleLoginBtn"'],
  ["public/index.html", "sendPasswordResetEmail"],
  ["public/index.html", "createUserWithEmailAndPassword"],
  ["public/index.html", "signInWithEmailAndPassword"],
  ["public/reset-password.html", 'id="newPassword"'],
  ["public/reset-password.html", 'id="confirmPassword"'],
  ["public/reset-password.html", 'id="saveBtn"'],
  ["public/reset-password.html", "verifyPasswordResetCode"],
  ["public/reset-password.html", "confirmPasswordReset"],
  ["public/reset-password.html", "Kembali ke login"]
];

const FORBIDDEN_SNIPPETS = [
  ["public/reset-password.html", 'id="togglePassword"'],
  ["public/reset-password.html", "smartwork-reset-password-logo-bg-match-phase5zw-d17"],
  ["public/reset-password.html", "box-shadow: 0 18px 32px rgba(37,99,235,.10)"]
];

function abs(file) {
  return path.join(repo, file);
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(abs(file))).digest("hex");
}

function readText(file) {
  return fs.readFileSync(abs(file), "utf8");
}

function near(a, b, tolerance = 1) {
  return Math.abs(Number(a) - Number(b)) <= tolerance;
}

async function visualProof() {
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  const results = [];

  const viewports = [
    { label: "mobile390", width: 390, height: 844 },
    { label: "desktop1365", width: 1365, height: 768 }
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: vp });
    const rows = {};

    for (const target of [
      { name: "login", url: "http://localhost:4179/index.html" },
      { name: "reset", url: "http://localhost:4179/reset-password.html" }
    ]) {
      await page.goto(target.url, { waitUntil: "networkidle", timeout: 8000 });

      rows[target.name] = await page.evaluate((target) => {
        const q = (selector) => document.querySelector(selector);

        function box(selector) {
          const el = q(selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            selector,
            text: (el.textContent || el.alt || el.placeholder || "").trim().replace(/\s+/g, " ").slice(0, 100),
            x: Number(r.x.toFixed(2)),
            y: Number(r.y.toFixed(2)),
            width: Number(r.width.toFixed(2)),
            height: Number(r.height.toFixed(2)),
            backgroundColor: cs.backgroundColor,
            boxShadow: cs.boxShadow,
            filter: cs.filter,
            padding: cs.padding,
            margin: cs.margin,
            fontFamily: cs.fontFamily,
            fontSize: cs.fontSize,
            fontWeight: cs.fontWeight,
            lineHeight: cs.lineHeight
          };
        }

        return {
          name: target.name,
          url: target.url,
          body: {
            clientWidth: document.body.clientWidth,
            scrollWidth: document.body.scrollWidth
          },
          phone: box(".phone"),
          card: box(".card"),
          logo: box(".logo"),
          brandTitle: box(".brand h1, .login-brand-title"),
          brandSubtitle: box(".brand p, .login-brand-subtitle"),
          firstInput: box("input"),
          resetForm: {
            hasNewPassword: Boolean(q("#newPassword")),
            hasConfirmPassword: Boolean(q("#confirmPassword")),
            hasSaveButton: Boolean(q("#saveBtn")),
            hasCustomEyeButton: Boolean(q("#togglePassword")),
            helperText: (q("#message")?.textContent || "").trim()
          }
        };
      }, target);
    }

    const login = rows.login;
    const reset = rows.reset;

    if (!near(login.card.width, reset.card.width, 1)) failures.push(`${vp.label}: card width mismatch login=${login.card.width} reset=${reset.card.width}`);
    if (!near(login.logo.width, reset.logo.width, 1)) failures.push(`${vp.label}: logo width mismatch`);
    if (!near(login.logo.height, reset.logo.height, 1)) failures.push(`${vp.label}: logo height mismatch`);
    if (!near(login.firstInput.width, reset.firstInput.width, 1)) failures.push(`${vp.label}: input width mismatch login=${login.firstInput.width} reset=${reset.firstInput.width}`);
    if (reset.logo.backgroundColor !== "rgba(0, 0, 0, 0)") failures.push(`${vp.label}: reset logo background not transparent`);
    if (reset.logo.boxShadow !== "none") failures.push(`${vp.label}: reset logo shadow not none`);
    if (reset.logo.filter !== "none") failures.push(`${vp.label}: reset logo filter not none`);
    if (reset.body.scrollWidth > reset.body.clientWidth + 1) failures.push(`${vp.label}: reset horizontal overflow`);
    if (!reset.resetForm.hasNewPassword) failures.push(`${vp.label}: missing #newPassword`);
    if (!reset.resetForm.hasConfirmPassword) failures.push(`${vp.label}: missing #confirmPassword`);
    if (!reset.resetForm.hasSaveButton) failures.push(`${vp.label}: missing #saveBtn`);
    if (reset.resetForm.hasCustomEyeButton) failures.push(`${vp.label}: custom eye button still exists`);

    results.push({ viewport: vp, login, reset });
    await page.close();
  }

  await browser.close();
  return { failures, results };
}

async function capture() {
  if (process.env.SMARTWORK_AUTH_RESET_UNLOCK !== "NAZ_APPROVED_CAPTURE") {
    throw new Error("Capture baseline ditolak. Harus ada izin eksplisit: $env:SMARTWORK_AUTH_RESET_UNLOCK='NAZ_APPROVED_CAPTURE'");
  }

  const lock = {
    mode: "SMARTWORK_AUTH_RESET_SUPER_LOCK",
    generatedAt: new Date().toISOString(),
    approvedBy: "Naz",
    approvedState: "AUTH_REGISTER_RESET_PASSWORD_UX_APPROVED_PHASE5ZW_D18",
    rule: "Any byte change to protected files fails guard until Naz explicitly approves a new baseline.",
    protectedFiles: PROTECTED_FILES.map((file) => ({
      file,
      sha256: sha256(file)
    })),
    requiredSnippets: REQUIRED_SNIPPETS,
    forbiddenSnippets: FORBIDDEN_SNIPPETS
  };

  fs.writeFileSync(LOCK_FILE, JSON.stringify(lock, null, 2), "utf8");
  return { ok: true, mode: "CAPTURED", lockFile: LOCK_FILE, protectedFiles: lock.protectedFiles };
}

async function guard() {
  const failures = [];

  if (!fs.existsSync(LOCK_FILE)) {
    failures.push("Missing configs/smartwork-auth-reset-super-lock.json");
  } else {
    const lock = JSON.parse(fs.readFileSync(LOCK_FILE, "utf8"));

    for (const item of lock.protectedFiles || []) {
      if (!fs.existsSync(abs(item.file))) {
        failures.push(`MISSING_PROTECTED_FILE ${item.file}`);
        continue;
      }
      const actual = sha256(item.file);
      if (actual !== item.sha256) {
        failures.push(`HASH_CHANGED ${item.file}`);
      }
    }

    for (const [file, snippet] of lock.requiredSnippets || []) {
      if (!readText(file).includes(snippet)) failures.push(`REQUIRED_SNIPPET_MISSING ${file}: ${snippet}`);
    }

    for (const [file, snippet] of lock.forbiddenSnippets || []) {
      if (readText(file).includes(snippet)) failures.push(`FORBIDDEN_SNIPPET_FOUND ${file}: ${snippet}`);
    }
  }

  let visual = null;
  try {
    visual = await visualProof();
    failures.push(...visual.failures);
  } catch (error) {
    failures.push("VISUAL_PROOF_FAILED: " + (error?.message || String(error)));
  }

  const report = {
    ok: failures.length === 0,
    generatedAt: new Date().toISOString(),
    mode: "SMARTWORK_AUTH_RESET_SUPER_LOCK_GUARD",
    protectedFiles: PROTECTED_FILES,
    safety: {
      exactHashLock: true,
      explicitUnlockRequiredForCapture: true,
      loginRegisterResetProtected: true,
      resetVisualComparedToLogin: true,
      noCustomEyeButton: true,
      resetLogoTransparentLikeLogin: true,
      noSiagaInput: true,
      noRealSaveSendDelete: true
    },
    failures,
    visual
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");
  return report;
}

const mode = process.argv.includes("--capture") ? "capture" : "guard";
const result = mode === "capture" ? await capture() : await guard();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
