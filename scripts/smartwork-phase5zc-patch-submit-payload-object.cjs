const fs = require("fs");

const file = "public/request.html";
let html = fs.readFileSync(file, "utf8");

const start = html.indexOf("  async function submit(input) {");
const end = html.indexOf("  window.SmartWorkVpsApi = {", start);

if (start < 0 || end < 0) {
  console.error("Could not locate submit function block.");
  process.exit(1);
}

const oldBlock = html.slice(start, end);

const newBlock = `  function isPlainPayloadObject(input) {
    return Boolean(
      input &&
      typeof input === "object" &&
      !(input instanceof HTMLFormElement) &&
      !("nodeType" in input)
    );
  }

  async function submit(input) {
    if (isPlainPayloadObject(input)) {
      const payload = normalizeVpsJobPayload({ ...input }, null);

      if (!payload.jobId) {
        payload.jobId =
          payload.id ||
          payload.request?.jobId ||
          "phase5zc-app-browser-e2e-" + Date.now();
      }

      payload.request = {
        ...(payload.request || {}),
        jobId: payload.jobId,
        startDate: payload.startDate,
        endDate: payload.endDate
      };

      localStorage.setItem("smartwork_request", JSON.stringify(payload.request));
      localStorage.setItem("smartwork_active_job_id", payload.jobId);

      status("Mengirim request dry-run payload ke VPS queue...");
      const healthBefore = await readHealth();
      const submit = await postToVps(payload);
      const createdJobId =
        submit?.jobId ||
        submit?.job?.id ||
        submit?.id ||
        payload.jobId;

      localStorage.setItem("smartwork_active_job_id", createdJobId);
      localStorage.setItem("smartwork_production_job_id", createdJobId);
      localStorage.setItem("smartwork_production_job", JSON.stringify({ jobId: createdJobId, job: submit?.job || null }));

      const proof = {
        ok: true,
        phase: PHASE,
        apiBase: API_BASE,
        jobId: createdJobId,
        submit,
        healthBefore,
        submittedAt: new Date().toISOString(),
        safety: payload.safety
      };

      localStorage.setItem("smartwork_vps_last_submit", JSON.stringify(proof));
      status("Request dry-run payload masuk VPS queue: " + createdJobId);
      window.dispatchEvent(new CustomEvent("smartwork:vps-submit-ok", { detail: proof }));
      return proof;
    }

    const targetForm =
      input instanceof HTMLFormElement
        ? input
        : document.getElementById("requestForm");

    if (!targetForm) {
      throw new Error("request_form_not_found_for_vps_submit");
    }

    return submitDryRun(targetForm);
  }

`;

html = html.slice(0, start) + newBlock + html.slice(end);
fs.writeFileSync(file, html);

console.log(JSON.stringify({
  ok: true,
  patched: file,
  submitSupports: ["HTMLFormElement", "plain payload object"],
  preservesSubmitDryRun: true
}, null, 2));
