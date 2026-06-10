import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "reports", "siaga-job-time-plan-preview-report.json"), "utf8"));
const rows = plan?.results?.[0]?.rows || [];

const needs = rows.filter(x => x.status === "needs_plan" && Number(x.tanggal) >= 1 && Number(x.tanggal) <= 13);

const out = {
  ok: needs.length === 1 && needs[0].tanggal === 13,
  generatedAt: new Date().toISOString(),
  requestRange: "2026-06-01..2026-06-13",
  needsPlanDates: needs.map(x => ({
    tanggal: x.tanggal,
    hari: x.hari,
    plan: x.plan
  }))
};

fs.writeFileSync(path.join(ROOT, "reports", "smartwork-before-save-only-needs-plan.json"), JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));

if (!out.ok) {
  throw new Error("Guard stop: needs_plan di dalam request bukan tepat 1 tanggal yaitu 13.");
}
