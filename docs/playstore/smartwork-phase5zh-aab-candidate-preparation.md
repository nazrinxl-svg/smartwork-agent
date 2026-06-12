# SmartWork Agent Phase 5ZH - AAB Candidate Preparation

Goal:
Prepare SmartWork Agent for generating an Android App Bundle using the Trusted Web Activity path.

Current chain:
- 5ZC VPS app browser E2E proof ready.
- 5ZD phone/public-like VPS proof ready.
- 5ZE PWA installability ready.
- 5ZF public API HTTPS/CORS readiness ready.
- 5ZG Android/TWA wrapper readiness ready.

Selected Android path:
Trusted Web Activity.

Package:
id.smartwork.agent

App name:
SmartWork Agent

Required before real AAB build:
- JDK installed.
- Android SDK installed.
- Bubblewrap or compatible TWA tooling installed.
- Real HTTPS web domain deployed.
- Real HTTPS API domain deployed.
- assetlinks.json published with release cert SHA-256.
- Release keystore or Play App Signing configured.
- Privacy policy URL ready.
- Play Store listing assets ready.

Safety:
This phase does not upload to Play Store and does not perform SIAGA input, browser automation, real save, or real send.