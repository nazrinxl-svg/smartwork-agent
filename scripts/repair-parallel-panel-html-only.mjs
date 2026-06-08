import fs from "fs";

const htmlPath = "public/smartwork-control.html";

function count(text, token) {
  return (text.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
}

function removeFunctionBlock(text, functionName) {
  let out = text;
  const needle = `async function ${functionName}`;

  while (out.includes(needle)) {
    const start = out.indexOf(needle);
    const lineStart = out.lastIndexOf("\n", start) + 1;

    let depth = 0;
    let opened = false;
    let end = -1;

    for (let i = start; i < out.length; i++) {
      const ch = out[i];

      if (ch === "{") {
        depth++;
        opened = true;
      }

      if (ch === "}") {
        depth--;
        if (opened && depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (end < 0) throw new Error("Cannot find function end: " + functionName);

    out = out.slice(0, lineStart) + out.slice(end);
  }

  return out;
}

function removeParallelPanels(text) {
  let out = text;
  const needle = '<p class="card-title">Parallel Jobs</p>';

  while (out.includes(needle)) {
    const titleIndex = out.indexOf(needle);
    const sectionStart = out.lastIndexOf("<section", titleIndex);

    if (sectionStart < 0) {
      throw new Error("Cannot find section start for Parallel Jobs panel.");
    }

    const sectionEnd = out.indexOf("</section>", titleIndex);
    if (sectionEnd < 0) {
      throw new Error("Cannot find section end for Parallel Jobs panel.");
    }

    out = out.slice(0, sectionStart) + out.slice(sectionEnd + "</section>".length);
  }

  return out;
}

let html = fs.readFileSync(htmlPath, "utf8");

// Bersihkan panel dan function duplicate.
html = removeParallelPanels(html);
html = removeFunctionBlock(html, "refreshParallelReport");

// Bersihkan call duplicate.
html = html.replace(/\s*await refreshParallelReport\(\);/g, "");

// Bersihkan CSS duplicate lama sebisa mungkin.
html = html.replace(/[\r\n ]*\/\* SMARTWORK_PARALLEL_JOBS_PANEL_V1 \*\/[\s\S]*?(?=\n\s*\/\* SMARTWORK_|<\/style>)/g, "\n");

// CSS panel sekali saja.
const css = `

    /* SMARTWORK_PARALLEL_JOBS_PANEL_V1 */
    .parallel-summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 14px;
    }

    .parallel-stat {
      border: 1px solid var(--border);
      background: #fff;
      border-radius: 16px;
      padding: 12px;
    }

    .parallel-stat span {
      display: block;
      font-size: 11px;
      color: var(--muted);
      font-weight: 400;
      margin-bottom: 5px;
    }

    .parallel-stat strong {
      display: block;
      font-size: 18px;
      color: var(--text);
      font-weight: 700;
    }

    .job-table {
      display: grid;
      gap: 9px;
    }

    .job-row {
      display: grid;
      grid-template-columns: 1.1fr .8fr 1fr .7fr;
      gap: 10px;
      align-items: center;
      border: 1px solid var(--border);
      background: #fff;
      border-radius: 16px;
      padding: 12px;
      font-size: 12px;
      color: var(--muted);
      font-weight: 400;
    }

    .job-row strong {
      color: var(--text);
      font-weight: 600;
    }

    .job-status {
      justify-self: start;
      border-radius: 999px;
      padding: 5px 9px;
      font-size: 11px;
      font-weight: 500;
      background: var(--green-soft);
      color: #15803d;
      border: 1px solid #bbf7d0;
    }

    .job-status.failed {
      background: var(--red-soft);
      color: #b91c1c;
      border-color: #fecaca;
    }

    .parallel-empty {
      color: var(--muted);
      font-size: 12px;
      font-weight: 400;
      line-height: 1.6;
    }

    @media (max-width: 900px) {
      .parallel-summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .job-row {
        grid-template-columns: 1fr;
      }
    }

`;

if (!html.includes("</style>")) {
  throw new Error("Missing </style>");
}

html = html.replace("</style>", css + "  </style>");

// Panel sekali saja.
const panel = `

    <section class="card" style="margin-top:18px;">
      <div class="card-head">
        <div>
          <p class="card-title">Parallel Jobs</p>
          <div class="card-sub">Status worker paralel terakhir dari laporan dummy runner.</div>
        </div>
        <button class="action-btn safe" style="min-height:auto;padding:10px 13px;" onclick="refreshParallelReport()">
          <strong>Refresh jobs</strong>
        </button>
      </div>
      <div class="card-body">
        <div class="parallel-summary">
          <div class="parallel-stat">
            <span>Total job</span>
            <strong id="parallelTotal">0</strong>
          </div>
          <div class="parallel-stat">
            <span>Selesai</span>
            <strong id="parallelDone">0</strong>
          </div>
          <div class="parallel-stat">
            <span>Gagal</span>
            <strong id="parallelFailed">0</strong>
          </div>
          <div class="parallel-stat">
            <span>Limit paralel</span>
            <strong id="parallelLimit">0</strong>
          </div>
        </div>
        <div class="job-table" id="parallelJobs">
          <div class="parallel-empty">Belum ada laporan parallel runner.</div>
        </div>
      </div>
    </section>

`;

// Sisipkan sebelum section Screenshot Bukti.
const shotTitle = '<p class="card-title">Screenshot Bukti</p>';
const shotIndex = html.indexOf(shotTitle);

if (shotIndex < 0) {
  throw new Error("Cannot find Screenshot Bukti section.");
}

const shotSectionStart = html.lastIndexOf("<section", shotIndex);
if (shotSectionStart < 0) {
  throw new Error("Cannot find Screenshot Bukti section start.");
}

html = html.slice(0, shotSectionStart) + panel + "\n" + html.slice(shotSectionStart);

// Function sekali saja.
const js = `

    async function refreshParallelReport() {
      const total = document.getElementById("parallelTotal");
      const done = document.getElementById("parallelDone");
      const failed = document.getElementById("parallelFailed");
      const limit = document.getElementById("parallelLimit");
      const jobsWrap = document.getElementById("parallelJobs");

      if (!jobsWrap) return;

      try {
        const data = await api("/api/parallel-report");

        if (!data.ok || !data.exists || !data.report) {
          total.textContent = "0";
          done.textContent = "0";
          failed.textContent = "0";
          limit.textContent = "0";
          jobsWrap.innerHTML = '<div class="parallel-empty">Belum ada laporan parallel runner.</div>';
          return;
        }

        const report = data.report;
        total.textContent = String(report.totalJobs || 0);
        done.textContent = String((report.summary && report.summary.done) || 0);
        failed.textContent = String((report.summary && report.summary.failed) || 0);
        limit.textContent = String(report.parallelLimit || 0);

        jobsWrap.innerHTML = (report.jobs || []).map((job) => {
          const failedClass = job.status === "failed" ? " failed" : "";
          return \`
            <div class="job-row">
              <div><strong>\${job.teacherName || "-"}</strong><br>\${job.teacherId || "-"}</div>
              <div>\${job.appName || job.appId || "-"}</div>
              <div>\${job.task || "-"}</div>
              <div><span class="job-status\${failedClass}">\${job.status || "-"}</span></div>
            </div>
          \`;
        }).join("");
      } catch (error) {
        jobsWrap.innerHTML = '<div class="parallel-empty">Gagal membaca parallel report: ' + error.message + '</div>';
      }
    }

`;

const refreshFilesMarker = "    async function refreshFiles() {";
if (!html.includes(refreshFilesMarker)) {
  throw new Error("Cannot find refreshFiles marker.");
}

html = html.replace(refreshFilesMarker, js + "\n" + refreshFilesMarker);

// Panggil dari refreshAll.
const refreshFilesCall = "      await refreshFiles();";
if (!html.includes(refreshFilesCall)) {
  throw new Error("Cannot find refreshFiles call.");
}

html = html.replace(refreshFilesCall, refreshFilesCall + "\n      await refreshParallelReport();");

fs.writeFileSync(htmlPath, html, "utf8");

const finalHtml = fs.readFileSync(htmlPath, "utf8");
console.log("VERIFY_HTML_FUNCTION_COUNT=" + count(finalHtml, "async function refreshParallelReport"));
console.log("VERIFY_HTML_PANEL_COUNT=" + count(finalHtml, '<p class="card-title">Parallel Jobs</p>'));
console.log("VERIFY_HTML_CSS_COUNT=" + count(finalHtml, "SMARTWORK_PARALLEL_JOBS_PANEL_V1"));
