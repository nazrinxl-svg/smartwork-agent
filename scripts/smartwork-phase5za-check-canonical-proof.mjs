import fs from "node:fs";

const reportPath = "docs/checkpoints/smartwork-phase5za-canonical-reboot-safe-api-proof-report.json";
const raw = fs.readFileSync(reportPath, "utf8").replace(/^\uFEFF/, "");
const report = JSON.parse(raw);

const summary = {
  ok: report.ok,
  phase: report.phase,
  releaseDecision: report.releaseDecision,
  head: report.vps?.head,
  tags: report.vps?.tags,
  controlEnabled: report.systemd?.controlEnabled,
  controlActive: report.systemd?.controlActive,
  duplicateEnabled: report.systemd?.duplicateEnabled,
  duplicateActive: report.systemd?.duplicateActive,
  portPid: report.systemd?.portPid,
  portCgroup: report.systemd?.portCgroup,
  healthOk: report.health?.ok,
  optionsStatus: report.cors?.optionsStatus,
  allowOrigin: report.cors?.allowOrigin,
  safety: report.health?.safety
};

console.log(JSON.stringify(summary, null, 2));

const ok = Boolean(
  report.ok === true &&
  report.phase === "5ZA" &&
  report.vps?.head === "9f580c9" &&
  String(report.vps?.tags || "").includes("smartwork-dewavps-systemd-autostart-ready-phase5z") &&
  report.systemd?.controlEnabled === "enabled" &&
  report.systemd?.controlActive === "active" &&
  report.systemd?.duplicateEnabled === "disabled" &&
  report.systemd?.duplicateActive === "inactive" &&
  String(report.systemd?.portCgroup || "").includes("smartwork-control-server.service") &&
  report.health?.ok === true &&
  report.health?.safety?.dryRun === true &&
  report.health?.safety?.noSiagaInput === true &&
  report.health?.safety?.noBrowserOpen === true &&
  report.health?.safety?.noRealSave === true &&
  report.health?.safety?.noRealSend === true &&
  report.cors?.optionsStatus === 204 &&
  report.cors?.allowOrigin === "http://127.0.0.1:5197"
);

if (!ok) {
  console.error("Phase 5ZA canonical proof failed strict checker.");
  process.exit(2);
}
