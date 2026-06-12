# SmartWork Agent Android/TWA Build Notes

This is the next implementation direction after Phase 5ZG readiness:

1. Deploy the web app to HTTPS domain.
2. Deploy/route API to HTTPS domain.
3. Generate Android TWA project using Bubblewrap or equivalent.
4. Set package name: `id.smartwork.agent`.
5. Configure launcher name: `SmartWork Agent`.
6. Configure start URL: `https://smartwork-agent.id/home.html`.
7. Generate release keystore or use Play App Signing.
8. Generate SHA-256 certificate fingerprint.
9. Publish assetlinks.json to `https://smartwork-agent.id/.well-known/assetlinks.json`.
10. Build signed AAB.
11. Prepare Play Console listing, privacy policy, Data Safety, screenshots.
12. Upload AAB manually to Play Console.

No Play Store upload is performed by this phase.
