#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SMARTWORK_BASE_URL:-http://127.0.0.1:3107}"

echo "Checking SmartWork dry-run health at $BASE_URL"

curl -fsS "$BASE_URL/api/smartwork/jobs/health"
echo
echo "Healthcheck OK."

