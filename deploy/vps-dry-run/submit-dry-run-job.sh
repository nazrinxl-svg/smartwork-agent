#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SMARTWORK_BASE_URL:-http://127.0.0.1:3107}"

JOB_ID="vps-dry-run-$(date +%Y%m%d%H%M%S)"

echo "Submitting safe dry-run job: $JOB_ID"

curl -fsS -X POST "$BASE_URL/api/smartwork/jobs" \
  -H "Content-Type: application/json" \
  -d "{
    \"jobId\": \"$JOB_ID\",
    \"type\": \"siaga-attendance\",
    \"dryRun\": true,
    \"source\": \"vps-dry-run-submit-script\",
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
echo "Submitted. Check:"
echo "$BASE_URL/api/smartwork/jobs/$JOB_ID"

