# SmartWork VPS First-Run Dry-Run Checklist

Status: DRY-RUN ONLY.

Source:
- branch: test/ui-request-next-20260611-004522
- commit minimum: 08673a9 Add SmartWork VPS dry-run setup pack
- mode: dry-run only

## 1. SSH VPS

```bash
ssh root@YOUR_VPS_IP
```

## 2. Install dependency

```bash
apt update
apt install -y git curl ca-certificates build-essential
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
node -v
npm -v
git --version
```

## 3. Clone and verify dry-run pack

```bash
cd /opt
git clone https://github.com/nazrinxl-svg/smartwork-agent.git smartwork-agent
cd /opt/smartwork-agent

git checkout test/ui-request-next-20260611-004522
git pull origin test/ui-request-next-20260611-004522

cp deploy/vps-dry-run/.env.vps-dry-run.example .env.production.local

npm ci
npm run prod:deployment-pack:verify
npm run prod:release-clean:gate
npm run prod:vps-dry-run:setup-pack-check
```

## 4. Start PM2 dry-run

```bash
npm install -g pm2
pm2 start deploy/vps-dry-run/pm2.vps-dry-run.config.cjs
pm2 save
pm2 status
bash deploy/vps-dry-run/healthcheck.sh
```

## 5. Run first-run dry-run smoke

```bash
bash deploy/vps-dry-run/first-run-dry-run-smoke.sh
bash deploy/vps-dry-run/verify-running-dry-run.sh
```

## 6. Rollback

```bash
bash deploy/vps-dry-run/rollback-dry-run.sh
```

Safety locks:

```bash
SMARTWORK_DRY_RUN=true
SMARTWORK_NO_SIAGA_INPUT=true
SMARTWORK_NO_BROWSER_OPEN=true
SMARTWORK_NO_REAL_SAVE=true
SMARTWORK_NO_REAL_SEND=true
SMARTWORK_REAL_SAVE_ENABLED=false
SMARTWORK_DELIVERY_MODE=app_download_only
```

Never enable real SIAGA input/save/send during VPS first-run dry-run.

