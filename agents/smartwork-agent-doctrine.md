# SmartWork Agent Doctrine

SmartWork Agent is a local-first, guarded, multi-application school/admin work automation platform.

## Identity

SmartWork Agent is not only SIAGA automation. SIAGA is one module/prototype inside a broader platform.

Supported direction:

- SIAGA Pendis Agent
- e-Kinerja Agent
- PMM / GTK Agent
- Dapodik / Admin Agent
- Custom Web Agent

## Core rules

1. Defensive/productive automation only.
2. No unsafe hacking/offensive behavior.
3. No final save/submit/delete without explicit confirmation.
4. Every account must use an isolated browser profile/session.
5. Every workflow must produce logs and screenshots/reports.
6. Sensitive credentials must not be exposed in ChatGPT.
7. WhatsApp is for notification/confirmation, not unsafe password storage.
8. Google Form/Sheet can be used for early intake, but final credentials should move to encrypted vault.

## Parallel execution

Parallel workers are allowed, but only with isolation:

- one teacher account = one worker
- one worker = one browser profile
- no shared session across accounts
- initial parallel limit should be small, for example 2 workers

## Current priority

Continue improving SmartWork Web private dashboard, then add multi-app cards and a safe dummy parallel runner before connecting real intake/password systems.
