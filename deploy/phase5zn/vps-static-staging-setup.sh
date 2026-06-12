#!/usr/bin/env bash
set -euo pipefail

echo "=== SMARTWORK PHASE 5ZN VPS STAGING SETUP ==="

APP_DIR="/opt/smartwork-agent"
PUBLIC_DIR="$APP_DIR/public"

sudo mkdir -p "$PUBLIC_DIR"
sudo chown -R "$USER:$USER" "$APP_DIR"

echo "Public folder ready: $PUBLIC_DIR"

if command -v caddy >/dev/null 2>&1; then
  echo "Caddy exists: $(caddy version || true)"
else
  echo "Caddy not installed. Install Caddy before static staging."
fi

echo "Next from laptop:"
echo "scp -r public/* USER@103.152.242.193:/opt/smartwork-agent/public/"
echo ""
echo "Staging proof after Caddy config:"
echo "curl -I http://103.152.242.193:3108/manifest.webmanifest"
echo "curl -I http://103.152.242.193:3108/home.html"
echo "curl -I http://103.152.242.193:3108/privacy.html"