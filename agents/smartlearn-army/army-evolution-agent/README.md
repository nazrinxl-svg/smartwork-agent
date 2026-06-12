# Army Evolution Agent

ID: army-evolution-agent
Type: smartlearn-visual-agent
Version: 0.1.3

## Mission
Mengembangkan kemampuan agent lain melalui capability, lesson, prompt contract, dan guard.

## Capabilities
- visual_roster_identity
- read_repo_context
- produce_mission_prompt
- write_report
- receive_evolution_capability
- create_and_upgrade_visual_agents_from_html_roster
- sync_smartlearn_army_with_smartwork_smartdev_team
- generate_agent_factory_mission_prompt

## Guards
- no_secret_leak
- no_real_save_send_delete_without_permission
- backup_before_patch
- report_after_run
- do_not_start_from_zero

## Run
```powershell
safarmy run --agent army-evolution-agent "tugas agent" --clip
```

## Evolve
```powershell
safarmy evolve --agent army-evolution-agent --capability "kemampuan baru"
```
