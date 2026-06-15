import fs from "node:fs";
import path from "node:path";

const isCheck = process.argv.includes("--check");

const envMap = {
  apiKey: "SMARTWORK_FIREBASE_API_KEY",
  authDomain: "SMARTWORK_FIREBASE_AUTH_DOMAIN",
  projectId: "SMARTWORK_FIREBASE_PROJECT_ID",
  storageBucket: "SMARTWORK_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "SMARTWORK_FIREBASE_MESSAGING_SENDER_ID",
  appId: "SMARTWORK_FIREBASE_APP_ID"
};

const missing = Object.values(envMap).filter((name) => !process.env[name]);

if (missing.length) {
  console.error("SMARTWORK_FIREBASE_CONFIG_GENERATE_FAILED");
  console.error("Missing env vars: " + missing.join(", "));
  process.exit(1);
}

const config = Object.fromEntries(
  Object.entries(envMap).map(([key, envName]) => [key, process.env[envName]])
);

const summary = {
  ok: true,
  mode: isCheck ? "check" : "write",
  output: "public/firebase-config.js",
  authDomain: config.authDomain,
  projectId: config.projectId,
  hasApiKey: Boolean(config.apiKey),
  hasAppId: Boolean(config.appId),
  hasMessagingSenderId: Boolean(config.messagingSenderId)
};

if (!isCheck) {
  const outPath = path.join(process.cwd(), "public", "firebase-config.js");
  const content =
    "window.SMARTWORK_FIREBASE_CONFIG = " +
    JSON.stringify(config, null, 2) +
    ";\n";

  fs.writeFileSync(outPath, content, "utf8");
}

console.log("SMARTWORK_FIREBASE_CONFIG_GENERATED");
console.log(JSON.stringify(summary, null, 2));