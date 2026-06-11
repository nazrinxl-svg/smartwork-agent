#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SMARTWORK_BASE_URL:-http://127.0.0.1:3107}"
JOB_ID="vps-first-run-smoke-$(date +%Y%m%d%H%M%S)"

echo "=== SmartWork VPS First-Run Dry-Run Smoke ==="
echo "BASE_URL=$BASE_URL"
echo "JOB_ID=$JOB_ID"

echo "=== HEALTH ==="
curl -fsS "$BASE_URL/api/smartwork/jobs/health"
echo

echo "=== SUBMIT DRY-RUN JOB ==="
curl -fsS -X POST "$BASE_URL/api/smartwork/jobs" \
  -H "Content-Type: application/json" \
  -d "{
    \"jobId\": \"$JOB_ID\",
    \"type\": \"siaga-attendance\",
    \"dryRun\": true,
    \"source\": \"vps-first-run-dry-run-smoke\",
    \"request\": {
      \"teacherId\": \"guru-001\",
      \"name\": \"Nazrin\",
      \"startDate\": \"2026-06-22\",
      \"endDate\": \"2026-06-27\"
    },
    \"safety\": {
      \"noSiagaInput\": true,
      \"noBrowserOpen\": true,
      \"noRealSave\": true,
      \"noRealSend\": true
    }
  }"
echo

echo "=== POLL JOB STATUS ==="
for i in $(seq 1 30); do
  STATUS_JSON="$(curl -fsS "$BASE_URL/api/smartwork/jobs/$JOB_ID")"
  echo "$STATUS_JSON"

  if echo "$STATUS_JSON" | grep -E '"status"[[:space:]]*:[[:space:]]*"(completed|failed)"' >/dev/null; then
    break
  fi

  sleep 2
done

echo "=== FINAL JOB CHECK ==="
FINAL_JSON="$(curl -fsS "$BASE_URL/api/smartwork/jobs/$JOB_ID")"
echo "$FINAL_JSON"

echo "$FINAL_JSON" | grep -E '"status"[[:space:]]*:[[:space:]]*"completed"' >/dev/null || {
  echo "Dry-run job did not complete."
  exit 1
}

echo "SmartWork VPS first-run dry-run smoke OK."

