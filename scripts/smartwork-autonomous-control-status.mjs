import fs from "node:fs";

const file = "reports/smartwork-autonomous-control-loop-state.json";

if (!fs.existsSync(file)) {
  console.log(JSON.stringify({
    ok: false,
    status: "NO_STATE_YET",
    message: "Autonomous control loop belum pernah jalan."
  }, null, 2));
  process.exit(1);
}

const j = JSON.parse(fs.readFileSync(file, "utf8"));

console.log(JSON.stringify({
  ok: j.ok,
  loopDecision: j.loopDecision,
  generatedAt: j.generatedAt,
  gitStatusShort: j.repo?.gitStatusShort || "",
  noRepeat: j.checks?.noRepeat?.summary || null,
  guarded: j.checks?.guarded?.summary
    ? {
        ok: j.checks.guarded.summary.ok,
        blockMarkerCreated: j.checks.guarded.summary.blockDangerousCommand?.markerCreated,
        safeMarkerCreated: j.checks.guarded.summary.passSafeCommand?.markerCreated
      }
    : null,
  recommendations: j.decision?.recommendations || [],
  safety: j.safety
}, null, 2));
