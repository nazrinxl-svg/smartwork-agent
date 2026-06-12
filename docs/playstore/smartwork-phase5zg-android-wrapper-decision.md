# SmartWork Agent Phase 5ZG — Android Wrapper Decision + TWA Skeleton

## Decision

Recommended first Play Store path: **Trusted Web Activity (TWA)**.

Reason:

- Phase 5ZE already proves SmartWork is installable as PWA.
- TWA keeps the app source as the public web app.
- Android wrapper can be lightweight.
- Future Play Store path can use the same deployed HTTPS app.
- Capacitor remains fallback if native plugins/offline packaged assets are required.

## Required before production AAB

- Public HTTPS web app URL, for example `https://smartwork-agent.id`
- Public HTTPS API URL, for example `https://api.smartwork-agent.id`
- Digital Asset Links at:
  - `https://smartwork-agent.id/.well-known/assetlinks.json`
- Android package name, proposed:
  - `id.smartwork.agent`
- App name:
  - `SmartWork Agent`
- PWA manifest:
  - `display: standalone`
  - `start_url: /home.html`
  - 192/512 icons
- Privacy policy URL
- Play Store listing text and screenshots
- Release signing key / Play App Signing

## Safety invariant

This phase creates wrapper-readiness files only. It does not build/sign/upload an app and performs no SIAGA action.
