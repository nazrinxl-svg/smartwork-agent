# SmartWork Agent Production Deployment Pack

Status: DRY-RUN READY.

Target:
- SmartWork server runs 24/7 on VPS/cloud.
- User submits request from app.
- Backend queue creates production job.
- Worker daemon processes job.
- Progress page reads job status.
- User downloads result from app.
- Email and WhatsApp remain disabled; app download only.

Required safe environment:
SMARTWORK_DRY_RUN=true
SMARTWORK_NO_SIAGA_INPUT=true
SMARTWORK_NO_BROWSER_OPEN=true
SMARTWORK_NO_REAL_SAVE=true
SMARTWORK_NO_REAL_SEND=true
SMARTWORK_REAL_SAVE_ENABLED=false
SMARTWORK_WORKER_INTERVAL_MS=1000
PORT=3107

First Run VPS Dry-Run:
cd /opt/smartwork-agent
npm ci
npm run prod:env:guard
npm run prod:vps:first-run
npm run prod:deployment-pack:verify

Manual server:
PORT=3107 SMARTWORK_DRY_RUN=true SMARTWORK_NO_SIAGA_INPUT=true SMARTWORK_NO_BROWSER_OPEN=true SMARTWORK_NO_REAL_SAVE=true SMARTWORK_NO_REAL_SEND=true node app/smartwork-control-server.mjs

Manual worker:
SMARTWORK_DRY_RUN=true SMARTWORK_NO_SIAGA_INPUT=true SMARTWORK_NO_BROWSER_OPEN=true SMARTWORK_NO_REAL_SAVE=true SMARTWORK_NO_REAL_SEND=true node scripts/smartwork-production-worker.mjs --daemon --dry-run

Healthcheck:
curl http://127.0.0.1:3107/api/smartwork/jobs/health

Local verification:
npm run brain
npm run prod:server-worker-progress:smoke
npm run prod:daemon-readiness:smoke
npm run prod:cloud-service:simulation
npm run prod:deployment-pack:verify

Rollback:
git log --oneline -5
git reset --hard <last-known-good-commit>
npm ci
npm run brain

Do not enable real SIAGA input/save/send on VPS before dry-run server, queue, progress UI, healthcheck, and rollback all pass.

