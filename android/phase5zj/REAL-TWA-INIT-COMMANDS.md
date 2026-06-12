# SmartWork TWA Real Init Commands

Run these only after these URLs are live:

- https://smartwork-agent.id/manifest.webmanifest
- https://smartwork-agent.id/home.html
- https://api.smartwork-agent.id/api/smartwork/jobs/health

Commands:

npm install -g @bubblewrap/cli

bubblewrap init --manifest https://smartwork-agent.id/manifest.webmanifest

bubblewrap build

Expected output:
app-release-bundle.aab

Do not upload to Play Store until:
- assetlinks.json is published
- release certificate SHA-256 is known
- privacy policy is live
- store listing is ready
- Data Safety answers are ready