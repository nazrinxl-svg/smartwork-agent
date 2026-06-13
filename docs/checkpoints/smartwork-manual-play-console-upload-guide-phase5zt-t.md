# SmartWork Agent - Manual Play Console Upload Guide

Phase: 5ZT-T  
Status: Upload guide ready. Upload not performed by script.

## Final AAB to upload manually

Use this local file:

\\\
D:\1. myapps\smartwork-agent\release-local\play-console\smartwork-agent-final-aab\smartwork-agent-final-release-b1f8.aab
\\\

AAB SHA256 file hash:

\\\
D2AA6B061FB1D104BC0A52AB316B9E3B37ECBC3BD9F0964C8E95AE8CA728AD89
\\\

## App identity

Package name:

\\\
id.smartwork.agent
\\\

App name:

\\\
SmartWork Agent
\\\

Domain:

\\\
smartwork-agent.id
\\\

Assetlinks fingerprint:

\\\
B1:F8:2E:EE:48:39:16:F5:33:6D:FB:29:29:6E:5F:2B:81:72:AC:F9:9B:FF:A5:69:A5:56:DB:60:92:62:80:9F
\\\

## Backup location

Keystore and AAB backup folder:

\\\
D:\SmartWork-Release-Backup\smartwork-agent-release-20260613-100421
\\\

Important:
- Keep ndroid.keystore safe.
- Keep the keystore password private.
- Never commit keystore, AAB, APK, or backup folder.

## Manual upload checklist

1. Open Google Play Console manually.
2. Select or create app: SmartWork Agent.
3. Confirm package name is exactly id.smartwork.agent.
4. Upload only the final AAB:
   smartwork-agent-final-release-b1f8.aab
5. Do not upload APK as production release.
6. Complete store listing, app category, contact email, privacy policy, data safety, content rating, and target audience forms.
7. For first release, use internal testing first before production.
8. After Play Console accepts the AAB, do not delete the local keystore backup.
9. Stop before production rollout if Play Console shows package/signing mismatch.

## Current safety status

- Final AAB built locally.
- Assetlinks public verified.
- Keystore backed up locally.
- AAB handoff folder ready.
- No Play Store upload performed by automation.
