import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const REPORT = path.join(ROOT, "reports", "smartwork-guarded-command-runner-report.json");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

function parse(argv) {
  const sep = argv.indexOf("--");
  if (sep < 0) {
    return {
      error: "Missing command separator --",
      intent: "",
      commandArgs: []
    };
  }

  const gateArgs = argv.slice(0, sep);
  const commandArgs = argv.slice(sep + 1);
  let intent = "";

  for (let i = 0; i < gateArgs.length; i += 1) {
    const a = gateArgs[i];
    if (a === "--intent") intent = gateArgs[++i] || "";
    else if (a.startsWith("--intent=")) intent = a.slice("--intent=".length);
  }

  return { intent, commandArgs };
}

function runGate(intent, commandArgs) {
  return spawnSync(process.execPath, [
    "scripts/smartwork-no-repeat-control-agent.mjs",
    "--intent",
    intent,
    "--command",
    commandArgs.join(" ")
  ], {
    cwd: ROOT,
    encoding: "utf8",
    shell: false
  });
}

function normalizeExecutable(exe) {
  if (process.platform !== "win32") return exe;
  if (exe === "npm") return "npm.cmd";
  if (exe === "npx") return "npx.cmd";
  return exe;
}

function quoteCmdArg(value) {
  const s = String(value ?? "");
  if (/^[a-zA-Z0-9_./:=@+-]+$/.test(s)) return s;
  return '"' + s.replace(/"/g, '\"') + '"';
}

function finalizeSpawnResult(result) {
  const stdout = String(result?.stdout || "");
  const stderr = String(result?.stderr || "");
  const errorText = result?.error ? `\nSPAWN_ERROR: ${result.error.message}` : "";

  if (result?.error) {
    return {
      status: 1,
      stdout,
      stderr: stderr + errorText
    };
  }

  if (typeof result?.status !== "number") {
    return {
      status: 1,
      stdout,
      stderr: stderr + "\nSPAWN_ERROR: child process returned null/unknown status"
    };
  }

  return result;
}

function runCommand(commandArgs) {
  if (!commandArgs.length) {
    return {
      status: 1,
      stdout: "",
      stderr: "No command provided"
    };
  }

  const exe = normalizeExecutable(commandArgs[0]);
  const args = commandArgs.slice(1);

  const direct = spawnSync(exe, args, {
    cwd: ROOT,
    encoding: "utf8",
    shell: false
  });

  if (
    process.platform === "win32" &&
    direct?.error &&
    /^(npm|npx)$/i.test(commandArgs[0])
  ) {
    const commandLine = [commandArgs[0], ...args].map(quoteCmdArg).join(" ");
    return finalizeSpawnResult(spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd: ROOT,
      encoding: "utf8",
      shell: false
    }));
  }

  return finalizeSpawnResult(direct);
}

const parsed = parse(process.argv.slice(2));
const startedAt = new Date().toISOString();

if (parsed.error) {
  const report = {
    ok: false,
    mode: "SMARTWORK_GUARDED_COMMAND_RUNNER",
    startedAt,
    finishedAt: new Date().toISOString(),
    error: parsed.error,
    safety: {
      commandExecuted: false
    }
  };
  writeJson(REPORT, report);
  console.error(parsed.error);
  process.exit(1);
}

const gate = runGate(parsed.intent, parsed.commandArgs);
const gateAllowed = gate.status === 0;

if (!gateAllowed) {
  const report = {
    ok: false,
    mode: "SMARTWORK_GUARDED_COMMAND_RUNNER",
    startedAt,
    finishedAt: new Date().toISOString(),
    intent: parsed.intent,
    command: parsed.commandArgs.join(" "),
    gate: {
      status: gate.status,
      stdoutTail: String(gate.stdout || "").slice(-2000),
      stderrTail: String(gate.stderr || "").slice(-2000)
    },
    decision: "BLOCKED_BY_NO_REPEAT_AGENT",
    safety: {
      commandExecuted: false,
      noSiagaLogin: true,
      noBrowserOpen: true,
      noRealSave: true,
      noRealSubmit: true,
      noDelete: true
    }
  };

  writeJson(REPORT, report);
  process.stdout.write(gate.stdout || "");
  process.stderr.write(gate.stderr || "");
  console.error("SMARTWORK_GUARDED_COMMAND_RUNNER=BLOCKED");
  process.exit(gate.status || 2);
}

const command = runCommand(parsed.commandArgs);

const report = {
  ok: command.status === 0,
  mode: "SMARTWORK_GUARDED_COMMAND_RUNNER",
  startedAt,
  finishedAt: new Date().toISOString(),
  intent: parsed.intent,
  command: parsed.commandArgs.join(" "),
  gate: {
    status: gate.status,
    stdoutTail: String(gate.stdout || "").slice(-2000),
    stderrTail: String(gate.stderr || "").slice(-2000)
  },
  commandResult: {
    status: command.status,
    stdoutTail: String(command.stdout || "").slice(-2000),
    stderrTail: String(command.stderr || "").slice(-2000)
  },
  decision: command.status === 0 ? "COMMAND_EXECUTED_AFTER_PASS" : "COMMAND_FAILED_AFTER_PASS",
  safety: {
    commandExecuted: true,
    gatePassedBeforeExecution: true
  }
};

writeJson(REPORT, report);

process.stdout.write(command.stdout || "");
process.stderr.write(command.stderr || "");

process.exit(command.status || 0);
