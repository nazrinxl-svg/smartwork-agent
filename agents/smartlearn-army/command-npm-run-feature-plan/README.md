# Command Npm Run Feature:Plan

ID: command-npm-run-feature-plan
Type: smartlearn-visual-agent
Version: 0.1.0

## Mission
Mengubah ide fitur menjadi requirement, patch plan, test, dan done criteria.

## Capabilities
- visual_roster_identity
- read_repo_context
- produce_mission_prompt
- write_report
- receive_evolution_capability
- feature_requirement_builder

## Guards
- no_secret_leak
- no_real_save_send_delete_without_permission
- backup_before_patch
- report_after_run
- do_not_start_from_zero

## Run
```powershell
safarmy run --agent command-npm-run-feature-plan "tugas agent" --clip
```

## Evolve
```powershell
safarmy evolve --agent command-npm-run-feature-plan --capability "kemampuan baru"
```
