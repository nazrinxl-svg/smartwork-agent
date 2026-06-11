# SMARTWORK AGENT BRAIN DIRECTION LOCK

## Final Direction

SmartWork Agent is not a local laptop script.

The final product target is a 24/7 server/cloud/VPS worker that can run without the user's local laptop staying on.

## Final Product Flow

1. User opens mobile/web app.
2. User selects a module such as SIAGA, e-Kinerja, or another work/admin service.
3. User submits a request with account, date range, notes, and delivery target.
4. Backend queue stores the request.
5. Cloud worker detects the request automatically.
6. Agent module runs the workflow:
   - login
   - navigate
   - fill/edit if needed
   - verify completion
   - download PDF/proof
   - write proof report
7. App progress/history updates to completed 100%.
8. User retrieves result from the app.

## Local Prototype Role

Local watcher/runner is only a prototype and end-to-end proof tool.

Local is used to prove:
- UI request can be promoted
- worker can detect request
- SIAGA/e-Kinerja module can run
- verification works
- PDF/proof artifacts are created
- app progress can read canonical 100%

After local end-to-end is stable, move to production worker/VPS/cloud.

## Brain Rules

- Do not restart from zero.
- Do not re-input dates already verified as already_filled_verified.
- Do not chase profile/CDP/login loops if save evidence proves the job is already complete.
- Active request range must be respected.
- Finalizer must filter only active request range.
- UI must read canonical app artifacts/progress source.
- Old failed watcher reports must not override verified completion.
- After canonical local pipeline is stable, continue to Production Worker/VPS 24/7.

## Current Checkpoint Doctrine

For request 2026-06-22..2026-06-27:
- Do not input SIAGA again.
- Save evidence already indicates the dates are filled.
- Current task is finalize/reconcile reports only.
- Then commit checkpoint.
- Then move to Production Worker/VPS 24/7.
