#!/usr/bin/env bash
set -euo pipefail

cd /opt/smartwork-agent

npm install -g pm2
pm2 start deploy/vps-dry-run/pm2.vps-dry-run.config.cjs
pm2 save
pm2 status

bash deploy/vps-dry-run/healthcheck.sh

