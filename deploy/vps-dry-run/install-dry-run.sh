#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/smartwork-agent"
REPO_URL="https://github.com/nazrinxl-svg/smartwork-agent.git"
BRANCH="test/ui-request-next-20260611-004522"

sudo mkdir -p /opt

if [ ! -d "$APP_DIR/.git" ]; then
  cd /opt
  sudo git clone "$REPO_URL" smartwork-agent
  sudo chown -R "$USER":"$USER" "$APP_DIR"
fi

cd "$APP_DIR"

git fetch origin
git fetch --tags --force
git checkout "$BRANCH"
git pull origin "$BRANCH"

cp deploy/vps-dry-run/.env.vps-dry-run.example .env.production.local

npm ci
npm run prod:deployment-pack:verify
npm run prod:release-clean:gate
npm run prod:vps-dry-run:setup-pack-check

echo "SmartWork VPS dry-run install pack verified."

