import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const memoryPath = path.join(ROOT, "memory", "smartwork-current-checkpoint.json");
const reportPath = path.join(ROOT, "reports", "smartwork-anti-repeat-guard-report.json");

function readJson(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) {
      return {
        __readError: "file_not_found",
        __file: file,
        __fallback: fallback
      };
    }

    let text = fs.readFileSync(file, "utf8");
    text = text.replace(/^\uFEFF/, "").trim();

    return JSON.parse(text);
  } catch (err) {
    return {
      __readError: err?.message || String(err),
      __file: file,
      __fallback: fallback
    };
  }
}

const checkpoint = readJson(memoryPath, {});
const argText = process.argv.slice(2).join(" ").toLowerCase();

const green = checkpoint.success || {};
const notDone = checkpoint.notDoneYet || {};

const warnings = [];

function hasAny(words) {
  return words.some((w) => argText.includes(w));
}

if (hasAny(["server wrapper", "run-dry wrapper", "native wrapper", "409", "runner masih berjalan", "spawn"])) {
  if (green.serverRunnerWrapper?.status === "OK" && green.nativeHttpRoutes?.status === "OK") {
    warnings.push({
      code: "SMARTWORK_REPEAT_WARNING_SERVER_WRAPPER_ALREADY_GREEN",
      message: "Server native run-dry wrapper already passed: HTTP 202, running=false, exitCode=0. Do not repeat this patch unless a new failure appears."
    });
  }
}

if (hasAny(["detailurl", "detail url", "selector", "enrich"])) {
  if (green.detailUrlEnrichment?.status === "OK" && green.uiRequestSelection?.status === "OK") {
    warnings.push({
      code: "SMARTWORK_REPEAT_WARNING_DETAILURL_SELECTOR_ALREADY_GREEN",
      message: "UI request selector and detailUrl enrichment already passed. Selected request is smartwork-user-request-form range 2026-06-16..2026-06-20."
    });
  }
}

if (hasAny(["autosave-real-request", "autosave real", "1..13", "2026-06-01..2026-06-13"])) {
  warnings.push({
    code: "SMARTWORK_REPEAT_WARNING_OLD_AUTOSAVE_REAL_NOT_CURRENT_TARGET",
    message: "autosave-real-request 2026-06-01..2026-06-13 is fallback/old completed target. Current UI request target is 2026-06-16..2026-06-20."
  });
}

if (hasAny(["delivery", "pdf", "proof", "whatsapp", "email"])) {
  if (notDone.finalPdfProofDeliveryForUiRequest?.status === "NOT_DONE") {
    warnings.push({
      code: "SMARTWORK_WARNING_DELIVERY_NOT_CURRENTLY_DONE_FOR_UI_REQUEST",
      message: "Do not claim PDF/proof/delivery done for UI request 2026-06-16..2026-06-20. Only old 1..13 result was ready."
    });
  }
}

const next = checkpoint.antiRepeatGuard?.nextIncompleteStep || "Continue current UI request pipeline.";
const output = {
  ok: true,
  memoryPath,
  memoryReadError: checkpoint.__readError || null,
  mode: "SMARTWORK_ANTI_REPEAT_GUARD",
  generatedAt: new Date().toISOString(),
  checkedIntent: argText || null,
  warnings,
  nextIncompleteStep: next,
  checkpointSummary: {
    success: {
      nativeHttpRoutes: green.nativeHttpRoutes?.status || null,
      serverRunnerWrapper: green.serverRunnerWrapper?.status || null,
      uiRequestSelection: green.uiRequestSelection?.status || null,
      detailUrlEnrichment: green.detailUrlEnrichment?.status || null,
      dryRunUiRequest: green.dryRunUiRequest?.status || null,
      credentialRedaction: green.credentialRedaction?.status || null
    },
    notDoneYet: {
      realSaveUiRequest: notDone.realSaveUiRequest?.status || null,
      finalPdfProofDeliveryForUiRequest: notDone.finalPdfProofDeliveryForUiRequest?.status || null,
      safeCommit: notDone.safeCommit?.status || null
    }
  }
};

fs.writeFileSync(reportPath, JSON.stringify(output, null, 2), "utf8");

if (warnings.length) {
  console.log("=== SMARTWORK_REPEAT_WARNING ===");
  for (const w of warnings) {
    console.log(`${w.code}: ${w.message}`);
  }
  console.log("");
}

console.log(JSON.stringify(output, null, 2));
