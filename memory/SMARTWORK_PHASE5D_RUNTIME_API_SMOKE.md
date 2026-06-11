# SmartWork Phase 5D — Runtime API Smoke Test

Status: prepared.

Purpose:
- Start local native HTTP control server in dry-run mode.
- Test `/api/smartwork/jobs/health`.
- Create dry-run production job.
- Validate lifecycle: pending -> running -> completed.
- Validate no SIAGA input, no browser open, no real save/send.

This runtime smoke script is intentionally not appended to `npm run brain`,
because it starts a local server and creates smoke-test queue files.
Brain keeps static/syntax/contract guards.
