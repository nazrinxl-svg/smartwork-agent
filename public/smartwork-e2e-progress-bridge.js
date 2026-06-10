(function () {
  const boxId = "smartwork-e2e-live-status";

  function ensureBox() {
    let box = document.getElementById(boxId);
    if (box) return box;

    box = document.createElement("div");
    box.id = boxId;
    box.style.cssText = [
      "margin:12px 0",
      "padding:12px",
      "border:1px solid rgba(37,99,235,.18)",
      "border-radius:14px",
      "background:linear-gradient(180deg,#eff6ff,#ffffff)",
      "font-family:Plus Jakarta Sans,system-ui,sans-serif",
      "font-size:12px",
      "line-height:1.45",
      "color:#0f172a"
    ].join(";");

    const main = document.querySelector("main") || document.body;
    main.prepend(box);
    return box;
  }

  function safe(v, fallback) {
    return v == null || v === "" ? fallback : v;
  }

  async function refreshSmartworkE2eStatus() {
    const box = ensureBox();

    try {
      const res = await fetch("/api/smartwork/siaga/e2e/status", { cache: "no-store" });
      const data = await res.json();

      const fp = data.finalProgress || {};
      const state = data.state || {};
      const artifacts = fp.artifacts || {};
      const result = fp.requestedDatesResult || {};
      const summary = result.summary || {};

      const status = safe(fp.status, state.running ? "RUNNING" : "WAITING");
      const ok = fp.ok === true;

      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div>
            <div style="font-weight:700;font-size:13px">SmartWork SIAGA Progress</div>
            <div style="color:#475569">Status: <b>${status}</b> ${state.running ? "• runner berjalan" : ""}</div>
          </div>
          <button id="smartwork-e2e-refresh-btn" style="border:0;border-radius:10px;padding:8px 10px;background:#2563eb;color:white;font-size:11px">Refresh</button>
        </div>
        <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>Range<br><b>${safe(fp.requestRange, "-")}</b></div>
          <div>Needs Plan<br><b>${safe(summary.needsPlan, 0)}</b></div>
          <div>PDF<br><b>${artifacts.pdfReady ? "Ready" : "-"}</b></div>
          <div>Proof<br><b>${artifacts.proofReady ? "Ready" : "-"}</b></div>
        </div>
        <div style="margin-top:8px;color:#64748b">
          ${ok ? "Selesai. PDF dan proof siap." : "Menunggu proses / belum selesai."}
        </div>
      `;

      const btn = document.getElementById("smartwork-e2e-refresh-btn");
      if (btn) btn.onclick = refreshSmartworkE2eStatus;
    } catch (err) {
      box.innerHTML = `
        <div style="font-weight:700;font-size:13px">SmartWork SIAGA Progress</div>
        <div style="color:#b91c1c;margin-top:6px">Belum bisa membaca status server.</div>
      `;
    }
  }

  window.refreshSmartworkE2eStatus = refreshSmartworkE2eStatus;

  document.addEventListener("DOMContentLoaded", () => {
    refreshSmartworkE2eStatus();
    setInterval(refreshSmartworkE2eStatus, 5000);
  });
})();
