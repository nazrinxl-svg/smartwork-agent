# SmartWork Agent Phase 5ZK - Public Domain Deployment Readiness

## Target domains

Web app:
https://smartwork-agent.id

API:
https://api.smartwork-agent.id

## Required DNS

A records:

- smartwork-agent.id -> VPS public IP
- api.smartwork-agent.id -> VPS public IP

Current VPS public IP:

- 103.152.242.193

## Required public paths

- https://smartwork-agent.id/home.html
- https://smartwork-agent.id/request.html
- https://smartwork-agent.id/progress.html
- https://smartwork-agent.id/manifest.webmanifest
- https://smartwork-agent.id/privacy.html
- https://smartwork-agent.id/.well-known/assetlinks.json
- https://api.smartwork-agent.id/api/smartwork/jobs/health

## Before real AAB

- Replace assetlinks SHA-256 placeholder with real release certificate fingerprint.
- Confirm privacy page is live.
- Confirm API health is live via HTTPS.
- Confirm manifest is live via HTTPS.
- Confirm production CORS allows the web origin.
- Then run Bubblewrap init/build.

## Safety

This phase creates deployment readiness files only. It does not perform SIAGA input, real save, real send, AAB build, or Play Store upload.