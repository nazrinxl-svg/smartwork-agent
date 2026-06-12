# Mission Runner

ID: mission-runner
Type: smartlearn-visual-agent
Version: 0.1.0

## Mission
Menjalankan safe checks dan membuat report eksekusi.

## Capabilities
- visual_roster_identity
- read_repo_context
- produce_mission_prompt
- write_report
- receive_evolution_capability
- run_safe_checks

## Guards
- no_secret_leak
- no_real_save_send_delete_without_permission
- backup_before_patch
- report_after_run
- do_not_start_from_zero

## Run
```powershell
safarmy run --agent mission-runner "tugas agent" --clip
```

## Evolve
```powershell
safarmy evolve --agent mission-runner --capability "kemampuan baru"
```
