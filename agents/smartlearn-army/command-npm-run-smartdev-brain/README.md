# Command Npm Run Smartdev:Brain

ID: command-npm-run-smartdev-brain
Type: smartlearn-visual-agent
Version: 0.1.0

## Mission
Membaca checkpoint, memory, report, screenshot, dan status repo.

## Capabilities
- visual_roster_identity
- read_repo_context
- produce_mission_prompt
- write_report
- receive_evolution_capability
- read_checkpoint_memory

## Guards
- no_secret_leak
- no_real_save_send_delete_without_permission
- backup_before_patch
- report_after_run
- do_not_start_from_zero

## Run
```powershell
safarmy run --agent command-npm-run-smartdev-brain "tugas agent" --clip
```

## Evolve
```powershell
safarmy evolve --agent command-npm-run-smartdev-brain --capability "kemampuan baru"
```
