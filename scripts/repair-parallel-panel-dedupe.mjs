import fs from "fs";

const serverPath = "app/smartwork-control-server.mjs";
const htmlPath = "public/smartwork-control.html";

function removeBalancedBlock(text, needle) {
  let out = text;

  while (out.includes(needle)) {
    const start = out.indexOf(needle);
    const ifStart = out.lastIndexOf("    if", start);

    if (ifStart < 0) {
      throw new Error("Cannot find ifStart for " + needle);
    }

    let i = ifStart;
    let depth = 0;
    let opened = false;
    let end = -1;

    for (; i < out.length; i++) {
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

    if (end < 0) {
      throw new Error("Cannot find block end for " + needle);
    }

    out = out.slice(0, ifStart) + out.slice(end);
  }

  return out;
}

function removeFunctionBlock(text, functionName) {
  let out = text;
  const needle = `async function ${functionName}`;

  while (out.includes(needle)) {
    const start = out.indexOf(needle);
    const lineStart = out.lastIndexOf("\n", start) + 1;

    let i = start;
    let depth = 0;
    let opened = false;
    let end = -1;

    for (; i < out.length; i++) {
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

    if (end < 0) {
      throw new Error("Cannot find function end for " + functionName);
    }

    out = out.slice(0, lineStart) + out.slice(end);
  }

  return out;
}

function count(text, token) {
  return (text.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
}

let server = fs.readFileSync(serverPath, "utf8");

// Remove all old /api/parallel-report blocks.
server = removeBalancedBlock(server, 'pathname === "/api/parallel-report"');

const filesBlock = `    if (pathname === "/api/files") {
      return json(res, 200, {
        ok: true,
        reports: listRecent("reports", 30),
        shots: listRecent("shots", 30)
      });
    }
`;

const parallelApiBlock = `    if (pathname === "/api/files") {
      return json(res, 200, {
        ok: true,
        reports: listRecent("reports", 30),
        shots: listRecent("shots", 30)
      });
    }

    if (pathname === "/api/parallel-report") {
      const reportPath = path.join(root, "reports", "parallel-runner-report.json");

      if (!fs.existsSync(reportPath)) {
        return json(res, 200, {
          ok: true,
          exists: false,
          report: null
        });
      }

      try {
        const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
        return json(res, 200, {
          ok: true,
          exists: true,
          report
        });
      } catch (error) {
        return json(res, 500, {
          ok: false,
          error: error.message
        });
      }
    }
`;

if (!server.includes(filesBlock)) {
  throw new Error("Server /api/files marker not found after cleanup.");
}

server = server.replace(filesBlock, parallelApiBlock);
fs.writeFileSync(serverPath, server, "utf8");

let html = fs.readFileSync(htmlPath, "utf8");

// Remove duplicate CSS blocks.
html = html.replace(/[\r\n ]*\/\* SMARTWORK_PARALLEL_JOBS_PANEL_V1 \*\/[\s\S]*?@media \(max-width: 900px\) \{[\s\S]*?\.job-row \{[\s\S]*?\}[\s\S]*?\}[\r\n ]*/g, "\n");

// Remove duplicate panel sections.
html = html.replace(/[\r\n ]*<section class="card" style="margin-top:18px;">\s*<div class="card-head">\s*<div>\s*<p class="card-title">Parallel Jobs<\/p>[\s\S]*?<\/section>[\r\n ]*/g, "\n");

// Remove duplicate JS functions.
html = removeFunctionBlock(html, "refreshParallelReport");

// Remove duplicate calls if any.
html = html.replace(/\s*await refreshParallelReport\(\);/g, "");

// Insert CSS once.
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

html = html.replace("</style>", css + "  </style>");

// Insert panel once before screenshots/reports grid.
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

const reportGridMarker = '    <section class="grid" style="margin-top:18px;">';

if (!html.includes(reportGridMarker)) {
  throw new Error("HTML report grid marker not found.");
}

html = html.replace(reportGridMarker, panel + "\n" + reportGridMarker);

// Insert function once before refreshFiles.
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

if (!html.includes("    async function refreshFiles() {")) {
  throw new Error("refreshFiles marker not found.");
}

html = html.replace("    async function refreshFiles() {", js + "\n" + "    async function refreshFiles() {");

// Add call inside refreshAll.
html = html.replace(
  "      await refreshFiles();",
  "      await refreshFiles();\n      await refreshParallelReport();"
);

fs.writeFileSync(htmlPath, html, "utf8");

console.log("VERIFY_SERVER_PARALLEL_API_COUNT=" + count(fs.readFileSync(serverPath, "utf8"), '/api/parallel-report'));
console.log("VERIFY_HTML_FUNCTION_COUNT=" + count(fs.readFileSync(htmlPath, "utf8"), 'async function refreshParallelReport'));
console.log("VERIFY_HTML_PANEL_COUNT=" + count(fs.readFileSync(htmlPath, "utf8"), '<p class=\"card-title\">Parallel Jobs</p>'));
