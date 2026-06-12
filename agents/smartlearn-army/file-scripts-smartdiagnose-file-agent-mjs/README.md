# File Scripts/Smartdiagnose File Agent.Mjs

ID: file-scripts-smartdiagnose-file-agent-mjs
Type: smartlearn-visual-agent
Version: 0.1.0

## Mission
Mencari root cause dari log, report, screenshot, dan git diff.

## Capabilities
- visual_roster_identity
- read_repo_context
- produce_mission_prompt
- write_report
- receive_evolution_capability
- root_cause_analysis

## Guards
- no_secret_leak
- no_real_save_send_delete_without_permission
- backup_before_patch
- report_after_run
- do_not_start_from_zero

## Run
```powershell
safarmy run --agent file-scripts-smartdiagnose-file-agent-mjs "tugas agent" --clip
```

## Evolve
```powershell
safarmy evolve --agent file-scripts-smartdiagnose-file-agent-mjs --capability "kemampuan baru"
```
