import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const reportPath = path.join(ROOT, "reports", "siaga-job-time-plan-preview-report.json");
const outPath = path.join(ROOT, "reports", "smartwork-filtered-timeplan-verify.json");

const r = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const rows = r?.results?.[0]?.rows || [];

const inside = rows.filter(x => Number(x.tanggal) >= 1 && Number(x.tanggal) <= 13);
const outside = rows.filter(x => Number(x.tanggal) > 13);
const needsPlanInside = inside.filter(x => x.status === "needs_plan");
const needsPlanOutside = outside.filter(x => x.status === "needs_plan");

const out = {
  ok: needsPlanInside.length === 1 && needsPlanInside[0].tanggal === 13 && needsPlanOutside.length === 0,
  generatedAt: new Date().toISOString(),
  requestRange: "2026-06-01..2026-06-13",
  insideSummary: {
    total: inside.length,
    alreadyFilled: inside.filter(x => x.status === "already_filled").length,
    skip: inside.filter(x => x.status === "skip").length,
    needsPlan: needsPlanInside.map(x => ({
      tanggal: x.tanggal,
      hari: x.hari,
      status: x.status,
      plan: x.plan
    }))
  },
  outsideNeedsPlan: needsPlanOutside.map(x => ({
    tanggal: x.tanggal,
    hari: x.hari,
    status: x.status,
    plan: x.plan
  })),
  outsideStatusSummary: outside.reduce((acc, x) => {
    acc[x.status] = (acc[x.status] || 0) + 1;
    return acc;
  }, {}),
  sourceReport: reportPath
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));

if (!out.ok) {
  process.exitCode = 1;
}
