# SmartWork TWA Build Command Template

Run only after real HTTPS app/API domains are ready.

1. Install Bubblewrap:
npm install -g @bubblewrap/cli

2. Initialize TWA project:
bubblewrap init --manifest https://smartwork-agent.id/manifest.webmanifest

3. Build Android App Bundle:
bubblewrap build

Expected output:
app-release-bundle.aab

Before upload:
- Verify package name: id.smartwork.agent
- Verify launcher name: SmartWork Agent
- Verify release signing
- Verify assetlinks.json
- Verify privacy policy URL
- Verify Data Safety answers
- Verify screenshots
- Upload AAB manually to Play Console