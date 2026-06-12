# SmartWork Agent Phase 5ZN - Domain-Agnostic VPS Deploy Proof Pack

## Goal

Prepare a safe VPS public app deployment proof that does not depend on the final domain yet.

## Why this phase exists

Phase 5ZL confirmed the final domains do not exist yet:

- smartwork-agent.id
- api.smartwork-agent.id

Phase 5ZM prepared DNS/VPS HTTPS deployment files.

Phase 5ZN prepares domain-agnostic deployment helpers so the app can be staged on VPS while final DNS is pending.

## Important rule

This does not unlock Play Store/TWA real build. TWA/AAB still requires real HTTPS domain and valid assetlinks.

## Safe proof target

- Existing VPS IP: 103.152.242.193
- Existing API health endpoint: http://103.152.242.193:3107/api/smartwork/jobs/health
- Static app target folder: /opt/smartwork-agent/public

## Safety

This phase does not perform SIAGA input, real save, real send, AAB build, or Play Store upload.