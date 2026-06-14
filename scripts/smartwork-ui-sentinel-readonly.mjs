import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const targetFile = path.join(ROOT, "public", "progress.html");
const strict = process.argv.includes("--strict");

const html = fs.readFileSync(targetFile, "utf8");

const failures = [];
const warnings = [];
const evidence = [];

function addFailure(code, message, sample = null) {
  failures.push({ code, message, sample });
}

function addWarning(code, message, sample = null) {
  warnings.push({ code, message, sample });
}

function has(re) {
  return re.test(html);
}

function sample(re) {
  const m = html.match(re);
  return m ? m[0].slice(0, 220) : null;
}

function count(re) {
  return [...html.matchAll(re)].length;
}

// ======================================================
// SMARTWORK UI SENTINEL READ-ONLY
// - Tidak writeFile
// - Tidak screenshot
// - Tidak membuat reports/shots/checkpoints
// - Tidak menyentuh SIAGA/backend
// - Hanya baca public/progress.html dan print JSON
// ======================================================

const requiredFont = "Plus Jakarta Sans";

if (!html.includes(requiredFont)) {
  addFailure(
    "MISSING_MAIN_FONT",
    "progress.html tidak memuat/menyebut Plus Jakarta Sans."
  );
}

// Font lama yang sering bikin tampilan berubah.
const forbiddenFontPatterns = [
  {
    code: "ARIAL_SVG_HARDCODE",
    re: /font-family=["']Arial["']/i,
    message: "Masih ada SVG/font hardcode Arial."
  },
  {
    code: "SYSTEM_UI_ONLY_VPS_FONT",
    re: /font\s*:\s*12px\/1\.45\s+system-ui\s*;/i,
    message: "Masih ada font VPS/system-ui only; harus dikunci ke Plus Jakarta Sans."
  },
  {
    code: "INLINE_ARIAL_FONTFAMILY",
    re: /fontFamily\s*=\s*["']Arial/i,
    message: "Masih ada JS inline fontFamily Arial."
  },
  {
    code: "CANVAS_ARIAL_PRIMARY",
    re: /\bArial,\s*sans-serif\b/i,
    message: "Masih ada canvas/font fallback Arial sebagai font utama."
  }
];

for (const item of forbiddenFontPatterns) {
  if (has(item.re)) {
    addFailure(item.code, item.message, sample(item.re));
  }
}

// Regression yang pernah terjadi: invoice jadi TXT/plain.
const invoiceTextRegression = /Invoice_Nazrin_Presensi_SIAGA_Juni_2026\.txt|text\/plain;charset=utf-8/i;
if (has(invoiceTextRegression)) {
  addFailure(
    "INVOICE_TXT_REGRESSION",
    "Invoice terdeteksi kembali ke .txt/text plain. Target seharusnya PNG kalau fitur invoice download dipakai.",
    sample(invoiceTextRegression)
  );
}

// Tombol/fitur bukti hasil kerja jangan balik ke proof/screenshot/report JSON.
const forbiddenResultLabels = [
  /Proof/i,
  /Screenshot/i,
  /report\s*JSON/i,
  /Lihat\s*Report/i
];

for (const re of forbiddenResultLabels) {
  if (has(re)) {
    addWarning(
      "OLD_RESULT_ACTION_LABEL",
      "Ada label lama Proof/Screenshot/Report JSON. Cek apakah muncul di UI Bukti Hasil Kerja.",
      sample(re)
    );
  }
}

// Modal invoice harus tetap ada kalau fitur invoice ada.
const hasInvoiceFeature = /Invoice/i.test(html);
const hasInvoiceModal = /invoice-modal|Invoice Request|smartwork-invoice/i.test(html);

if (hasInvoiceFeature && !hasInvoiceModal) {
  addWarning(
    "INVOICE_WITHOUT_MODAL",
    "Ada kata Invoice, tapi modal invoice tidak jelas terdeteksi."
  );
}

// Marker terlalu banyak sering bikin patch bertumpuk.
const markerCount = count(/<!--\s*SMARTWORK_PROGRESS_[A-Z0-9_]+/g);
if (markerCount > 8) {
  addWarning(
    "HIGH_PROGRESS_MARKER_COUNT",
    `Marker SMARTWORK_PROGRESS terlalu banyak: ${markerCount}. Risiko patch bertumpuk.`,
    String(markerCount)
  );
}

// Script/style V terlalu banyak juga indikator patch menumpuk.
const versionPatchCount = count(/V\d{1,2}|v\d{1,2}/g);
if (versionPatchCount > 30) {
  addWarning(
    "HIGH_VERSION_PATCH_COUNT",
    `Banyak token versi patch terdeteksi: ${versionPatchCount}. Cek risiko tumpukan patch.`,
    String(versionPatchCount)
  );
}

evidence.push({
  file: "public/progress.html",
  requiredFont,
  markerCount,
  versionPatchCount,
  invoiceFeatureDetected: hasInvoiceFeature,
  invoiceModalDetected: hasInvoiceModal,
  readOnly: true,
  noWriteFile: true,
  noScreenshot: true,
  noReports: true,
  noSiagaInput: true
});

const report = {
  ok: failures.length === 0,
  strict,
  mode: "SMARTWORK_UI_SENTINEL_READONLY",
  generatedAt: new Date().toISOString(),
  target: "public/progress.html",
  failures,
  warnings,
  evidence
};

console.log(JSON.stringify(report, null, 2));

if (failures.length > 0) {
  console.error(strict ? "SMARTWORK_UI_SENTINEL_READONLY=FAILED_STRICT" : "SMARTWORK_UI_SENTINEL_READONLY=ISSUES_FOUND_AUDIT_ONLY");
  if (strict) process.exit(1);
} else {
  console.log("SMARTWORK_UI_SENTINEL_READONLY=OK");
}
