import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const dir = path.join(ROOT, "intake", "requests");
const detailUrl = "https://siagapendis.kemenag.go.id/guru/absensi/detail/8860825";

const changed = [];
const skipped = [];

for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
  const file = path.join(dir, name);
  let raw = fs.readFileSync(file, "utf8");
  let json;

  try {
    json = JSON.parse(raw);
  } catch (err) {
    skipped.push({ name, reason: "invalid_json" });
    continue;
  }

  const accounts = Array.isArray(json.accounts) ? json.accounts : [];
  const first = accounts[0] || {};
  const teacherId = json.teacherId || first.teacherId || "";
  const teacherName = json.teacherName || first.teacherName || json.requesterName || "";

  if (teacherId !== "guru-001" && !/Nazrin/i.test(String(teacherName))) {
    skipped.push({ name, reason: "not_guru_001_nazrin", teacherId, teacherName });
    continue;
  }

  let did = false;

  if (!json.detailUrl) {
    json.detailUrl = detailUrl;
    did = true;
  }

  if (!json.targetDetailUrl) {
    json.targetDetailUrl = detailUrl;
    did = true;
  }

  if (accounts.length) {
    for (const acc of accounts) {
      if ((acc.teacherId === "guru-001" || /Nazrin/i.test(String(acc.teacherName || ""))) && !acc.detailUrl) {
        acc.detailUrl = detailUrl;
        did = true;
      }
      if ((acc.teacherId === "guru-001" || /Nazrin/i.test(String(acc.teacherName || ""))) && !acc.targetDetailUrl) {
        acc.targetDetailUrl = detailUrl;
        did = true;
      }
    }
  }

  if (did) {
    fs.writeFileSync(file, JSON.stringify(json, null, 2));
    changed.push({ name, teacherId, teacherName, detailUrl });
  } else {
    skipped.push({ name, reason: "already_has_detailUrl", teacherId, teacherName });
  }
}

console.log(JSON.stringify({ ok: true, changed, skippedCount: skipped.length }, null, 2));
