# SMARTWORK PRODUCTION WORKER BLUEPRINT

## Final Target

SmartWork Agent final target is a 24/7 production worker running on VPS/cloud/server.

It must not depend on the user's local laptop staying on.

## Production Flow

1. User submits request from mobile/web app.
2. Backend creates a job in request queue.
3. Production worker runs continuously as a service.
4. Worker claims one pending job.
5. Worker validates account/module/date range.
6. Worker routes job to module:
   - SIAGA Agent
   - e-Kinerja Agent
   - future modules
7. Worker runs guarded browser automation.
8. Worker verifies completion.
9. Worker downloads/generates artifacts:
   - PDF
   - proof report
   - screenshots/logs
10. Worker writes canonical progress.
11. App reads progress/history/artifacts.
12. User downloads result from app.

## Local vs Production

Local watcher is prototype only.

Production worker must use:
- queue-based job intake
- service auto-start
- isolated browser profile
- credential-safe runtime
- canonical progress reports
- retry policy
- artifact storage
- no repeated input for verified dates
- no local-laptop dependency

## Production Safety Rules

- Never commit real credentials.
- Never input already_filled_verified dates again.
- Never let stale failed watcher report override canonical verified completion.
- Worker must be idempotent.
- Worker must be able to resume after crash.
- Worker must write one canonical source of truth for UI progress.
- Real submit/save/delete actions must follow module guard policy.
- Reports must separate:
  - job status
  - business result
  - browser/runtime result
  - artifacts result

## Current State

Local prototype has proven:
- UI request can be detected/promoted.
- Worker flow can process request.
- SIAGA 2026-06-22..2026-06-27 finalized as Hasil Siap 100.
- Brain Guard passes.
- Checkpoint pushed: 5c0ce91.

Next step:
Build production worker foundation, then deploy to VPS/cloud.
