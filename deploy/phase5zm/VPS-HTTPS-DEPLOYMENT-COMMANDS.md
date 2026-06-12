# SmartWork VPS HTTPS Deployment Commands

Run on VPS after DNS records point to 103.152.242.193.

## 1. Install Caddy

Ubuntu/Debian example:

sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

## 2. Prepare public folder

sudo mkdir -p /opt/smartwork-agent/public
sudo chown -R $USER:$USER /opt/smartwork-agent

## 3. Copy public folder from laptop to VPS

From laptop PowerShell, after replacing USER if needed:

scp -r public/* USER@103.152.242.193:/opt/smartwork-agent/public/

## 4. Install Caddyfile

sudo cp /opt/smartwork-agent/deploy/phase5zm/Caddyfile.smartwork-agent.id /etc/caddy/Caddyfile
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo systemctl reload caddy

## 5. Verify

curl -I https://smartwork-agent.id/manifest.webmanifest
curl -I https://smartwork-agent.id/home.html
curl -I https://smartwork-agent.id/privacy.html
curl -I https://smartwork-agent.id/.well-known/assetlinks.json
curl https://api.smartwork-agent.id/api/smartwork/jobs/health