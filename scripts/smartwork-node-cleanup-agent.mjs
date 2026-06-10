import fs from "fs";
import path from "path";

const cleanupStack = [];
let cleanupStarted = false;

export function registerSmartWorkCleanup(label, fn) {
  if (!label || typeof fn !== "function") return;
  cleanupStack.push({ label, fn });
}

export async function runSmartWorkCleanup(options = {}) {
  if (cleanupStarted) return { ok: true, skipped: true, reason: "cleanup_already_started" };
  cleanupStarted = true;

  const results = [];
  for (const item of cleanupStack.reverse()) {
    try {
      await Promise.race([
        Promise.resolve(item.fn()),
        new Promise((_, reject) => {
          const t = setTimeout(() => reject(new Error(`cleanup_timeout:${item.label}`)), options.perItemTimeoutMs ?? 5000);
          t.unref?.();
        })
      ]);
      results.push({ label: item.label, ok: true });
    } catch (error) {
      results.push({ label: item.label, ok: false, error: String(error?.message || error) });
    }
  }

  return { ok: results.every(r => r.ok), results };
}

export function writeSmartWorkExitReport(mode, extra = {}) {
  const root = process.cwd();
  const reportDir = path.join(root, "reports");
  fs.mkdirSync(reportDir, { recursive: true });

  const handles = typeof process._getActiveHandles === "function"
    ? process._getActiveHandles().map(h => ({
        type: h?.constructor?.name || typeof h,
        hasRef: typeof h?.hasRef === "function" ? h.hasRef() : undefined
      }))
    : [];

  const requests = typeof process._getActiveRequests === "function"
    ? process._getActiveRequests().map(r => ({ type: r?.constructor?.name || typeof r }))
    : [];

  const report = {
    ok: true,
    mode,
    generatedAt: new Date().toISOString(),
    pid: process.pid,
    activeHandles: handles,
    activeRequests: requests,
    ...extra
  };

  const out = path.join(reportDir, "smartwork-node-exit-cleanup-report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  return out;
}

export function installSmartWorkProcessGuards(mode = "SMARTWORK_NODE_CLEAN_EXIT") {
  process.once("SIGINT", async () => {
    await runSmartWorkCleanup();
    writeSmartWorkExitReport(mode, { signal: "SIGINT" });
    process.exit(130);
  });

  process.once("SIGTERM", async () => {
    await runSmartWorkCleanup();
    writeSmartWorkExitReport(mode, { signal: "SIGTERM" });
    process.exit(143);
  });

  process.once("beforeExit", () => {
    writeSmartWorkExitReport(mode, { event: "beforeExit" });
  });
}
