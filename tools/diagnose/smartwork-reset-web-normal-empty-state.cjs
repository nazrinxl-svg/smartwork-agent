const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

function write(file, value) {
  fs.writeFileSync(path.join(ROOT, file), value, "utf8");
}

function patchRequest() {
  const file = "public/request.html";
  let html = read(file);

  html = html.replace(/<input name="requesterName"[^>]*>/, '<input name="requesterName" placeholder="Nama pemohon" required />');
  html = html.replace(/<input name="email"[^>]*>/, '<input name="email" type="email" placeholder="email@contoh.com" />');
  html = html.replace(/<input name="whatsapp"[^>]*>/, '<input name="whatsapp" placeholder="Nomor WhatsApp" />');
  html = html.replace(/<input name="username"[^>]*>/, '<input name="username" placeholder="Masukkan username SIAGA" />');
  html = html.replace(/<input name="password"[^>]*>/, '<input name="password" type="password" placeholder="Masukkan password SIAGA" />');

  html = html.replace(/<input name="startDate"[^>]*>/, '<input name="startDate" type="date" />');
  html = html.replace(/<input name="endDate"[^>]*>/, '<input name="endDate" type="date" />');

  html = html.replace(/<input name="holidays"[^>]*>/, '<input name="holidays" placeholder="Contoh: 3, 4, 5, 10" />');

  html = html.replace(/<textarea name="notes">[\s\S]*?<\/textarea>/, '<textarea name="notes" placeholder="Catatan tambahan untuk agent"></textarea>');
  html = html.replace(/<div id="savedBox" class="saved">[\s\S]*?<\/div>/, '<div id="savedBox" class="saved">Belum ada request disimpan.</div>');

  write(file, html);
}

function patchProgress() {
  const file = "public/progress.html";
  let html = read(file);

  html = html.replace(/<span class="finish-normal-text"[^>]*>[\s\S]*?<\/span>/, '<span class="finish-normal-text" data-finish-text>Menunggu request</span>');
  html = html.replace(/<h1 id="heroTitle">[\s\S]*?<\/h1>/, '<h1 id="heroTitle">Belum ada request aktif</h1>');
  html = html.replace(/<p id="heroText">[\s\S]*?<\/p>/, '<p id="heroText">Progress akan muncul setelah request baru disimpan dan agent mulai bekerja.</p>');

  html = html.replace(/<div class="percent">[\s\S]*?<\/div>/, '<div class="percent">0%</div>');

  html = html.replace(/<[^>]*id="totalVal"[^>]*>[\s\S]*?<\/[^>]+>/, '<div class="statNum" id="totalVal">0</div>');
  html = html.replace(/<[^>]*id="filledVal"[^>]*>[\s\S]*?<\/[^>]+>/, '<div class="statNum" id="filledVal">0</div>');
  html = html.replace(/<[^>]*id="needsVal"[^>]*>[\s\S]*?<\/[^>]+>/, '<div class="statNum" id="needsVal">0</div>');

  html = html.replace(/Presensi_Nazrin_Juni_2026\.pdf/g, "Belum_ada_file.pdf");
  html = html.replace(/Presensi Nazrin Juni 2026/g, "Belum ada request aktif");
  html = html.replace(/Request 1 Juni[\s\S]*?aplikasi\./g, "Progress akan muncul setelah request baru disimpan dan agent mulai bekerja.");

  html = html.replace(/const DEFAULTS = \{[\s\S]*?\};/, `const DEFAULTS = {
    range: "",
    total: 0,
    filled: 0,
    needsPlan: 0,
    pdfFile: "",
    proofFile: ""
  };`);

  html = html.replace(/setText\("heroTitle",[\s\S]*?\);/, `setText("heroTitle", data.reportsSayReady ? "Request selesai" : "Belum ada request aktif");`);
  html = html.replace(/setText\("heroText",[\s\S]*?\);/, `setText("heroText", data.reportsSayReady ? "File PDF dan proof report siap diunduh dari aplikasi." : "Progress akan muncul setelah request baru disimpan dan agent mulai bekerja.");`);

  if (!html.includes("SMARTWORK_EMPTY_PROGRESS_GUARD_V1")) {
    html = html.replace("</body>", `
<script>
/* SMARTWORK_EMPTY_PROGRESS_GUARD_V1 */
(() => {
  const hasServerRequest = localStorage.getItem("smartwork_request_server");
  const hasLocalRequest = localStorage.getItem("smartwork_request");

  if (!hasServerRequest && !hasLocalRequest) {
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText("heroTitle", "Belum ada request aktif");
    setText("heroText", "Progress akan muncul setelah request baru disimpan dan agent mulai bekerja.");
    setText("totalVal", "0");
    setText("filledVal", "0");
    setText("needsVal", "0");

    document.querySelectorAll(".percent").forEach((el) => el.textContent = "0%");
    document.querySelectorAll(".barFill").forEach((el) => el.style.width = "0%");
    document.querySelectorAll("[data-flow-time]").forEach((el) => el.textContent = "--:--");

    const pdfName = document.getElementById("pdfName");
    if (pdfName) pdfName.textContent = "Belum ada file";

    const pdfLink = document.getElementById("pdfLink");
    const proofLink = document.getElementById("proofLink");

    if (pdfLink) {
      pdfLink.removeAttribute("href");
      pdfLink.setAttribute("aria-disabled", "true");
    }

    if (proofLink) {
      proofLink.removeAttribute("href");
      proofLink.setAttribute("aria-disabled", "true");
    }

    document.body.dataset.smartworkEmpty = "true";
  }
})();
</script>
</body>`);
  }

  write(file, html);
}

function patchHistory() {
  const file = "public/history.html";
  let html = read(file);

  html = html.replace(/<section class="summary">[\s\S]*?<\/section>/, `<section class="summary">
      <div class="mini"><b id="historyTotal">0</b><span>Total</span></div>
      <div class="mini"><b id="historyProcess">0</b><span>Proses</span></div>
      <div class="mini"><b id="historyDone">0</b><span>Selesai</span></div>
    </section>`);

  html = html.replace(/<section class="history-list">[\s\S]*?<\/section>/, `<section class="history-list">
      <article class="card">
        <p>Belum ada riwayat request.</p>
      </article>
    </section>`);

  if (!html.includes("SMARTWORK_EMPTY_HISTORY_GUARD_V1")) {
    html = html.replace("</body>", `
<script>
/* SMARTWORK_EMPTY_HISTORY_GUARD_V1 */
(() => {
  const hasServerRequest = localStorage.getItem("smartwork_request_server");
  const hasLocalRequest = localStorage.getItem("smartwork_request");

  if (!hasServerRequest && !hasLocalRequest) {
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText("historyTotal", "0");
    setText("historyProcess", "0");
    setText("historyDone", "0");

    const list = document.querySelector(".history-list");
    if (list) {
      list.innerHTML = '<article class="card"><p>Belum ada riwayat request.</p></article>';
    }
  }
})();
</script>
</body>`);
  }

  write(file, html);
}

patchRequest();
patchProgress();
patchHistory();

console.log(JSON.stringify({
  ok: true,
  mode: "SMARTWORK_WEB_NORMAL_EMPTY_STATE",
  patched: [
    "public/request.html",
    "public/progress.html",
    "public/history.html"
  ]
}, null, 2));
