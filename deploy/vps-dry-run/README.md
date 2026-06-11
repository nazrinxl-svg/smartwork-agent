# SmartWork Agent VPS Dry-Run Setup Pack

Status: SAFE DRY-RUN ONLY.

Use this after Phase 5O fresh clone rehearsal passed.

Recommended source:
- branch: test/ui-request-next-20260611-004522
- readiness tag: smartwork-vps-dry-run-ready-phase5n
- latest local Phase 5O commit includes fresh clone rehearsal script.

Safety locks:
- SMARTWORK_DRY_RUN=true
- SMARTWORK_NO_SIAGA_INPUT=true
- SMARTWORK_NO_BROWSER_OPEN=true
- SMARTWORK_NO_REAL_SAVE=true
- SMARTWORK_NO_REAL_SEND=true
- SMARTWORK_REAL_SAVE_ENABLED=false
- delivery remains app download only

First VPS setup:

```bash
sudo mkdir -p /opt
cd /opt
sudo git clone https://github.com/nazrinxl-svg/smartwork-agent.git smartwork-agent
sudo chown -R "$USER":"$USER" /opt/smartwork-agent
cd /opt/smartwork-agent

git checkout test/ui-request-next-20260611-004522
git fetch --tags --force
git log -5 --oneline
git tag --points-at HEAD

cp deploy/vps-dry-run/.env.vps-dry-run.example .env.production.local
npm ci

npm run prod:deployment-pack:verify
npm run prod:release-clean:gate
npm run prod:vps-dry-run:setup-pack-check
```

Start with PM2 dry-run:

```bash
npm install -g pm2
pm2 start deploy/vps-dry-run/pm2.vps-dry-run.config.cjs
pm2 save
pm2 status
bash deploy/vps-dry-run/healthcheck.sh
```

Start with systemd dry-run:

```bash
sudo cp deploy/vps-dry-run/systemd/smartwork-control-server.dry-run.service /etc/systemd/system/
sudo cp deploy/vps-dry-run/systemd/smartwork-production-worker.dry-run.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable smartwork-control-server.dry-run
sudo systemctl enable smartwork-production-worker.dry-run
sudo systemctl start smartwork-control-server.dry-run
sudo systemctl start smartwork-production-worker.dry-run
sudo systemctl status smartwork-control-server.dry-run --no-pager
sudo systemctl status smartwork-production-worker.dry-run --no-pager
bash deploy/vps-dry-run/healthcheck.sh
```

Submit dry-run job only:

```bash
bash deploy/vps-dry-run/submit-dry-run-job.sh
```

Rollback:

```bash
bash deploy/vps-dry-run/rollback-dry-run.sh
```

Never enable real SIAGA input/save/send until dry-run VPS is proven end-to-end and reviewed.

