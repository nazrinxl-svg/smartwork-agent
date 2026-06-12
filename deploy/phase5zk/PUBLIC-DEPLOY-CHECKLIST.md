# SmartWork Public Deployment Checklist

1. Point DNS A record:
   smartwork-agent.id -> 103.152.242.193

2. Point DNS A record:
   api.smartwork-agent.id -> 103.152.242.193

3. Copy public folder to VPS:
   /opt/smartwork-agent/public

4. Configure HTTPS reverse proxy using Caddy or Nginx.

5. Verify web:
   https://smartwork-agent.id/manifest.webmanifest
   https://smartwork-agent.id/home.html
   https://smartwork-agent.id/privacy.html
   https://smartwork-agent.id/.well-known/assetlinks.json

6. Verify API:
   https://api.smartwork-agent.id/api/smartwork/jobs/health

7. Replace assetlinks fingerprint after release keystore is known.

8. Run TWA build only after all checks pass.