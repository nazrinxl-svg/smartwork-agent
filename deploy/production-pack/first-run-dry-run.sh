#!/usr/bin/env bash
set -euo pipefail

cd /opt/smartwork-agent

npm ci
npm run prod:env:guard
npm run prod:vps:first-run
npm run prod:deployment-pack:verify

pm2 start deploy/production-pack/pm2.ecosystem.config.cjs
pm2 save

curl -fsS http://127.0.0.1:3107/api/smartwork/jobs/health
echo "SmartWork dry-run service pack started."

