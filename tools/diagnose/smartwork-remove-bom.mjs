import fs from "fs";
import path from "path";

const intakeDir = path.join(process.cwd(), "intake", "requests");
fs.readdirSync(intakeDir).forEach(file => {
  const full = path.join(intakeDir, file);
  let content = fs.readFileSync(full, "utf8");
  content = content.replace(/^\uFEFF/, ""); // hapus BOM
  fs.writeFileSync(full, content, "utf8");
  console.log(`BOM dihapus: ${file}`);
});
