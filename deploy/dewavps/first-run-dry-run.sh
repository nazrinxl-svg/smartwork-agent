#!/usr/bin/env bash
set -euo pipefail

echo "=== SmartWork DewaVPS first-run dry-run ==="

cd /opt/smartwork-agent

echo "=== Node/NPM ==="
node -v
npm -v

echo "=== Install dependencies ==="
npm ci

echo "=== Install dry-run env if missing ==="
if [ ! -f .env.production ]; then
  cp deploy/dewavps/.env.dry-run.example .env.production
fi

echo "=== Safety preflight ==="
npm run smartwork:dewavps:preflight

echo "=== Existing project guards ==="
npm run brain:smartwork-guard
npm run doctor

echo "=== Dry-run health target ==="
echo "Start server with systemd/pm2, then check:"
echo "curl http://127.0.0.1:3107/api/smartwork/jobs/health"

echo "=== DONE: VPS dry-run pack ready ==="
