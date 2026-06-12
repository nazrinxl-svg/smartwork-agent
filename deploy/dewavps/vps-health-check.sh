#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${SMARTWORK_APP_DIR:-/opt/smartwork-agent}"
PORT="${SMARTWORK_PORT:-3107}"

echo "=== SmartWork VPS health check ==="
cd "$APP_DIR"

echo "=== Git ==="
git rev-parse --short HEAD
git status --short

echo "=== Safety env ==="
grep -E "SMARTWORK_DRY_RUN=true|SMARTWORK_NO_SIAGA_INPUT=true|SMARTWORK_NO_BROWSER_OPEN=true|SMARTWORK_NO_REAL_SAVE=true|SMARTWORK_NO_REAL_SEND=true|SMARTWORK_REAL_SAVE_ENABLED=false|SMARTWORK_EMAIL_ENABLED=false|SMARTWORK_WHATSAPP_ENABLED=false" .env.production

echo "=== Services ==="
systemctl --no-pager --full status smartwork-control-server.service || true
systemctl --no-pager --full status smartwork-production-worker.service || true

echo "=== Recent logs ==="
journalctl -u smartwork-control-server.service -n 60 --no-pager || true
journalctl -u smartwork-production-worker.service -n 60 --no-pager || true

echo "=== HTTP health ==="
curl -fsS "http://127.0.0.1:${PORT}/api/smartwork/jobs/health" || true

echo "=== Reports ==="
ls -lah reports || true

echo "=== DONE ==="
