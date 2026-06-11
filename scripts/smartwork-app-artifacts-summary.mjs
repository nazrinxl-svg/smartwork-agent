// SMARTWORK_APP_ARTIFACTS_FINALIZER_WRAPPER
// Generated wrapper: uses verified active request finalizer.
// Original backed up in backup-code before this patch.
import { spawnSync } from "child_process";

const child = spawnSync(
  process.execPath,
  ["scripts/smartwork-finalize-active-request-artifacts.mjs"],
  {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false
  }
);

process.exit(child.status ?? 1);
