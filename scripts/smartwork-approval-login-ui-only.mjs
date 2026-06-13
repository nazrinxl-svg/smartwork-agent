import fs from "node:fs";
import path from "node:path";

const p = "reports/approvals/smartarmy-ui-change-approval.json";
fs.mkdirSync(path.dirname(p), { recursive: true });

const approval = {
  approved: true,
  phase: "PHASE5ZV-N10",
  approvalType: "SMARTARMY_UI_CHANGE_APPROVAL",
  changeType: "LOGIN_UI_VISUAL_ONLY_NOT_UX",
  approvedBy: "Naz",
  approvedAt: new Date().toISOString(),
  allowedFiles: [
    "public/index.html",
    "public/home.html",
    "public/request.html",
    "public/progress.html",
    "public/history.html"
  ],
  explicitlyNotAllowed: [
    "auth-flow change",
    "routing change",
    "API bridge change",
    "manifest change",
    "SIAGA input",
    "real save/send/delete",
    "UX/data-flow freeze"
  ],
  notes: "Login UI visual contract only. UX and auth flow must keep running."
};

fs.writeFileSync(p, JSON.stringify(approval, null, 2) + "\n", "utf8");
console.log({ ok: true, file: p });
