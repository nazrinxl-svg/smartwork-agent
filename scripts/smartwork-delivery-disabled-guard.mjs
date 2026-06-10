import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const policyPath = path.join(ROOT, "memory", "smartwork-delivery-policy.json");
const reportPath = path.join(ROOT, "reports", "smartwork-delivery-disabled-guard-report.json");

let policy = {};
try {
  policy = JSON.parse(fs.readFileSync(policyPath, "utf8").replace(/^\\uFEFF/, "").trim());
} catch {}

const requested = process.argv.slice(2).join(" ") || "delivery";

const report = {
  ok: true,
  mode: "SMARTWORK_DELIVERY_DISABLED_GUARD",
  generatedAt: new Date().toISOString(),
  requested,
  blocked: true,
  reason: "Email and WhatsApp delivery are disabled by SmartWork product policy.",
  productDecision: policy.productDecision || null,
  enabledOutputs: policy.enabledOutputs || [
    "downloadable_presensi_pdf",
    "proof_report_in_app",
    "final_progress_in_app"
  ],
  nextStep: "Show PDF download and proof report in the application."
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log("=== SMARTWORK_DELIVERY_DISABLED ===");
console.log("Email/WhatsApp delivery is disabled.");
console.log("Use app download/proof display only.");
console.log(JSON.stringify(report, null, 2));
