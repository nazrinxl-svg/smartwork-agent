# SmartWork Agent Phase 5ZJ - TWA Init Preflight Pack

Goal:
Prepare the exact Trusted Web Activity init/build route before generating the real Android project.

Current status:
- PWA installability ready.
- Public API HTTPS/CORS readiness pack ready.
- Android wrapper decision ready.
- AAB candidate prep ready.
- Android build environment ready for TWA init.

Important blocker:
The real public HTTPS web domain must be live before real bubblewrap init/build:
https://smartwork-agent.id/manifest.webmanifest

Real build commands later:
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://smartwork-agent.id/manifest.webmanifest
bubblewrap build

Safety:
This phase does not upload to Play Store, does not build/sign a real AAB, and performs no SIAGA action.