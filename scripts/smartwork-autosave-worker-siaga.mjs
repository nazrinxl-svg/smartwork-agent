export async function runSiagaAutoSaveWorker({ request, row, dryRun = true }) {
  if (!row || row.status !== "PLANNED") {
    return {
      ...row,
      workerStatus: "IGNORED",
      message: "Row bukan PLANNED.",
    };
  }

  const account = request.accounts?.[0] || request.account || {};

  return {
    ...row,
    status: dryRun ? "DRY_RUN_READY" : "PENDING_REAL_WORKER",
    teacherId: account.teacherId || request.teacherId || "guru-001",
    workerStatus: dryRun ? "SAFE_PREVIEW_ONLY" : "REAL_WORKER_NOT_CONNECTED_YET",
    message: dryRun
      ? "Preview aman: belum klik, belum input, belum simpan."
      : "Orchestrator siap, worker real belum dihubungkan.",
  };
}
