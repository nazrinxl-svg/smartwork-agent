# SmartWork VPS First-run Commands

Run on VPS after cloning repo to /opt/smartwork-agent.

1. Create environment file from example.

cp configs/.env.production.example .env.production.local

2. Keep first run safe.

SMARTWORK_DRY_RUN=true
SMARTWORK_REAL_SAVE_ENABLED=false
SMARTWORK_REAL_SEND_ENABLED=false

3. Run checks.

npm install
npm run brain
npm run prod:env:guard
npm run prod:brain
npm run prod:worker:once
npm run prod:health
npm run prod:queue:check
npm run prod:deploy:check
npm run prod:vps:first-run

4. Start daemon only after all dry-run checks pass.

npm run prod:worker:daemon

Safety:
Do not put real credentials in git.
Do not enable real save until queue, health, progress, and artifacts are stable.
