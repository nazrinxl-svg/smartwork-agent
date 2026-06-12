const fs = require("fs");

const file = "scripts/smartwork-phase5zd-phone-public-like-submit-proof.mjs";
let s = fs.readFileSync(file, "utf8");

function replaceOrFail(from, to, label) {
  if (!s.includes(from)) {
    throw new Error(`Block not found: ${label}`);
  }
  s = s.replace(from, to);
}

replaceOrFail(
`  const jobId =
    submitProof?.jobId ||
    submitProof?.submit?.jobId ||
    submitProof?.submit?.job?.id ||
    submitProof?.job?.id ||
    payload.jobId ||
    "";`,
`  const jobId =
    submitProof?.jobId ||
    submitProof?.submit?.jobId ||
    submitProof?.submit?.job?.id ||
    submitProof?.job?.id ||
    "";

  if (!jobId) {
    report.errors.push("submit_did_not_return_real_job_id");
  }`,
"remove fake payload jobId fallback"
);

fs.writeFileSync(file, s);

console.log(JSON.stringify({
  ok: true,
  patched: file,
  change: "5ZD refuses fake payload jobId fallback"
}, null, 2));
