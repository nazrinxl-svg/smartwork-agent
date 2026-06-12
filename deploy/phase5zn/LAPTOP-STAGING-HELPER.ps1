# SmartWork Phase 5ZN laptop staging helper.
# Replace $VpsUser if the VPS SSH user is not root.

$VpsUser = "root"
$VpsHost = "103.152.242.193"

Write-Host "=== SMARTWORK 5ZN LAPTOP STAGING HELPER ==="

Write-Host "1) Prepare remote folder"
ssh "$VpsUser@$VpsHost" "mkdir -p /opt/smartwork-agent/public /opt/smartwork-agent/deploy/phase5zn"

Write-Host "2) Copy public app"
scp -r public/* "$VpsUser@$VpsHost:/opt/smartwork-agent/public/"

Write-Host "3) Copy staging Caddyfile"
scp deploy/phase5zn/Caddyfile.static-ip-staging.example "$VpsUser@$VpsHost:/opt/smartwork-agent/deploy/phase5zn/Caddyfile.static-ip-staging.example"

Write-Host "4) Verify existing API"
Invoke-WebRequest "http://103.152.242.193:3107/api/smartwork/jobs/health" -UseBasicParsing

Write-Host "5) Static staging endpoint requires Caddy route on port 3108 before it responds:"
Write-Host "http://103.152.242.193:3108/home.html"