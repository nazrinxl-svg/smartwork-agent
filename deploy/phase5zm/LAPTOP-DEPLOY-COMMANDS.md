# SmartWork Laptop Deployment Helper Commands

Run from laptop PowerShell after DNS is configured and SSH user is known.

Variables:

$VpsUser = "root"
$VpsHost = "103.152.242.193"

Copy public app:

scp -r public/* "$VpsUser@$VpsHost:/opt/smartwork-agent/public/"

Copy phase5zm deploy files:

ssh "$VpsUser@$VpsHost" "mkdir -p /opt/smartwork-agent/deploy/phase5zm"
scp deploy/phase5zm/Caddyfile.smartwork-agent.id "$VpsUser@$VpsHost:/opt/smartwork-agent/deploy/phase5zm/Caddyfile.smartwork-agent.id"

Reload Caddy on VPS:

ssh "$VpsUser@$VpsHost" "cp /opt/smartwork-agent/deploy/phase5zm/Caddyfile.smartwork-agent.id /etc/caddy/Caddyfile && caddy fmt --overwrite /etc/caddy/Caddyfile && systemctl reload caddy"

Verify from laptop:

Invoke-WebRequest https://smartwork-agent.id/manifest.webmanifest -UseBasicParsing
Invoke-WebRequest https://smartwork-agent.id/privacy.html -UseBasicParsing
Invoke-WebRequest https://api.smartwork-agent.id/api/smartwork/jobs/health -UseBasicParsing