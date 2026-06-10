import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const planPath = path.join(ROOT, "reports", "siaga-job-time-plan-preview-report.json");
const outPath = path.join(ROOT, "reports", "smartwork-after-save-verify-request-1-13.json");

const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const rows = plan?.results?.[0]?.rows || [];

const inside = rows.filter(x => Number(x.tanggal) >= 1 && Number(x.tanggal) <= 13);
const d13 = inside.find(x => Number(x.tanggal) === 13);
const remainingNeeds = inside.filter(x => x.status === "needs_plan");
const outsideNeeds = rows.filter(x => Number(x.tanggal) > 13 && x.status === "needs_plan");

const ok = Boolean(
  d13 &&
  d13.status === "already_filled" &&
  d13.current?.masuk &&
  d13.current.masuk !== "-" &&
  d13.current?.pulang &&
  d13.current.pulang !== "-" &&
  remainingNeeds.length === 0
);

const out = {
  ok,
  generatedAt: new Date().toISOString(),
  requestRange: "2026-06-01..2026-06-13",
  date13: d13,
  remainingNeedsPlanInsideRequest: remainingNeeds,
  outsideNeedsPlanIgnored: outsideNeeds.map(x => ({
    tanggal: x.tanggal,
    hari: x.hari,
    status: x.status,
    plan: x.plan
  })),
  insideSummary: {
    total: inside.length,
    alreadyFilled: inside.filter(x => x.status === "already_filled").length,
    skip: inside.filter(x => x.status === "skip").length,
    needsPlan: remainingNeeds.length
  },
  sourcePlanReport: planPath
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));

if (!ok) {
  throw new Error("Verify after-save gagal: tanggal 13 belum already_filled atau masih ada needs_plan dalam request 1-13.");
}
