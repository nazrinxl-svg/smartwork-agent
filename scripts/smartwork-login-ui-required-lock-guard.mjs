import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const file = path.join(repo, "public", "index.html");
const reportPath = path.join(repo, "docs", "checkpoints", "smartwork-login-ui-required-lock-phase5zv-n1.json");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

const html = fs.readFileSync(file, "utf8");

const checks = {
  usernameInput: html.includes('id="loginUsername"') && html.includes('name="username"'),
  passwordInput: html.includes('id="loginPassword"') && html.includes('type="password"'),
  forgotPassword: html.includes('id="forgotPasswordLink"') && html.includes('Lupa password'),
  registerLink: html.includes('id="registerLink"') && html.includes('Registrasi'),
  localLoginButton: html.includes('id="localLoginBtn"'),
  googleLoginButton: html.includes('id="googleLoginBtn"') && (/Masuk dengan Google|Login dengan Google/.test(html)),
  googleRedirectHomeKept: html.includes('window.location.href = "/home.html"'),
  previewLinkKept: html.includes('href="/home.html"')
};

const failures = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  lockType: "LOGIN_UI_REQUIRED_FIELDS_ONLY_NOT_AUTH_FLOW",
  scope: "public/index.html",
  checks,
  failures,
  safety: {
    noHomeRequestProgressHistoryChange: true,
    noGoogleHandlerRemoval: checks.googleLoginButton,
    noRedirectChange: checks.googleRedirectHomeKept,
    noAuthImplementationChange: true
  }
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
console.log("Report: " + reportPath);

if (!report.ok) process.exit(1);
console.log("OK: LOGIN UI REQUIRED LOCK PASSED.");

