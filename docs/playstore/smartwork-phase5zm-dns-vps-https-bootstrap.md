# SmartWork Agent Phase 5ZM - DNS + VPS HTTPS Deployment Bootstrap

## Current blocker

Phase 5ZL verified that these DNS names do not exist yet:

- smartwork-agent.id
- api.smartwork-agent.id

Real TWA/AAB build must wait until both HTTPS endpoints are live.

## Required DNS records

Create these A records at the domain/DNS provider:

- smartwork-agent.id -> 103.152.242.193
- api.smartwork-agent.id -> 103.152.242.193

TTL recommendation:

- 300 seconds during setup
- 3600 seconds after stable

## Required VPS services

- SmartWork API running on localhost port 3107
- Caddy or Nginx reverse proxy
- HTTPS certificates issued automatically by Caddy or via Let's Encrypt
- Public static web folder at /opt/smartwork-agent/public

## Required live checks after deployment

- https://smartwork-agent.id/manifest.webmanifest
- https://smartwork-agent.id/home.html
- https://smartwork-agent.id/privacy.html
- https://smartwork-agent.id/.well-known/assetlinks.json
- https://api.smartwork-agent.id/api/smartwork/jobs/health

## Safety

This phase creates deployment bootstrap files only. It does not perform SIAGA input, real save, real send, AAB build, or Play Store upload.