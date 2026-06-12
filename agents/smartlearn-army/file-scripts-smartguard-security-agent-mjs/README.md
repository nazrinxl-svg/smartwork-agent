# File Scripts/Smartguard Security Agent.Mjs

ID: file-scripts-smartguard-security-agent-mjs
Type: smartlearn-visual-agent
Version: 0.1.0

## Mission
Menjaga safety, no secret, no real save/send/delete, dan anti-loop.

## Capabilities
- visual_roster_identity
- read_repo_context
- produce_mission_prompt
- write_report
- receive_evolution_capability
- safety_gate_before_patch

## Guards
- no_secret_leak
- no_real_save_send_delete_without_permission
- backup_before_patch
- report_after_run
- do_not_start_from_zero

## Run
```powershell
safarmy run --agent file-scripts-smartguard-security-agent-mjs "tugas agent" --clip
```

## Evolve
```powershell
safarmy evolve --agent file-scripts-smartguard-security-agent-mjs --capability "kemampuan baru"
```
