#!/usr/bin/env bash
set -euo pipefail

cd /opt/smartwork-agent

echo "Stopping dry-run services if present."

if command -v pm2 >/dev/null 2>&1; then
  pm2 delete smartwork-control-server-dry-run || true
  pm2 delete smartwork-production-worker-dry-run || true
  pm2 save || true
fi

sudo systemctl stop smartwork-control-server.dry-run || true
sudo systemctl stop smartwork-production-worker.dry-run || true
sudo systemctl disable smartwork-control-server.dry-run || true
sudo systemctl disable smartwork-production-worker.dry-run || true

echo "Latest commits:"
git log -5 --oneline

echo "Rollback to readiness tag if needed:"
echo "git checkout smartwork-vps-dry-run-ready-phase5n"

