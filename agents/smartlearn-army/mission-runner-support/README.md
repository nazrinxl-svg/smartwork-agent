# Mission Runner Support

ID: mission-runner-support
Type: smartlearn-visual-agent
Version: 0.1.3

## Mission
Menjalankan safe checks dan membuat report eksekusi.

## Capabilities
- visual_roster_identity
- read_repo_context
- produce_mission_prompt
- write_report
- receive_evolution_capability
- run_safe_checks
- delivery_buat_agent_baru_untuk_whatsapp_delivery_preview_pdf_plus_proof_no_real_
- delivery_buat_agent_baru_untuk_e_kinerja_meranti_diagnosis_dulu_no_real_submit_n
- delivery_buat_agent_baru_untuk_whatsapp_delivery_preview_target_pdf_proof_report

## Guards
- no_secret_leak
- no_real_save_send_delete_without_permission
- backup_before_patch
- report_after_run
- do_not_start_from_zero

## Run
```powershell
safarmy run --agent mission-runner-support "tugas agent" --clip
```

## Evolve
```powershell
safarmy evolve --agent mission-runner-support --capability "kemampuan baru"
```
