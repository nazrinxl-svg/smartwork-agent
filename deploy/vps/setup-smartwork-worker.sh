#!/usr/bin/env bash
set -euo pipefail

echo "=== SMARTWORK VPS SETUP TEMPLATE ==="

APP_DIR="/opt/smartwork-agent"
APP_USER="smartwork"

id -u "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"

apt-get update
apt-get install -y git curl ca-certificates gnupg unzip

echo "Manual next steps:"
echo "1. Install Node.js"
echo "2. Install Chrome/Chromium"
echo "3. Clone repo to /opt/smartwork-agent"
echo "4. Create .env.production.local from configs/.env.production.example"
echo "5. Copy systemd service"
echo "6. systemctl enable/start smartwork-production-worker"
echo "Never commit real credentials."
