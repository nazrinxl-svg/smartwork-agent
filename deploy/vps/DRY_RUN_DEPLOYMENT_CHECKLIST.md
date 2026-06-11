# SmartWork VPS Dry-run Deployment Checklist

Local preconditions:
- npm run brain passes
- npm run prod:brain passes
- npm run prod:worker:once passes
- npm run prod:health passes
- npm run prod:queue:check passes
- npm run prod:deploy:check passes

VPS preconditions:
- Linux VPS ready
- Node.js installed
- Git installed
- Chrome/Chromium installed later when browser module is enabled
- Repo cloned to /opt/smartwork-agent
- .env.production.local created from configs/.env.production.example
- SMARTWORK_DRY_RUN=true for first VPS test
- SMARTWORK_REAL_SAVE_ENABLED=false for first VPS test
- SMARTWORK_REAL_SEND_ENABLED=false for first VPS test

First VPS dry-run commands:
cd /opt/smartwork-agent
npm install
npm run prod:brain
npm run prod:worker:once
npm run prod:health
npm run prod:queue:check
npm run prod:deploy:check

Safety:
Do not set SMARTWORK_REAL_SAVE_ENABLED=true until VPS dry-run queue, health, artifact, and progress reporting are stable.
