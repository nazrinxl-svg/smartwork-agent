const fs = require("fs");

const file = "public/request.html";
let html = fs.readFileSync(file, "utf8");

const marker = `  async function postToVps(payload) {`;

const normalizer = `  function firstText(...values) {
    for (const value of values) {
      const text = String(value || "").trim();
      if (text) return text;
    }
    return "";
  }

  function readFormValue(form, names) {
    for (const name of names) {
      const el = form?.querySelector?.(\`[name="\${name}"], #\${name}\`);
      const value = String(el?.value || "").trim();
      if (value) return value;
    }
    return "";
  }

  function normalizeVpsJobPayload(payload, form) {
    if (!payload || typeof payload !== "object") {
      throw new Error("invalid_vps_job_payload");
    }

    const request = payload.request && typeof payload.request === "object" ? payload.request : {};
    const range = payload.requestRange && typeof payload.requestRange === "object" ? payload.requestRange : {};
    const requestRange = request.requestRange && typeof request.requestRange === "object" ? request.requestRange : {};
    const firstAccount = Array.isArray(payload.accounts) && payload.accounts[0] && typeof payload.accounts[0] === "object"
      ? payload.accounts[0]
      : null;

    const startDate = firstText(
      payload.startDate,
      range.startDate,
      request.startDate,
      requestRange.startDate,
      firstAccount?.startDate,
      readFormValue(form, ["startDate", "tanggalMulai", "fromDate", "dateStart"])
    );

    const endDate = firstText(
      payload.endDate,
      range.endDate,
      request.endDate,
      requestRange.endDate,
      firstAccount?.endDate,
      readFormValue(form, ["endDate", "tanggalSelesai", "toDate", "dateEnd"])
    );

    if (!startDate || !endDate) {
      throw new Error("missing_request_range_for_vps_job_payload");
    }

    payload.startDate = startDate;
    payload.endDate = endDate;
    payload.requestRange = {
      ...range,
      startDate,
      endDate
    };

    payload.request = {
      ...request,
      startDate,
      endDate,
      requestRange: {
        ...requestRange,
        startDate,
        endDate
      }
    };

    if (firstAccount) {
      firstAccount.startDate = startDate;
      firstAccount.endDate = endDate;
    } else {
      payload.accounts = [
        {
          id: payload.accountId || request.accountId || "guru-001",
          name: payload.teacherName || request.teacherName || "Nazrin",
          startDate,
          endDate
        }
      ];
    }

    payload.safety = {
      ...(payload.safety || {}),
      dryRun: true,
      noSiagaInput: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSend: true
    };

    return payload;
  }

`;

if (!html.includes(marker)) {
  console.error("Marker not found:", marker);
  process.exit(1);
}

if (!html.includes("function normalizeVpsJobPayload(payload, form)")) {
  html = html.replace(marker, normalizer + marker);
}

const oldPayloadLine = `    const payload = formObject(form);`;
const newPayloadLine = `    const payload = normalizeVpsJobPayload(formObject(form), form);`;

if (!html.includes(oldPayloadLine) && !html.includes(newPayloadLine)) {
  console.error("Payload line not found.");
  process.exit(2);
}

html = html.replace(oldPayloadLine, newPayloadLine);

fs.writeFileSync(file, html);

console.log(JSON.stringify({
  ok: true,
  patched: file,
  addedNormalizer: true,
  replacedPayloadLine: true
}, null, 2));
