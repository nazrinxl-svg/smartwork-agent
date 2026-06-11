#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SMARTWORK_BASE_URL:-http://127.0.0.1:3107}"

echo "=== SmartWork VPS Dry-Run Service Verify ==="
echo "BASE_URL=$BASE_URL"

echo "Health:"
curl -fsS "$BASE_URL/api/smartwork/jobs/health"
echo

echo "Jobs:"
curl -fsS "$BASE_URL/api/smartwork/jobs"
echo

if command -v pm2 >/dev/null 2>&1; then
  pm2 status
fi

echo "Verify done."

