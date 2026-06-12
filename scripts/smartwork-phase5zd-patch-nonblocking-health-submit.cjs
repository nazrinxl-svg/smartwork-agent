const fs = require("fs");

const file = "public/request.html";
let s = fs.readFileSync(file, "utf8");

function replaceOrFail(from, to, label) {
  if (!s.includes(from)) {
    throw new Error(`Block not found: ${label}`);
  }
  s = s.replace(from, to);
}

replaceOrFail(
`      status("Mengirim request dry-run payload ke VPS queue...");
      const healthBefore = await readHealth();
      const submit = await postToVps(payload);`,
`      status("Mengirim request dry-run payload ke VPS queue...");
      let healthBefore = null;
      try {
        healthBefore = await readHealth();
      } catch (err) {
        healthBefore = {
          ok: false,
          nonBlocking: true,
          phase: PHASE,
          error: String(err?.stack || err)
        };
        console.warn("[SmartWork Phase 5V] VPS health precheck failed but submit continues", err);
      }
      const submit = await postToVps(payload);`,
"payload object submit healthBefore"
);

replaceOrFail(
`    status("Mengirim request dry-run ke VPS queue...");
    const healthBefore = await readHealth();
    const payload = normalizeVpsJobPayload(formObject(form), form);`,
`    status("Mengirim request dry-run ke VPS queue...");
    let healthBefore = null;
    try {
      healthBefore = await readHealth();
    } catch (err) {
      healthBefore = {
        ok: false,
        nonBlocking: true,
        phase: PHASE,
        error: String(err?.stack || err)
      };
      console.warn("[SmartWork Phase 5V] VPS health precheck failed but submit continues", err);
    }
    const payload = normalizeVpsJobPayload(formObject(form), form);`,
"form submit healthBefore"
);

fs.writeFileSync(file, s);

console.log(JSON.stringify({
  ok: true,
  patched: file,
  change: "VPS health precheck is non-blocking before dry-run submit"
}, null, 2));
