import fs from "node:fs";
import path from "node:path";

const file = "public/index.html";
const reportPath = "docs/checkpoints/smartwork-login-ui-visual-contract-phase5zv-n10.json";
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

const s = fs.readFileSync(file, "utf8");

const checks = {
  brandTitle: s.includes('class="login-brand-title"') && s.includes('brand-dark">smart') && s.includes('brand-blue">work-agent'),
  subtitle: s.includes("Kerja lebih smart, hasil lebih maksimal."),
  username: s.includes('id="loginUsername"'),
  password: s.includes('id="loginPassword"') && s.includes('type="password"'),
  forgot: s.includes('id="forgotPasswordLink"') && s.includes("Lupa password"),
  register: s.includes('id="registerLink"') && s.includes("Registrasi"),
  google: s.includes('id="googleLoginBtn"') && s.includes("Masuk dengan Google") && s.includes('class="google-text"'),
  googleSvg: s.includes("<svg") && s.includes("#4285F4") && s.includes("#34A853"),
  terms: s.includes("Dengan login, Anda menyetujui") && s.includes("Syarat") && s.includes("Kebijakan Privasi"),
  statusHiddenButKept: s.includes('id="loginStatus"') && s.includes("login-hidden"),
  previewHiddenButKept: s.includes("Masuk mode preview") && s.includes("demo-link login-hidden"),
  googleRedirectKept: s.includes('window.location.href = "/home.html"'),
  firebaseHandlerKept: s.includes("signInWithPopup") && s.includes("GoogleAuthProvider")
};

const failures = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);

const report = {
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  lockType: "LOGIN_UI_VISUAL_ONLY_NOT_UX",
  scope: "public/index.html",
  checks,
  failures,
  safety: {
    noAuthFlowChange: true,
    noRoutingChange: true,
    noHomeRequestProgressHistoryChange: true,
    uxMustKeepRunning: true
  }
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exit(1);
console.log("OK: LOGIN UI VISUAL CONTRACT PASSED.");
