# SmartWork Phase 5S - DewaVPS First Boot Dry-Run

## Goal

Run SmartWork 24/7 on a DewaVPS candidate server in dry-run mode.

## Safety lock

Real SIAGA input/save/send remains disabled:

```env
SMARTWORK_DRY_RUN=true
SMARTWORK_NO_SIAGA_INPUT=true
SMARTWORK_NO_BROWSER_OPEN=true
SMARTWORK_NO_REAL_SAVE=true
SMARTWORK_NO_REAL_SEND=true
SMARTWORK_REAL_SAVE_ENABLED=false
SMARTWORK_EMAIL_ENABLED=false
SMARTWORK_WHATSAPP_ENABLED=false
```

## Required server baseline

- Ubuntu VPS
- root SSH access
- Git
- Node.js 20+
- npm
- systemd

## First boot command on VPS

```bash
cd /opt/smartwork-agent
bash deploy/dewavps/vps-first-boot-dry-run.sh
```

## Health check command on VPS

```bash
bash deploy/dewavps/vps-health-check.sh
```

## Expected result

```txt
smartwork-control-server.service active
smartwork-production-worker.service active
health endpoint responds
dry-run env confirmed
no SIAGA input
no browser open
no real save
no real send
```
