const fs = require("fs");

const file = "public/request.html";
let html = fs.readFileSync(file, "utf8");

const oldLine = `  window.SmartWorkVpsApi = { base: API_BASE, health: readHealth, submitDryRun };`;

const newBlock = `  async function submit(input) {
    const targetForm =
      input instanceof HTMLFormElement
        ? input
        : document.getElementById("requestForm");

    if (!targetForm) {
      throw new Error("request_form_not_found_for_vps_submit");
    }

    return submitDryRun(targetForm);
  }

  window.SmartWorkVpsApi = {
    base: API_BASE,
    health: readHealth,
    submit,
    submitDryRun,
    submitJob: submit,
    createJob: submit
  };`;

if (!html.includes(oldLine)) {
  if (html.includes("window.SmartWorkVpsApi = {") && html.includes("submitDryRun")) {
    console.log("Bridge already changed or partially patched. Refusing blind patch.");
    process.exit(2);
  }

  console.log("Expected bridge line not found.");
  process.exit(1);
}

html = html.replace(oldLine, newBlock);
fs.writeFileSync(file, html);

console.log(JSON.stringify({
  ok: true,
  patched: file,
  exposed: ["base", "health", "submit", "submitDryRun", "submitJob", "createJob"]
}, null, 2));
