#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${SMARTWORK_REPO_URL:-https://github.com/nazrinxl-svg/smartwork-agent.git}"
BRANCH="${SMARTWORK_BRANCH:-test/ui-request-next-20260611-004522}"
APP_DIR="${SMARTWORK_APP_DIR:-/opt/smartwork-agent}"
APP_USER="${SMARTWORK_APP_USER:-smartwork}"
PORT="${SMARTWORK_PORT:-3107}"

echo "=== SmartWork DewaVPS Phase 5S first boot dry-run ==="
echo "repo=$REPO_URL"
echo "branch=$BRANCH"
echo "app_dir=$APP_DIR"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run this script as root on the VPS."
  exit 1
fi

echo "=== OS packages ==="
apt-get update
apt-get install -y git curl ca-certificates

echo "=== Node check ==="
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed. Install Node.js 20+ first, then rerun this script."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm is not installed."
  exit 1
fi
node -e "const major=Number(process.versions.node.split('.')[0]); if (major < 20) { console.error('ERROR: Node.js 20+ required. Current:', process.versions.node); process.exit(1); }"
node -v
npm -v

echo "=== App user + repo ==="
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

if [ ! -d "$APP_DIR/.git" ]; then
  rm -rf "$APP_DIR"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"

echo "=== Dry-run env ==="
if [ ! -f .env.production ]; then
  cp deploy/dewavps/.env.dry-run.example .env.production
fi

grep -E "SMARTWORK_DRY_RUN=true|SMARTWORK_NO_SIAGA_INPUT=true|SMARTWORK_NO_BROWSER_OPEN=true|SMARTWORK_NO_REAL_SAVE=true|SMARTWORK_NO_REAL_SEND=true|SMARTWORK_REAL_SAVE_ENABLED=false|SMARTWORK_EMAIL_ENABLED=false|SMARTWORK_WHATSAPP_ENABLED=false" .env.production

echo "=== Dependencies ==="
npm ci

echo "=== Project preflight ==="
npm run smartwork:dewavps:preflight
npm run brain:smartwork-guard
npm run doctor


echo "=== Runtime dirs + permissions before services ==="
mkdir -p \
  data/production-queue/pending \
  data/production-queue/running \
  data/production-queue/completed \
  data/production-queue/failed \
  data/jobs \
  intake/requests \
  reports \
  reports/downloads \
  reports/proof

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "=== Install systemd services ==="
cp deploy/dewavps/smartwork-control-server.service /etc/systemd/system/smartwork-control-server.service
cp deploy/dewavps/smartwork-production-worker.service /etc/systemd/system/smartwork-production-worker.service
systemctl daemon-reload
systemctl enable smartwork-control-server.service
systemctl enable smartwork-production-worker.service
systemctl restart smartwork-control-server.service
systemctl restart smartwork-production-worker.service

echo "=== Service health ==="
sleep 3
systemctl is-active smartwork-control-server.service
systemctl is-active smartwork-production-worker.service

echo "=== HTTP health ==="
curl -fsS "http://127.0.0.1:${PORT}/api/smartwork/jobs/health" || true

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

mkdir -p reports
cat > reports/smartwork-dewavps-phase5s-vps-first-boot-report.json <<JSON
{
  "ok": true,
  "phase": "5S",
  "releaseDecision": "DEWAVPS_FIRST_BOOT_DRY_RUN_SERVICE_STARTED",
  "safety": "dry-run/no-siaga-input/no-browser/no-real-save/no-real-send",
  "checkedAt": "$(date -Iseconds)"
}
JSON

echo "=== DONE: SmartWork DewaVPS first boot dry-run completed ==="
