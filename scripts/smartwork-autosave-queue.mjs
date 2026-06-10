import fs from "node:fs";
import path from "node:path";
import { writeJson, summarizePlan } from "./smartwork-autosave-core.mjs";

export function buildWorkerQueue({ request, plan }) {
  const account = request.accounts?.[0] || request.account || {};
  const jobId = request.jobId || `autosave-${Date.now()}`;

  return plan.map((row, index) => {
    if (row.status !== "PLANNED") {
      return {
        queueId: `${jobId}-${String(index + 1).padStart(3, "0")}`,
        type: "SKIP",
        status: "SKIPPED",
        date: row.date,
        reason: row.reason || "Skipped by plan",
      };
    }

    return {
      queueId: `${jobId}-${String(index + 1).padStart(3, "0")}`,
      type: "SIAGA_AUTOSAVE_DATE",
      status: "QUEUED",
      service: request.service || "siaga",
      teacherId: account.teacherId || request.teacherId || "guru-001",
      date: row.date,
      detailUrl: account.detailUrl || request.detailUrl || "",
      savePolicy: "REQUIRES_REAL_FLAG",
      createdAt: new Date().toISOString(),
    };
  });
}

export function writeQueueReport({ request, queue, reportPath }) {
  const rows = queue.map((q) => ({
    date: q.date,
    status:
      q.status === "QUEUED"
        ? "DRY_RUN_READY"
        : q.status,
    reason: q.reason || "",
    teacherId: q.teacherId || "",
    workerStatus:
      q.status === "QUEUED"
        ? "SAFE_QUEUE_ONLY"
        : "SKIPPED_BY_PLAN",
  }));

  const report = {
    ok: true,
    engine: "smartwork-autosave-queue-engine",
    mode: "QUEUE_DRY_RUN",
    jobId: request.jobId,
    service: request.service || "siaga",
    startDate: request.startDate,
    endDate: request.endDate,
    summary: summarizePlan(rows),
    queueSummary: {
      total: queue.length,
      queued: queue.filter((q) => q.status === "QUEUED").length,
      skipped: queue.filter((q) => q.status === "SKIPPED").length,
    },
    queue,
    createdAt: new Date().toISOString(),
  };

  writeJson(reportPath, report);
  return report;
}
