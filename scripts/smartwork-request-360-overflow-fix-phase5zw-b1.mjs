import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "public", "request.html");
const id = "smartwork-request-360-overflow-fix-phase5zw-b1";

let html = fs.readFileSync(file, "utf8");
const backup = file + ".bak-" + id;

if (!fs.existsSync(backup)) {
  fs.writeFileSync(backup, html, "utf8");
}

html = html.replace(
  new RegExp(`<style\\s+id=["']${id}["'][\\s\\S]*?<\\/style>\\s*`, "g"),
  ""
);

const block = `
<style id="${id}">
/* Request-only 360px overflow fix.
   Scope: request page visual containment only.
   Do not touch login, routing, bottom nav labels/icons, manifest, API bridge. */

html,
body {
  overflow-x: hidden !important;
}

* {
  box-sizing: border-box;
}

.topbar,
header,
.app,
main,
form {
  max-width: 100% !important;
}

.profile-avatar {
  flex: 0 0 38px !important;
  width: 38px !important;
  height: 38px !important;
  max-width: 38px !important;
  overflow: hidden !important;
  border-radius: 14px !important;
  font-size: 0 !important;
  line-height: 0 !important;
}

.profile-avatar img {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  max-width: 100% !important;
  object-fit: cover !important;
  font-size: 0 !important;
  text-indent: -9999px !important;
}

form,
form * {
  min-width: 0 !important;
}

form input,
form textarea,
form select {
  max-width: 100% !important;
}

form input[type="date"] {
  width: 100% !important;
  min-width: 0 !important;
}
</style>
`;

if (!html.includes("</body>")) {
  throw new Error("Tag </body> tidak ketemu di request.html");
}

html = html.replace("</body>", `${block}\n</body>`);
fs.writeFileSync(file, html, "utf8");

console.log(JSON.stringify({
  ok: true,
  file: "public/request.html",
  backup,
  insertedStyleId: id,
  scope: "request-only visual containment"
}, null, 2));
